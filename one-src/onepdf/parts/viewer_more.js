    // --- Extras: undo/redo, more tools, signature, thumbnails, search, fit, print, keyboard ---
    const Hist = { undo: [], redo: [], busy: false };
    function histSnapshot() { return JSON.stringify(AppState.fabricCanvas.toJSON()); }
    function histReset() { Hist.undo = [histSnapshot()]; Hist.redo = []; syncHistButtons(); }
    function histPush() {
        if (Hist.busy || !AppState.fabricCanvas) return;
        const s = histSnapshot(); if (Hist.undo[Hist.undo.length - 1] === s) return;
        Hist.undo.push(s); if (Hist.undo.length > 80) Hist.undo.shift(); Hist.redo = []; syncHistButtons();
    }
    function histGo(dir) {
        const from = dir < 0 ? Hist.undo : Hist.redo, to = dir < 0 ? Hist.redo : Hist.undo;
        if (dir < 0 ? from.length < 2 : !from.length) return Suite.toast(dir < 0 ? 'Nothing to undo.' : 'Nothing to redo.');
        Hist.busy = true;
        if (dir < 0) { to.push(from.pop()); } else { from.length && Hist.undo.push(from.pop()); }
        const state = Hist.undo[Hist.undo.length - 1];
        AppState.fabricCanvas.loadFromJSON(state, () => { AppState.fabricCanvas.renderAll(); Hist.busy = false; setTool(AppState.currentTool); saveDocState(); syncHistButtons(); });
    }
    function syncHistButtons() { const u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo'); if (u) u.disabled = Hist.undo.length < 2; if (r) r.disabled = !Hist.redo.length; }

    const handleOpts = () => ({ cornerColor: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#b3261e', cornerSize: 12, transparentCorners: false, borderColor: '#888' });
    function addArrow() {
        const fc = AppState.fabricCanvas, w = Math.max(3, AppState.brushSize);
        const arrow = new fabric.Path(`M 0 ${6 * w} L ${140} ${6 * w} M ${140 - 6 * w} 0 L 140 ${6 * w} L ${140 - 6 * w} ${12 * w}`, { left: fc.width / 2 - 70, top: fc.height / 2 - 6 * w, stroke: AppState.color, strokeWidth: w, fill: '', strokeLineCap: 'round', strokeLineJoin: 'round', ...handleOpts() });
        addFabricObject(arrow); setTool('select');
    }
    function addNote() {
        const fc = AppState.fabricCanvas;
        const note = new fabric.Textbox('Note', { left: fc.width / 2 - 90, top: fc.height / 2 - 40, width: 180, fontSize: 16, fontFamily: 'Google Sans, Roboto, sans-serif', fill: '#3b2f00', backgroundColor: '#fff3a8', padding: 10, ...handleOpts() });
        addFabricObject(note); setTool('select'); fc.setActiveObject(note); note.enterEditing(); note.selectAll();
    }
    function addRedact() {
        const fc = AppState.fabricCanvas;
        addFabricObject(new fabric.Rect({ left: fc.width / 2 - 90, top: fc.height / 2 - 14, width: 180, height: 28, fill: '#000', strokeWidth: 0, ...handleOpts() }));
        setTool('select');
        Suite.toast('Redaction boxes cover what is shown on the page. The original text underneath is still in the file, so use Compress › Strong afterwards if it must be removed completely.', { ms: 7000 });
    }
    async function addSignature() {
        const data = await Suite.signaturePad(); if (!data) return;
        fabric.Image.fromURL(data, (img) => { const max = 220; if (img.width > max) img.scale(max / img.width); img.set({ left: 60, top: AppState.fabricCanvas.height - img.getScaledHeight() - 60, ...handleOpts() }); addFabricObject(img); setTool('select'); });
    }

    /* thumbnails */
    let thumbsBuiltFor = null;
    async function buildThumbs() {
        const body = document.getElementById('thumbs-body'); if (!AppState.pdfDoc) return;
        if (thumbsBuiltFor !== AppState.currentDocId) {
            thumbsBuiltFor = AppState.currentDocId; body.innerHTML = '';
            for (let p = 1; p <= AppState.pageCount; p++) {
                const b = document.createElement('button'); b.className = 'pthumb'; b.dataset.p = p; b.setAttribute('aria-label', `Page ${p}`);
                const c = document.createElement('canvas'); b.appendChild(c); b.appendChild(document.createTextNode(String(p)));
                b.onclick = () => goToPage(p); body.appendChild(b);
            }
            for (let p = 1; p <= AppState.pageCount; p++) {
                if (thumbsBuiltFor !== AppState.currentDocId) return;
                const page = await AppState.pdfDoc.getPage(p), vp = page.getViewport({ scale: 150 / page.getViewport({ scale: 1 }).width });
                const c = body.querySelector(`.pthumb[data-p="${p}"] canvas`); if (!c) continue;
                c.width = vp.width; c.height = vp.height; await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            }
        }
        markThumb();
    }
    function markThumb() { document.querySelectorAll('#thumbs-body .pthumb').forEach(b => b.classList.toggle('cur', +b.dataset.p === AppState.pageNum)); const cur = document.querySelector('#thumbs-body .pthumb.cur'); cur && cur.scrollIntoView({ block: 'nearest' }); }
    async function goToPage(p) { if (!AppState.pdfDoc || p < 1 || p > AppState.pageCount) return; saveDocState(); showLoader(); await renderPage(p); hideLoader(); }

    /* search */
    let searchCache = null;
    async function runSearch(q) {
        const list = document.getElementById('search-results'), count = document.getElementById('search-count');
        AppState.searchQuery = q.trim(); list.innerHTML = '';
        if (!AppState.searchQuery || !AppState.pdfDoc) { count.textContent = ''; highlightMatches(); return; }
        if (!searchCache || searchCache.id !== AppState.currentDocId) {
            count.textContent = 'Reading pages…'; const pages = [];
            for (let p = 1; p <= AppState.pageCount; p++) { const tc = await (await AppState.pdfDoc.getPage(p)).getTextContent(); pages.push(tc.items.map(i => i.str).join(' ')); }
            searchCache = { id: AppState.currentDocId, pages };
        }
        const needle = AppState.searchQuery.toLowerCase(), esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        let total = 0;
        searchCache.pages.forEach((txt, i) => {
            const low = txt.toLowerCase(); let at = low.indexOf(needle), shown = 0;
            while (at !== -1) {
                total++;
                if (shown < 5) {
                    const a = Math.max(0, at - 40), z = Math.min(txt.length, at + needle.length + 60);
                    const b = document.createElement('button'); b.className = 'sres'; b.style.animationDelay = Math.min(total, 15) * 20 + 'ms';
                    b.innerHTML = `<b>Page ${i + 1}</b>${a ? '…' : ''}${esc(txt.slice(a, at))}<mark>${esc(txt.slice(at, at + needle.length))}</mark>${esc(txt.slice(at + needle.length, z))}${z < txt.length ? '…' : ''}`;
                    b.onclick = () => goToPage(i + 1);
                    list.appendChild(b); shown++;
                }
                at = low.indexOf(needle, at + needle.length);
            }
        });
        count.textContent = total ? `${total} match${total === 1 ? '' : 'es'}` : 'No matches';
        highlightMatches();
    }
    function highlightMatches() {
        const q = (AppState.searchQuery || '').toLowerCase();
        UI.textLayer.querySelectorAll('span').forEach(s => s.classList.toggle('hl', !!q && s.textContent.toLowerCase().includes(q)));
    }

    function togglePanel(id, on) {
        const p = document.getElementById(id); const show = on === undefined ? p.classList.contains('hidden') : on;
        p.classList.toggle('hidden', !show);
        if (id === 'thumbs-panel' && show) buildThumbs();
        if (id === 'search-panel' && show) setTimeout(() => document.getElementById('search-input').focus(), 30);
        setTimeout(() => { if (AppState.pdfDoc) renderPage(AppState.pageNum); }, 60);
    }

    async function fitWidth() { if (!AppState.pdfDoc) return; saveDocState(); AppState.zoom = 1.0; AppState.fitMode = 'width'; showLoader(); await renderPage(AppState.pageNum); hideLoader(); }
    async function openForPrint() {
        if (!AppState.pdfDoc) return;
        showLoader('Preparing…');
        try { const blob = await generateMergedPDFBlob(); const url = URL.createObjectURL(blob); const w = window.open(url, '_blank'); if (!w) Suite.toast('Your browser blocked the new tab. Use Export and print the downloaded file.'); }
        catch (e) { console.error(e); Suite.toast('Could not prepare the file for printing.'); }
        hideLoader();
    }
    function jumpPrompt() {
        if (!AppState.pdfDoc) return;
        const inp = document.createElement('input'); inp.type = 'number'; inp.min = 1; inp.max = AppState.pageCount; inp.value = AppState.pageNum; inp.className = 'text-input';
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.closest('.dialog').querySelector('.dbtn.filled').click(); } });
        Suite.dialog('Go to page', inp, [{ label: 'Cancel' }, { label: 'Go', kind: 'filled' }]).then(i => { if (i === 1) goToPage(Math.min(AppState.pageCount, Math.max(1, parseInt(inp.value, 10) || 1))); });
    }

    function setupExtras() {
        const fc = AppState.fabricCanvas;
        fc.on('path:created', histPush); fc.on('object:modified', histPush); fc.on('object:added', () => setTimeout(histPush)); fc.on('object:removed', () => setTimeout(histPush));
        fc.on('text:editing:exited', () => { histPush(); saveDocState(); });
        document.getElementById('btn-undo').onclick = () => histGo(-1);
        document.getElementById('btn-redo').onclick = () => histGo(1);
        document.getElementById('tool-arrow').onclick = addArrow;
        document.getElementById('tool-note').onclick = addNote;
        document.getElementById('tool-redact').onclick = addRedact;
        document.getElementById('tool-sign').onclick = addSignature;
        document.getElementById('tool-image').onclick = () => UI.imgUpload.click();
        document.getElementById('btn-thumbs').onclick = () => togglePanel('thumbs-panel');
        document.getElementById('btn-search').onclick = () => togglePanel('search-panel');
        document.getElementById('thumbs-close').onclick = () => togglePanel('thumbs-panel', false);
        document.getElementById('search-close').onclick = () => { togglePanel('search-panel', false); AppState.searchQuery = ''; highlightMatches(); };
        document.getElementById('btn-fit').onclick = fitWidth;
        document.getElementById('btn-print').onclick = openForPrint;
        document.getElementById('page-indicator').onclick = jumpPrompt;
        let st; document.getElementById('search-input').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => runSearch(e.target.value), 250); });
        window.addEventListener('keydown', (e) => {
            if (document.getElementById('view-viewer').hidden || !AppState.pdfDoc) return;
            const typing = /INPUT|TEXTAREA/.test(e.target.tagName) || (fc.getActiveObject() && fc.getActiveObject().isEditing);
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); togglePanel('search-panel', true); return; }
            if (typing) return;
            if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); histGo(e.shiftKey ? 1 : -1); return; }
            if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); histGo(1); return; }
            if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); openForPrint(); return; }
            if (e.key === 'PageDown' || (e.key === 'ArrowRight' && AppState.currentTool === 'pan')) { e.preventDefault(); changePage(1); }
            if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && AppState.currentTool === 'pan')) { e.preventDefault(); changePage(-1); }
            if (e.key === 'Home') goToPage(1); if (e.key === 'End') goToPage(AppState.pageCount);
            if ((e.key === '+' || e.key === '=') && !mod) changeZoom(0.2);
            if (e.key === '-' && !mod) changeZoom(-0.2);
            const keys = { v: 'pan', s: 'select', p: 'draw', h: 'highlight', t: 'text', r: 'rect', o: 'circle' };
            if (!mod && !e.altKey && keys[e.key.toLowerCase()]) setTool(keys[e.key.toLowerCase()]);
        });
    }
