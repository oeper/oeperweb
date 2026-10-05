import re, pathlib
D = pathlib.Path(__file__).resolve().parent
P = D / 'parts'
s = (D / 'original.html').read_text(encoding='utf-8')
part = lambda n: (P / n).read_text(encoding='utf-8')

def rep(old, new, count=1):
    global s
    assert old in s, 'NOT FOUND: ' + old[:90]
    s = s.replace(old, new, count)

# --- 1. strip Cloudflare Rocket Loader rewriting (the host re-adds it when serving) ---
s = re.sub(r' type="[0-9a-f]+-text/javascript"', '', s)
s = s.replace("if (!window.__cfRLUnblockHandlers) return false; ", '')
s = re.sub(r' data-cf-modified-[0-9a-f]+-=""', '', s)
s = re.sub(r'<script src="/cdn-cgi/scripts/[^"]+rocket-loader\.min\.js"[^>]*></script>', '', s)
assert 'cfRL' not in s and 'rocket-loader' not in s

# --- 1b. no blue tap flash on touch screens (same rule the oeper.dev pages use) ---
rep('* { box-sizing: border-box; }', '* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }')

# --- 2. head: seed applied before first paint, fonts, skin stylesheet ---
start = s.index('<script>\n// Applies a previously-saved accent color')
end = s.index('</script>', start) + len('</script>')
s = s[:start] + """<script>
// Applies the saved app color (Material You seed) before first paint.
(function () { try { var c = localStorage.getItem('onepdf-seed'); if (c) document.documentElement.style.setProperty('--seed', c); } catch (e) {} })();
</script>""" + s[end:]
rep('<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;500;600;700&display=swap" rel="stylesheet">',
    '<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400..700&display=swap" rel="stylesheet">')
rep('family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0', 'family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..24,400..500,0..1,0')
rep('<meta name="description" content="onePDF — split, combine, convert, view, and edit PDFs, all in one page, entirely in your browser.">',
    '<meta name="description" content="onePDF — view, annotate, split, combine, convert, edit and compress PDFs, entirely in your browser.">')
rep('</style>\n</head>', '</style>\n<style>\n' + part('skin.css') + '</style>\n</head>')

# --- 3. body chrome: sidebar -> top app bar + tabs + My Documents panel (credits removed) ---
a = s.index('<button class="mobile-nav-toggle"')
b = s.index('<div class="app-main">') + len('<div class="app-main">')
s = s[:a] + part('header.html') + s[b:]
assert 'sidebar-credits">' not in s and 'Built with' not in s

# --- 4. new sections ---
rep('  <!-- ================= VIEWER (annotate & export) ================= -->', part('compress.html') + '  <!-- ================= VIEWER (annotate & export) ================= -->')
rep('<button class="chip" type="button" data-mode="text">PDF → Text</button>', '<button class="chip" type="button" data-mode="text">PDF → Text</button>\n        <button class="chip" type="button" data-mode="txt2pdf">Text → PDF</button>')
rep('''        <div id="conv-text-resultBanner"></div>
      </section>
    </div>
''', '''        <div id="conv-text-resultBanner"></div>
      </section>
    </div>
''' + part('txt2pdf.html'))
rep('''        <button class="chip" type="button" data-mode="metadata">Metadata</button>''', '''        <button class="chip" type="button" data-mode="metadata">Metadata</button>
        <button class="chip" type="button" data-mode="rotate">Rotate</button>
        <button class="chip" type="button" data-mode="delete">Delete pages</button>
        <button class="chip" type="button" data-mode="insert">Insert blank</button>
        <button class="chip" type="button" data-mode="header">Header &amp; footer</button>
        <button class="chip" type="button" data-mode="stamp">Image stamp</button>
        <button class="chip" type="button" data-mode="crop">Crop</button>
        <button class="chip" type="button" data-mode="flatten">Flatten form</button>''')
rep('    <section class="card" id="edit-actionCard" hidden>', part('edit_cards.html') + '\n    <section class="card" id="edit-actionCard" hidden>')

# viewer chrome
rep('''                <div id="storage-warning"''', '''                <button class="btn-icon" id="btn-thumbs" title="Page thumbnails" aria-label="Page thumbnails"><span class="material-symbols-rounded">view_sidebar</span></button>
                <button class="btn-icon" id="btn-search" title="Search (Ctrl+F)" aria-label="Search"><span class="material-symbols-rounded">search</span></button>
                <button class="btn-icon hide-mobile" id="btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled><span class="material-symbols-rounded">undo</span></button>
                <button class="btn-icon hide-mobile" id="btn-redo" title="Redo (Ctrl+Y)" aria-label="Redo" disabled><span class="material-symbols-rounded">redo</span></button>
                <button class="btn-icon hide-mobile" id="btn-fit" title="Fit to width" aria-label="Fit to width"><span class="material-symbols-rounded">fit_screen</span></button>
                <button class="btn-icon hide-mobile" id="btn-print" title="Open for printing (Ctrl+P)" aria-label="Open for printing"><span class="material-symbols-rounded">print</span></button>
                <div id="storage-warning"''')
