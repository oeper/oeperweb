/* ============================================================
   COMPRESS
   ============================================================ */
(function () {
  const dropzone = $('cmp-dropzone'), fileInput = $('cmp-fileInput');
  const fileSummary = $('cmp-fileSummary'), fileNameEl = $('cmp-fileName'), fileSubEl = $('cmp-fileSub');
  const uploadError = $('cmp-uploadError'), optionsCard = $('cmp-optionsCard'), actionCard = $('cmp-actionCard'), resultsCard = $('cmp-resultsCard');
  const levelChips = $('cmp-levelChips'), levelHint = $('cmp-levelHint'), rasterOpts = $('cmp-rasterOpts'), losslessOpts = $('cmp-losslessOpts');
  const dpi = $('cmp-dpi'), quality = $('cmp-quality'), qualityValue = $('cmp-qualityValue'), gray = $('cmp-gray'), stripMeta = $('cmp-stripMeta');
  const goBtn = $('cmp-goBtn'), goLabel = $('cmp-goBtnLabel'), errBox = $('cmp-error'), resultBanner = $('cmp-resultBanner');
  const progress = PT.makeProgress($('cmp-progressWrap'), $('cmp-progressFill'), $('cmp-progressLabel'));
  const LEVELS = {
    strong: { dpi: 72, q: 50, hint: 'Smallest file. Fine for reading on a screen; photos get noticeably softer.' },
    recommended: { dpi: 110, q: 70, hint: 'Good balance of size and quality for sharing and email.' },
    light: { dpi: 150, q: 85, hint: 'Keeps pages sharp. Saves less space.' },
    lossless: { hint: 'Keeps text selectable and quality untouched. Works best on files that weren’t optimised when they were made.' }
  };
  let current = null, level = 'recommended', result = null;

  const dz = PT.setupDropzone(dropzone, fileInput, (files) => handleFile(files[0]));
  $('cmp-changeFileBtn').addEventListener('click', () => { reset(); dz.open(); });
  function reset() { current = null; result = null; fileSummary.hidden = true; dropzone.hidden = false; optionsCard.hidden = true; actionCard.hidden = true; resultsCard.hidden = true; PT.clearBanner(uploadError); PT.clearBanner(errBox); }
  async function handleFile(file) {
    PT.clearBanner(uploadError); resultsCard.hidden = true;
    if (!PT.isPdf(file)) { PT.banner(uploadError, 'error', "That file doesn't look like a PDF. Please choose a .pdf file."); return; }
    try {
      current = await PT.loadPdfFile(file);
      fileNameEl.textContent = current.name; fileSubEl.textContent = `${PT.plural(current.pageCount, 'page')} · ${PT.formatBytes(current.size)}`;
      dropzone.hidden = true; fileSummary.hidden = false; optionsCard.hidden = false; actionCard.hidden = false;
    } catch (err) { console.error(err); PT.banner(uploadError, 'error', "Couldn't read that PDF — it may be corrupted or password-protected."); }
  }
  levelChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    [...levelChips.children].forEach(c => c.classList.toggle('active', c === chip));
    level = chip.dataset.level; const L = LEVELS[level]; levelHint.textContent = L.hint;
    rasterOpts.hidden = level === 'lossless'; losslessOpts.hidden = level !== 'lossless';
    if (L.dpi) { dpi.value = String(L.dpi); quality.value = L.q; qualityValue.textContent = L.q + '%'; }
  });
  quality.addEventListener('input', () => { qualityValue.textContent = quality.value + '%'; });

  goBtn.addEventListener('click', async () => {
    if (!current) return;
    PT.clearBanner(errBox); PT.clearBanner(resultBanner); resultsCard.hidden = true;
    PT.busy(goBtn, goLabel, 'Compressing…');
    try {
      let bytes;
      if (level === 'lossless') {
        progress.start('Rewriting the file…');
        const doc = await PDFLib.PDFDocument.load(current.arrayBuffer, PT.LOAD_OPTS);
        if (stripMeta.checked) { doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setCreator(''); doc.setProducer(''); }
        bytes = await doc.save({ useObjectStreams: true });
      } else {
        const scale = parseInt(dpi.value, 10) / 72, q = parseInt(quality.value, 10) / 100;
        progress.start(`Page 1 of ${current.pageCount}…`);
        const pdfjs = await PT.loadPdfJs();
        const src = await pdfjs.getDocument({ data: current.arrayBuffer.slice(0) }).promise;
        const out = await PDFLib.PDFDocument.create();
        for (let p = 1; p <= src.numPages; p++) {
          const page = await src.getPage(p);
          const vp1 = page.getViewport({ scale: 1 });
          const canvas = await PT.renderPageToCanvas(page, vp1.width * scale);
          const g = canvas.getContext('2d');
          g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); g.globalCompositeOperation = 'source-over';
          if (gray.checked) {
            const img = g.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
            for (let i = 0; i < d.length; i += 4) { const y = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114; d[i] = d[i + 1] = d[i + 2] = y; }
            g.putImageData(img, 0, 0);
          }
          const blob = await PT.canvasToBlob(canvas, 'image/jpeg', q);
          const jpg = await out.embedJpg(await blob.arrayBuffer());
          const pg = out.addPage([vp1.width, vp1.height]);
          pg.drawImage(jpg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
          progress.set(p, src.numPages, p < src.numPages ? `Page ${p + 1} of ${src.numPages}…` : 'Finalizing…');
          await PT.yieldToUi();
        }
        bytes = await out.save({ useObjectStreams: true });
      }
      result = bytes;
      const saved = current.size - bytes.length, pct = Math.round(saved / current.size * 100);
      $('cmp-before').textContent = PT.formatBytes(current.size); $('cmp-after').textContent = PT.formatBytes(bytes.length);
      $('cmp-saved').textContent = saved > 0 ? `${pct}%` : '0%';
      if (saved <= 0) PT.banner(resultBanner, 'warn', 'This file is already about as small as it gets at this level — the result isn’t any smaller. Try a stronger level, or keep the original.');
      else PT.banner(resultBanner, 'info', `Saved ${PT.formatBytes(saved)}.`);
      resultsCard.hidden = false; resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      console.error(err);
      PT.banner(errBox, 'error', 'Compression failed. Very large pages at high resolution can run out of memory — try a lower resolution.');
    } finally { PT.unbusy(goBtn, goLabel, 'Compress PDF', false); progress.done(); }
  });
  $('cmp-downloadBtn').addEventListener('click', () => { if (result) PT.downloadBlob(result, `${PT.baseName(current.name)}_compressed.pdf`, 'application/pdf'); });
})();
