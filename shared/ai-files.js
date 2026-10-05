// Turns a file the user picked into plain text for epic AI (the /ai chat and the
// assistant panel inside the one suite). Everything happens in the browser: the
// file itself is never uploaded, only the extracted text is sent along with the
// message, like any other text the user types or pastes.
//
// PDFs are read with pdf.js, loaded on demand from jsDelivr the first time a PDF
// is attached (same build one-src/onepdf uses), so pages that never see a PDF
// never download it. Scanned PDFs (pictures of text) have no text layer and are
// reported as unsupported rather than silently sending nothing.
//
// Served with a long cache lifetime: bump ?v=N on every importer after a change.

const PDFJS_VERSION = '5.6.205';
const MAX_FILE_BYTES = 60 * 1024 * 1024;
const MAX_PAGES = 80;
export const FILE_ACCEPT = 'application/pdf,.pdf,.txt,.md,.csv,.tsv,.json,.log';
export const MAX_FILE_CHARS = 24000;

let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
      return lib;
    }).catch(err => { pdfjsPromise = null; throw new Error('could not load the PDF reader (check your connection and try again)'); });
  }
  return pdfjsPromise;
}

export const isPdf = f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
export const isReadableText = f => f && (/^text\//.test(f.type) || f.type === 'application/json' || /\.(txt|md|csv|tsv|json|log)$/i.test(f.name || ''));
export const isImage = f => f && /^image\//.test(f.type || '');

function tidy(s) {
  return s.replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function pdfToText(file, maxChars, maxPages, onProgress) {
  const pdfjs = await loadPdfJs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    if (err && err.name === 'PasswordException') throw new Error('this PDF is password protected, so it can’t be read');
    throw new Error('this file couldn’t be read as a PDF');
  }
  const total = doc.numPages, limit = Math.min(total, maxPages || MAX_PAGES);
  let out = '', read = 0;
  for (let n = 1; n <= limit; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const text = tidy(tc.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join(''));
    out += (out ? '\n\n' : '') + (total > 1 ? `[Page ${n}]\n` : '') + text;
    read = n; if (onProgress) onProgress(n, total);
    if (out.length >= maxChars) break;
  }
  try { doc.destroy(); } catch {}
  return { text: out, pages: total, pagesRead: read };
}

// Returns { title, text, note } where `note` is a short human line for the UI
// ("12 pages", "first 24,000 characters, pages 1-6 of 40"). Throws an Error with
// a message that is safe to show the user.
export async function readFileForAI(file, opts) {
  const maxChars = (opts && opts.maxChars) || MAX_FILE_CHARS;
  if (!file) throw new Error('no file chosen');
  if (file.size > MAX_FILE_BYTES) throw new Error('that file is over 60 MB, which is too big to read here');
  let text = '', note = '';
  if (isPdf(file)) {
    const r = await pdfToText(file, maxChars, opts && opts.maxPages, opts && opts.onProgress);
    text = r.text;
    if (text.replace(/\[Page \d+\]/g, '').trim().length < 20) throw new Error('this PDF has no selectable text (it looks scanned), and reading scanned PDFs isn’t supported yet');
    note = r.pagesRead < r.pages || text.length > maxChars ? `pages 1-${r.pagesRead} of ${r.pages}` : `${r.pages} page${r.pages === 1 ? '' : 's'}`;
  } else if (isReadableText(file)) {
    text = tidy(await file.text());
    if (!text) throw new Error('that file is empty');
  } else {
    throw new Error('only PDFs, text files and images are supported right now');
  }
  if (text.length > maxChars) { text = text.slice(0, maxChars); note = (note ? note + ', ' : '') + `first ${maxChars.toLocaleString()} characters`; }
  return { title: file.name || 'file', text, note };
}