rep('''                    <button class="btn-icon" onclick="document.getElementById('image-upload').click()" title="Add Image/Signature" aria-label="Add image or signature">
                        <span class="material-symbols-rounded">image</span>
                    </button>''', '''                    <button class="btn-icon" id="tool-arrow" title="Arrow" aria-label="Add arrow">
                        <span class="material-symbols-rounded">arrow_right_alt</span>
                    </button>
                    <button class="btn-icon" id="tool-note" title="Sticky note" aria-label="Add sticky note">
                        <span class="material-symbols-rounded">sticky_note_2</span>
                    </button>
                    <button class="btn-icon" id="tool-redact" title="Redaction box" aria-label="Add redaction box">
                        <span class="material-symbols-rounded">format_strikethrough</span>
                    </button>
                    <div class="tool-divider"></div>
                    <button class="btn-icon" id="tool-image" title="Add image" aria-label="Add image">
                        <span class="material-symbols-rounded">image</span>
                    </button>
                    <button class="btn-icon" id="tool-sign" title="Draw a signature" aria-label="Draw a signature">
                        <span class="material-symbols-rounded">signature</span>
                    </button>''')
rep('''<div id="app-container">

    <div id="workspace">''', '''<div id="app-container">

    <aside class="side-panel hidden" id="thumbs-panel" aria-label="Page thumbnails">
        <div class="side-head">Pages <button class="btn-icon" id="thumbs-close" aria-label="Close thumbnails" style="width:36px;height:36px"><span class="material-symbols-rounded">close</span></button></div>
        <div class="side-body" id="thumbs-body"></div>
    </aside>

    <div id="workspace">''')
rep('''        <div class="loader-overlay" id="loader">
            <div class="spinner"></div>
            <p style="font-weight: 500;" id="loader-text">Loading...</p>
        </div>
    </div>''', '''        <div class="loader-overlay" id="loader">
            <div class="spinner"></div>
            <p style="font-weight: 500;" id="loader-text">Loading...</p>
        </div>
    </div>

    <aside class="side-panel right hidden" id="search-panel" aria-label="Search">
        <div class="side-head">Search <button class="btn-icon" id="search-close" aria-label="Close search" style="width:36px;height:36px"><span class="material-symbols-rounded">close</span></button></div>
        <label class="search-box"><span class="material-symbols-rounded" style="font-size:20px">search</span><input id="search-input" placeholder="Find in document" aria-label="Find in document" autocomplete="off"></label>
        <div class="search-count" id="search-count"></div>
        <div class="side-body" id="search-results"></div>
    </aside>''')

# --- 5. JS: navigation without the old sidebar ---
rep('''const VIEWS = ['split', 'combine', 'convert', 'edit', 'viewer'];
const sidebar = $('appSidebar'), sidebarScrim = $('sidebarScrim'), mobileToggle = $('mobileNavToggle');

function closeMobileSidebar() {
  sidebar.classList.remove('open');
  sidebarScrim.classList.remove('active');
}
mobileToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  sidebarScrim.classList.toggle('active');
});
sidebarScrim.addEventListener('click', closeMobileSidebar);
''', '''const VIEWS = ['split', 'combine', 'convert', 'edit', 'viewer', 'compress'];
function closeMobileSidebar() { /* the old slide-out sidebar is gone; kept so existing calls stay valid */ }
''' + part('suite.js') + '\n')
rep('''  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  closeMobileSidebar();''', '''  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  Suite.moveTabIndicator();''')
rep("$('newPdfBtn')", "$('newPdfBtn')") if "$('newPdfBtn')" in s else None
rep('''$('mainNav').addEventListener('click', (e) => {''', '''$('newPdfBtn').addEventListener('click', () => $('file-upload').click());
$('mainNav').addEventListener('click', (e) => {''')

# old accent picker -> removed (Suite handles the seed colour)
a = s.index('/* ============================================================\n   ACCENT THEME (sidebar picker)')
b = s.index('/* ============================================================\n   SPLIT')
s = s[:a] + s[b:]

# --- 6. convert: text -> pdf panel ---
rep("const panels = { img2pdf: $('conv-img2pdf'), pdf2img: $('conv-pdf2img'), text: $('conv-text') };",
    "const panels = { img2pdf: $('conv-img2pdf'), pdf2img: $('conv-pdf2img'), text: $('conv-text'), txt2pdf: $('conv-txt2pdf') };")
