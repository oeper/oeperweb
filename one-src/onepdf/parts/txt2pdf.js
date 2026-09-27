
  /* ---------- Text to PDF ---------- */
  (function () {
    const text = $('conv-t2p-text'), fileIn = $('conv-t2p-fileInput'), errBox = $('conv-t2p-error');
    const btn = $('conv-t2p-buildBtn'), label = $('conv-t2p-buildBtnLabel');
    $('conv-t2p-loadBtn').addEventListener('click', () => fileIn.click());
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
      text.value = await f.text(); $('conv-t2p-name').value = PT.baseName(f.name);
    });
    /* standard PDF fonts only cover Windows-1252; swap common typographic characters, drop the rest */
    const MAP = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '--', '…': '...', ' ': ' ', '•': '-', '\t': '    ' };
    function clean(s, font) {
      let out = '';
      for (const ch of s.replace(/[‘’“”–—… •\t]/g, m => MAP[m])) {
        try { font.encodeText(ch); out += ch; } catch (e) { out += '?'; }
      }
      return out;
    }
    btn.addEventListener('click', async () => {
      PT.clearBanner(errBox);
      if (!text.value.trim()) { PT.banner(errBox, 'warn', 'Type or load some text first.'); return; }
      PT.busy(btn, label, 'Building…');
      try {
        const doc = await PDFLib.PDFDocument.create();
        const fam = $('conv-t2p-font').value;
        const F = PDFLib.StandardFonts;
        const regular = await doc.embedFont(F[fam === 'TimesRoman' ? 'TimesRoman' : fam]);
        const bold = await doc.embedFont(F[fam === 'TimesRoman' ? 'TimesRomanBold' : fam + 'Bold']);
        const [PW, PH] = $('conv-t2p-size').value === 'a4' ? [595.28, 841.89] : [612, 792];
        const size = Math.min(36, Math.max(6, parseFloat($('conv-t2p-fontSize').value) || 11));
        const M = Math.min(144, Math.max(18, parseFloat($('conv-t2p-margin').value) || 54));
        const maxW = PW - M * 2;
        let page = doc.addPage([PW, PH]), y = PH - M;
        const newPage = () => { page = doc.addPage([PW, PH]); y = PH - M; };
        const wrap = (str, font, sz, indent) => {
          const words = str.split(/(\s+)/), lines = []; let line = '';
          for (const w of words) {
            const test = line + w;
            if (font.widthOfTextAtSize(test, sz) > maxW - indent && line.trim()) { lines.push(line.trimEnd()); line = w.trimStart(); }
            else line = test;
            while (font.widthOfTextAtSize(line, sz) > maxW - indent && line.length > 1) { let k = line.length; while (k > 1 && font.widthOfTextAtSize(line.slice(0, k), sz) > maxW - indent) k--; lines.push(line.slice(0, k)); line = line.slice(k); }
          }
          lines.push(line.trimEnd()); return lines;
        };
        for (const raw of text.value.replace(/\r\n?/g, '\n').split('\n')) {
          let font = regular, sz = size, indent = 0, bullet = false, gapAfter = size * .45, s = raw;
          const h = /^(#{1,3})\s+(.*)$/.exec(raw);
          if (h) { font = bold; sz = size * [0, 1.8, 1.45, 1.2][h[1].length]; s = h[2]; gapAfter = size * .6; y -= size * .5; }
          else if (/^\s*[-*•]\s+/.test(raw)) { bullet = true; indent = size * 1.4; s = raw.replace(/^\s*[-*•]\s+/, ''); gapAfter = size * .2; }
          s = clean(s, font);
          if (!s.trim()) { y -= size * .9; continue; }
          const lines = wrap(s, font, sz, indent);
          lines.forEach((ln, i) => {
            if (y - sz < M) newPage();
            y -= sz * 1.25;
            if (bullet && i === 0) page.drawText('-', { x: M + size * .3, y, size: sz, font });
            page.drawText(ln, { x: M + indent, y, size: sz, font, color: PDFLib.rgb(.12, .12, .12) });
          });
          y -= gapAfter;
        }
        if ($('conv-t2p-pageNums').checked) {
          const pages = doc.getPages();
          pages.forEach((p, i) => { const t = `${i + 1} / ${pages.length}`; p.drawText(t, { x: (PW - regular.widthOfTextAtSize(t, 9)) / 2, y: M / 2, size: 9, font: regular, color: PDFLib.rgb(.45, .45, .45) }); });
        }
        doc.setTitle(PT.sanitizeFilename($('conv-t2p-name').value, 'document'));
        const bytes = await doc.save();
        PT.downloadBlob(bytes, `${PT.sanitizeFilename($('conv-t2p-name').value, 'document')}.pdf`, 'application/pdf');
        Suite.toast(`Created a ${PT.plural(doc.getPageCount(), 'page')} PDF.`);
      } catch (err) {
        console.error(err); PT.banner(errBox, 'error', 'Something went wrong while building the PDF.');
      } finally { PT.unbusy(btn, label, 'Create PDF', false); }
    });
  })();
