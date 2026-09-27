// Masonry for a CSS-grid container whose children have uneven heights — each
// child is packed into whichever column is currently shortest, instead of
// leaving a gap under short cards the way plain row-aligned grid cells do.
//
// The container's own CSS (wide screens only, see index.html / profile.html)
// supplies the columns and sets `grid-auto-rows: <rowHeight>px`,
// `grid-auto-flow: row dense` and `row-gap: 0`; this module just measures each
// child and gives it `grid-row-end: span N` so it occupies the right number of
// those thin rows. Below the breakpoint the container is a normal flex column
// and the inline span is ignored, so it's safe to leave running everywhere.
//
// Works on containers whose children are replaced wholesale (innerHTML) as
// well as appended one at a time: a MutationObserver picks up new children and
// a ResizeObserver re-measures them when images load, text expands, etc.
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every
// `from './shared/masonry.js?v=N'` import across the site (grep for it).

export function masonry(container, opts) {
  if (!container || container.dataset.masonry) return;
  container.dataset.masonry = '1';
  const rowHeight = (opts && opts.rowHeight) || 4; // must match grid-auto-rows in the page's CSS
  const gap = opts && opts.gap != null ? opts.gap : 24; // vertical space between cards (row-gap is 0 so it lives in the span)

  const place = el => {
    el.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((el.offsetHeight + gap) / rowHeight));
  };
  const ro = new ResizeObserver(entries => { for (const en of entries) place(en.target); });
  const track = el => {
    if (el.nodeType !== 1 || el.dataset.masonryTracked) return;
    el.dataset.masonryTracked = '1';
    ro.observe(el);
    place(el);
  };

  Array.from(container.children).forEach(track);
  new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(track);
      m.removedNodes.forEach(n => { if (n.nodeType === 1) ro.unobserve(n); });
    }
  }).observe(container, { childList: true });
}