rep('''      PT.downloadBlob(extracted, `${PT.baseName(currentFile.name)}.txt`, 'text/plain;charset=utf-8');
    });
  })();
''', '''      PT.downloadBlob(extracted, `${PT.baseName(currentFile.name)}.txt`, 'text/plain;charset=utf-8');
    });
  })();
''' + part('txt2pdf.js'))

# --- 7. edit: more modes ---
rep("const APPLY_LABELS = { numbers: 'Add page numbers', watermark: 'Add watermark', metadata: 'Save PDF with new metadata' };",
    "const APPLY_LABELS = { numbers: 'Add page numbers', watermark: 'Add watermark', metadata: 'Save PDF with new metadata', rotate: 'Rotate pages', delete: 'Delete pages', insert: 'Insert blank pages', header: 'Add header & footer', stamp: 'Stamp pages', crop: 'Crop pages', flatten: 'Flatten form' };\n  const MODE_CARDS = { numbers: 'edit-numbersCard', watermark: 'edit-watermarkCard', metadata: 'edit-metadataCard', rotate: 'edit-rotateCard', delete: 'edit-deleteCard', insert: 'edit-insertCard', header: 'edit-hfCard', stamp: 'edit-stampCard', crop: 'edit-cropCard', flatten: 'edit-flattenCard' };")
rep('''    modeCard.hidden = true; numbersCard.hidden = true; watermarkCard.hidden = true;
    metadataCard.hidden = true; mdReadOnlyCard.hidden = true; touchDatesRow.hidden = true;''',
    '''    modeCard.hidden = true; Object.values(MODE_CARDS).forEach(id => { $(id).hidden = true; });
    mdReadOnlyCard.hidden = true; touchDatesRow.hidden = true;''')
rep('''  function applyMode() {
    numbersCard.hidden = mode !== 'numbers';
    watermarkCard.hidden = mode !== 'watermark';
    metadataCard.hidden = mode !== 'metadata';
    mdReadOnlyCard.hidden = mode !== 'metadata';''', '''  function applyMode() {
    Object.entries(MODE_CARDS).forEach(([m, id]) => { $(id).hidden = mode !== m; });
    mdReadOnlyCard.hidden = mode !== 'metadata';''')
rep('''    if (mode === 'metadata') applyBtn.disabled = false;
  }''', '''    if (mode === 'metadata') applyBtn.disabled = false;
    if (!['numbers', 'watermark', 'metadata'].includes(mode)) applyBtn.disabled = false;
    if (mode === 'insert') $('edit-ins-after').max = currentFile ? currentFile.pageCount : 1;
    if (mode === 'flatten') checkFormFields();
  }''')
rep('''  /* ---------- Shared apply button ---------- */''', part('edit_more.js') + '\n  /* ---------- Shared apply button ---------- */')
rep('''      if (mode === 'numbers') await runPageNumbers();
      else if (mode === 'watermark') await runWatermark();
      else await runMetadata();''', '''      const RUN = { numbers: runPageNumbers, watermark: runWatermark, metadata: runMetadata, rotate: runRotate, delete: runDelete, insert: runInsert, header: runHeaderFooter, stamp: runStamp, crop: runCrop, flatten: runFlatten };
      await RUN[mode]();
      Suite.toast('Done. Your new PDF is downloading.');''')
rep('''      PT.banner(applyError, 'error', err.message && /^Enter some watermark/.test(err.message)''', '''      PT.banner(applyError, 'error', err.friendly || (err.message && /^Enter some watermark/.test(err.message))''')

# --- 8. viewer: extras, nicer dialogs, library click fix ---
rep('''        setupUIEvents();
        ''', '''        setupUIEvents();
        setupExtras();
        ''')
