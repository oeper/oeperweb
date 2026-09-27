  /* ---------- More edits: rotate, delete, insert, header/footer, stamp, crop, flatten ---------- */
  const friendly = (msg) => { const e = new Error(msg); e.friendly = true; return e; };
  const rangeOrThrow = (v) => { try { return PT.parsePageRanges(v, currentFile.pageCount); } catch (err) { throw friendly(err.message); } };
  const save = async (doc, suffix) => { const bytes = await doc.save(); PT.downloadBlob(bytes, `${PT.baseName(currentFile.name)}_${suffix}.pdf`, 'application/pdf'); };

  async function runRotate() {
    const idx = rangeOrThrow($('edit-rot-range').value), ang = parseInt($('edit-rot-angle').value, 10);
    const doc = await PDFLib.PDFDocument.load(currentFile.arrayBuffer, PT.LOAD_OPTS);
    idx.forEach(i => { const p = doc.getPage(i); p.setRotation(PDFLib.degrees(((p.getRotation().angle || 0) + ang) % 360)); });
    await save(doc, 'rotated');
  }
  async function runDelete() {
    if (!$('edit-del-range').value.trim()) throw friendly('Enter the pages you want to delete, e.g. 2, 5-7.');
    const idx = rangeOrThrow($('edit-del-range').value);
    if (idx.length >= currentFile.pageCount) throw friendly('That would delete every page. Keep at least one.');
    const doc = await PDFLib.PDFDocument.load(currentFile.arrayBuffer, PT.LOAD_OPTS);
    [...idx].sort((a, b) => b - a).forEach(i => doc.removePage(i));
    await save(doc, 'trimmed');
  }
  async function runInsert() {
    const after = parseInt($('edit-ins-after').value, 10), n = Math.min(100, Math.max(1, parseInt($('edit-ins-count').value, 10) || 1));
    if (!(after >= 0 && after <= currentFile.pageCount)) throw friendly(`"After page" must be between 0 and ${currentFile.pageCount}.`);
    const doc = await PDFLib.PDFDocument.load(currentFile.arrayBuffer, PT.LOAD_OPTS);
    const ref = doc.getPage(Math.max(0, after - 1)).getSize();
    for (let k = 0; k < n; k++) doc.insertPage(after + k, [ref.width, ref.height]);
    await save(doc, 'with-blank-pages');
  }
  function hexRgb(hex) { const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) || [0, '55', '55', '55']; return PDFLib.rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255); }
  async function runHeaderFooter() {
    const head = $('edit-hf-header').value, foot = $('edit-hf-footer').value;
    if (!head.trim() && !foot.trim()) throw friendly('Enter header or footer text.');
    const idx = rangeOrThrow($('edit-hf-range').value), size = Math.min(36, Math.max(5, parseFloat($('edit-hf-size').value) || 9));
    const doc = await PDFLib.PDFDocument.load(currentFile.arrayBuffer, PT.LOAD_OPTS);
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica), color = hexRgb($('edit-hf-color').value), align = $('edit-hf-align').value;
    const title = (() => { try { return doc.getTitle() || PT.baseName(currentFile.name); } catch (e) { return PT.baseName(currentFile.name); } })();
    const fill = (t, i) => t.replace(/\{page\}/g, i + 1).replace(/\{total\}/g, currentFile.pageCount).replace(/\{date\}/g, new Date().toLocaleDateString()).replace(/\{title\}/g, title)
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
    idx.forEach(i => {
      const p = doc.getPage(i), { width, height } = p.getSize();
      [[head, height - 28 - size], [foot, 24]].forEach(([t, y]) => {
        if (!t.trim()) return; const s = fill(t, i); let w; try { w = font.widthOfTextAtSize(s, size); } catch (e) { throw friendly('Header and footer text can only use standard Latin characters.'); }
        const x = align === 'left' ? 36 : align === 'right' ? width - 36 - w : (width - w) / 2;
        p.drawText(s, { x, y, size, font, color });
      });
    });
    await save(doc, 'header-footer');
  }
  /* image stamp */
  let stampData = null, stampPos = 'bottom-right';
  const stampPreview = $('edit-st-preview');
  function setStamp(dataUrl) { stampData = dataUrl; stampPreview.src = dataUrl; stampPreview.hidden = false; }
  $('edit-st-pick').addEventListener('click', () => $('edit-st-file').click());
  $('edit-st-file').addEventListener('change', () => { const f = $('edit-st-file').files[0]; $('edit-st-file').value = ''; if (!f) return; const r = new FileReader(); r.onload = () => setStamp(r.result); r.readAsDataURL(f); });
  $('edit-st-draw').addEventListener('click', async () => { const d = await Suite.signaturePad(); if (d) setStamp(d); });
  $('edit-st-posGrid').addEventListener('click', (e) => { const c = e.target.closest('.pos-cell'); if (!c) return; [...$('edit-st-posGrid').children].forEach(x => x.classList.toggle('active', x === c)); stampPos = c.dataset.pos; });
  $('edit-st-opacity').addEventListener('input', () => { $('edit-st-opacityValue').textContent = $('edit-st-opacity').value + '%'; });
  async function runStamp() {
    if (!stampData) throw friendly('Choose an image or draw a signature first.');
    const idx = rangeOrThrow($('edit-st-range').value);
    const doc = await PDFLib.PDFDocument.load(currentFile.arrayBuffer, PT.LOAD_OPTS);
    const img = /^data:image\/png/.test(stampData) ? await doc.embedPng(stampData) : await doc.embedJpg(stampData);
    const W = Math.max(20, parseFloat($('edit-st-width').value) || 140), H = W * img.height / img.width, m = Math.max(0, parseFloat($('edit-st-margin').value) || 0), op = (parseFloat($('edit-st-opacity').value) || 100) / 100;
    idx.forEach(i => { const p = doc.getPage(i), { width, height } = p.getSize();
      const x = stampPos.endsWith('left') ? m : stampPos.endsWith('right') ? width - m - W : (width - W) / 2, y = stampPos.startsWith('top') ? height - m - H : m;
      p.drawImage(img, { x, y, width: W, height: H, opacity: op }); });
    await save(doc, 'stamped');
  }
  async function runCrop() {
    const idx = rangeOrThrow($('edit-crop-range').value), v = id => Math.max(0, parseFloat($(id).value) || 0);
    const t = v('edit-crop-t'), b = v('edit-crop-b'), l = v('edit-crop-l'), r = v('edit-crop-r');
    const doc = await PDFLib.PDFDocument.load(currentFile.arrayBuffer, PT.LOAD_OPTS);
    idx.forEach(i => { const p = doc.getPage(i), { width, height } = p.getSize();
      if (l + r >= width - 10 || t + b >= height - 10) throw friendly(`Those margins are bigger than page ${i + 1}.`);
      p.setCropBox(l, b, width - l - r, height - t - b); });
    await save(doc, 'cropped');
  }
  async function runFlatten() {
    const doc = await PDFLib.PDFDocument.load(currentFile.arrayBuffer, PT.LOAD_OPTS);
    let n = 0; try { n = doc.getForm().getFields().length; } catch (e) { n = 0; }
    if (!n) throw friendly('This PDF has no form fields to flatten.');
    doc.getForm().flatten();
    await save(doc, 'flattened');
  }
  function checkFormFields() {
    if (!currentFile || mode !== 'flatten') return;
    let n = 0; try { n = currentFile.doc.getForm().getFields().length; } catch (e) { n = 0; }
    PT.banner($('edit-fl-banner'), n ? 'info' : 'warn', n ? `Found ${PT.plural(n, 'form field')}.` : 'No form fields found in this PDF.');
    applyBtn.disabled = !n;
  }
