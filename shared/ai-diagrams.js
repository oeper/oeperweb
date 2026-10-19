// epic AI diagrams and charts on the website (and in the desktop app, which has its own copy of this file: keep them identical).
// The model writes a ```mermaid block (flowcharts, sequence diagrams, timelines, mind maps...) or a ```chart block (a small JSON spec); the page draws
// it with Mermaid / Chart.js, loaded once from jsDelivr when the first diagram appears. Layout is automatic, so nothing overlaps (the model never
// writes coordinates). parseAiMarkdown leaves a placeholder, hydrateDiagrams() fills it in; results are cached by source because a streaming answer
// is re-rendered on every chunk.

export const DIAGRAM_PROMPT = 'Diagrams and charts (the page draws them for you with automatic layout): for a flowchart, process, sequence of messages, timeline, mind map, state machine, class or ER diagram, org chart or gantt, write a fenced code block with the language mermaid containing plain Mermaid text (for example: graph TD, A[Start] --> B{Ready?}, B -->|yes| C[Go]; or sequenceDiagram, timeline, mindmap, stateDiagram-v2, erDiagram, gantt). Keep labels short, put any label with brackets, quotes or punctuation in double quotes, and use at most about 12 nodes. For numbers (bar, line, pie, doughnut, radar, scatter) write a fenced block with the language chart containing only JSON like {"type":"bar","title":"Sales","labels":["Jan","Feb"],"datasets":[{"label":"2025","data":[3,5]}],"xLabel":"Month","yLabel":"Units"}. Never draw diagrams as ASCII art. Use them only when they really help, and add a sentence or two of normal text around them.';

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js';
const KINDS = ['mermaid', 'chart'];

const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML that parseAiMarkdown puts where a diagram block was; hydrateDiagrams() turns it into the drawing. */
export function diagramPlaceholder(kind, src) {
  return `<div class="ai-diagram" data-kind="${kind}" data-src="${attr(encodeURIComponent(src))}"><div class="ai-diagram-wait">Drawing…</div></div>`;
}
export const isDiagramKind = lang => KINDS.includes(String(lang || '').toLowerCase());

const loaded = {};
function loadScript(url) {
  return loaded[url] || (loaded[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = url; s.async = true;
    s.onload = resolve; s.onerror = () => { delete loaded[url]; reject(new Error('could not load ' + url)); };
    document.head.appendChild(s);
  }));
}

const cache = new Map();
const inflight = new Map();   // the same drawing asked for again while it is still being made (every streamed chunk re-renders the answer)   // kind + source -> { html } (mermaid svg, chart as an image) or { error }

function textColor(el) { return getComputedStyle(el).color || '#888'; }
function toHex(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); if (!m) return '#888888';
  return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
}
const isDark = hex => { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 128; };

function failHtml(why, src) {
  return `<div class="ai-diagram-fail">I could not draw this (${esc(why)}). Here is what was written:</div><pre class="ai-diagram-src">${esc(src)}</pre>`;
}

async function drawMermaid(src, color) {
  await loadScript(MERMAID_URL);
  const dark = isDark(color), t = color;
  window.mermaid.initialize({
    startOnLoad: false, suppressErrorRendering: true, securityLevel: 'strict', theme: 'base', fontFamily: 'inherit',
    themeVariables: { darkMode: dark, background: 'transparent', textColor: t, primaryTextColor: t, secondaryTextColor: t, tertiaryTextColor: t, lineColor: t,
      primaryColor: dark ? '#3b4252' : '#e4e9f4', primaryBorderColor: dark ? '#8892a8' : '#8a96b4', secondaryColor: dark ? '#33463f' : '#e0f0e8', tertiaryColor: dark ? '#4a3b52' : '#f0e4f4',
      noteBkgColor: dark ? '#4a4630' : '#fff6c8', noteTextColor: dark ? '#f0ecd0' : '#333', edgeLabelBackground: 'transparent', clusterBkg: dark ? '#2c313c' : '#f3f5fa', clusterBorder: dark ? '#5a6378' : '#b8c0d4', fontSize: '15px' },
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }, sequence: { useMaxWidth: true }, gantt: { useMaxWidth: true },
  });
  const id = 'm' + Math.random().toString(36).slice(2);
  try {
    const r = await window.mermaid.render(id, src);
    return `<div class="ai-diagram-svg">${r.svg}</div>`;
  } catch { document.getElementById('d' + id)?.remove(); throw new Error('syntax problem'); }
}

async function drawChart(src, color) {
  await loadScript(CHART_URL);
  let spec; try { spec = JSON.parse(src); } catch { throw new Error('the data is not valid JSON'); }
  const t = color, pal = ['#4f8cff', '#ff7a59', '#34c38f', '#f1c40f', '#a66cff', '#ff5fa2', '#2ec4d6', '#9aa5b1'];
  const type = spec.type || 'bar', pie = type === 'pie' || type === 'doughnut' || type === 'polarArea', radar = type === 'radar';
  const sets = (spec.datasets || []).map((d, i) => {
    const c = pal[i % pal.length], cols = (d.data || []).map((_, j) => pal[j % pal.length]);
    return { label: d.label || '', data: d.data || [], backgroundColor: pie ? cols : (type === 'line' || radar ? c + '33' : c), borderColor: pie ? 'rgba(0,0,0,0)' : c, borderWidth: 2, tension: .3, fill: radar || spec.fill === true, pointRadius: 3 };
  });
  const grid = t + '26';
  const axis = label => ({ ticks: { color: t }, grid: { color: grid }, border: { color: grid }, title: { display: !!label, text: label || '', color: t } });
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;height:340px';
  const cv = document.createElement('canvas'); box.appendChild(cv); document.body.appendChild(box);
  try {
    const chart = new window.Chart(cv, { type, data: { labels: spec.labels || [], datasets: sets }, options: {
      responsive: true, maintainAspectRatio: false, animation: false, devicePixelRatio: 2,
      plugins: { title: { display: !!spec.title, text: spec.title || '', color: t, font: { size: 15 } }, legend: { display: sets.length > 1 || pie, labels: { color: t } } },
      scales: pie ? {} : radar ? { r: { ticks: { color: t, backdropColor: 'rgba(0,0,0,0)' }, grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: t } } } : { x: axis(spec.xLabel), y: Object.assign(axis(spec.yLabel), { beginAtZero: spec.beginAtZero !== false }) } } });
    const url = cv.toDataURL('image/png'); chart.destroy();
    return `<img class="ai-diagram-img" alt="${attr(spec.title || 'chart')}" src="${url}">`;
  } finally { box.remove(); }
}

/** Draws every diagram placeholder inside [root] (safe to call again: finished ones are left alone, cached ones are filled in at once). */
export function hydrateDiagrams(root) {
  if (!root) return;
  root.querySelectorAll('.ai-diagram:not([data-done])').forEach(async el => {
    const kind = el.dataset.kind; let src = '';
    try { src = decodeURIComponent(el.dataset.src || ''); } catch { return; }
    const key = kind + '\n' + src, hit = cache.get(key);
    if (hit) { el.innerHTML = hit.html; el.dataset.done = '1'; return; }
    el.dataset.done = '1';
    if (!inflight.has(key)) {
      const color = toHex(textColor(el));
      inflight.set(key, (async () => {
        let html;
        try { html = kind === 'mermaid' ? await drawMermaid(src, color) : await drawChart(src, color); }
        catch (e) { html = failHtml(e.message || 'error', src); }
        cache.set(key, { html }); inflight.delete(key);
        return html;
      })());
    }
    const html = await inflight.get(key);
    if (el.isConnected) el.innerHTML = html;
  });
}