rep('''            alert("Could not load this file. It might be corrupted or encrypted.");''', '''            Suite.toast("Could not load this file. It might be corrupted or encrypted.");''')
rep('''            alert("This PDF appears to be protected or invalid.");''', '''            Suite.toast("This PDF appears to be password-protected or damaged.");''')
rep('alert("Export failed.")', 'Suite.toast("Export failed.")')
rep('''        if (!navigator.share) return alert("Sharing not supported on this browser.");''', '''        if (!navigator.share) return Suite.toast("Sharing isn't supported in this browser.");''')
rep('''            else alert("Your system doesn't support sharing this file type directly.");''', '''            else Suite.toast("Your system can't share PDF files directly. Use Export instead.");''')
rep('''        if(confirm("Delete this document?")) {''', '''        if (await Suite.confirmDialog('Delete this document?', 'It will be removed from this browser, along with your markup. This can’t be undone.', 'Delete', true)) {''')
a = s.index('    async function refreshLibrary() {')
b = s.index('    async function loadFromLib(id) {')
s = s[:a] + '''    async function refreshLibrary() {
        const files = await db.getAll();
        UI.libraryList.innerHTML = files.length ? '' : `<div style="padding: 12px 8px; color: var(--on-surface-variant); font-size: 13px;">No PDFs yet. Open one and it’s kept here, with your markup.</div>`;
        files.forEach((f, i) => {
            const el = document.createElement('div');
            el.className = `library-item ${AppState.currentDocId === f.id ? 'active' : ''}`;
            el.style.animationDelay = Math.min(i, 12) * 25 + 'ms';
            el.innerHTML = `
                <div class="file-icon"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
                <div class="details"><div class="title"></div><div class="date"></div></div>
                <button class="icon-btn" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-8 0v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            `;
            el.querySelector('.title').textContent = f.name; el.title = f.name;
            el.querySelector('.date').textContent = new Date(f.ts).toLocaleDateString();
            el.addEventListener('click', () => loadFromLib(f.id));
            el.querySelector('.icon-btn').addEventListener('click', (e) => deleteFromLib(f.id, e));
            UI.libraryList.appendChild(el);
        });
    }

''' + s[b:]
# page render hooks: history reset, thumbnail marker, search highlight
rep('''        AppState.fabricCanvas.setWidth(viewport.width);
        AppState.fabricCanvas.setHeight(viewport.height);
        AppState.fabricCanvas.clear();''', '''        AppState.fabricCanvas.setWidth(viewport.width);
        AppState.fabricCanvas.setHeight(viewport.height);
        Hist.busy = true;
        AppState.fabricCanvas.clear();
        markThumb();''')
rep('''            pdfjsLib.renderTextLayer({
                textContent: textContent,
                container: UI.textLayer,
                viewport: viewport,
                textDivs: []
            });''', '''            const tl = pdfjsLib.renderTextLayer({
                textContent: textContent,
                container: UI.textLayer,
                viewport: viewport,
                textDivs: []
            });
            if (tl && tl.promise) tl.promise.then(highlightMatches, () => {});''')
rep('''                AppState.fabricCanvas.renderAll();
                setTool(AppState.currentTool);
            });
        } else {
            setTool(AppState.currentTool);
        }''', '''                AppState.fabricCanvas.renderAll();
                setTool(AppState.currentTool);
                Hist.busy = false; histReset();
            });
        } else {
            setTool(AppState.currentTool);
            Hist.busy = false; histReset();
        }''')
rep('''        db.saveFile(AppState.currentDocId, UI.docTitle.value, AppState.originalBytes, AppState.annotations);''', '''        db.saveFile(AppState.currentDocId, UI.docTitle.value, AppState.originalBytes, AppState.annotations).then(() => { if (!UI.libraryList.querySelector('.library-item.active')) refreshLibrary(); });''')
rep('''            await loadDoc(id, file.name.replace('.pdf',''), arr, {});
            refreshLibrary();''', '''            await loadDoc(id, file.name.replace('.pdf',''), arr, {});
            setTimeout(refreshLibrary, 150);''')
rep('''    async function renderPage(num) {''', '''    // Renders are queued so two quick requests (page flip + panel resize) never draw into the same canvas at once.
    function renderPage(num) {
        AppState.renderChain = (AppState.renderChain || Promise.resolve()).then(() => renderPageImpl(num)).catch(err => console.warn('Render skipped', err));
        return AppState.renderChain;
    }
    async function renderPageImpl(num) {''')
rep('''/* ============================================================
   VIEWER (annotate & export)''', part('compress.js') + '''
/* ============================================================
   VIEWER (annotate & export)''')
rep('''    async function sharePDF() {''', part('viewer_more.js') + '\n    async function sharePDF() {')

# --- 9. suite shell hooks ---
s = s.replace("'Google Sans Flex'", "'Google Sans', 'Google Sans Flex'")
rep("if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);", "try { if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name); } catch (e) { /* srcdoc frames have no URL to rewrite */ }")
rep('<span class="material-symbols-rounded">print</span></button>', '<span class="material-symbols-rounded">print</span></button>\n                <button class="btn-icon show-mobile" id="btn-more" title="More" aria-label="More actions"><span class="material-symbols-rounded">more_vert</span></button>')

i = s.rindex("})();\n</script>")
s = s[:i] + ("// The viewer is the default tab, but it registers its loader after the first showView() ran, so start it now.\n"
             "if (!$('view-viewer').hidden && window.ensureViewerLoaded) window.ensureViewerLoaded();\n"
             "Suite.moveTabIndicator();\n" + part('embed.js') + part('mobile.js') + "\n") + s[i:]
assert 'alert(' not in s and 'confirm(' not in s.replace('confirmDialog(', ''), 'leftover native dialog'
(D / 'index.html').write_text(s, encoding='utf-8')
print('built', len(s), 'bytes')
