// Shared enter-motion utility: fades/slides in dynamically-inserted content
// and fades in images as they load, so nothing on the site just pops into
// existence. observeList() is the main entry point — call it once on a
// container element and every card/row ever appended or replaced into it
// (including future re-renders) gets animated automatically via a
// MutationObserver, with zero further wiring needed at each render() call site.

let injected = false;
function injectStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
@keyframes oe-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.oe-enter {
  animation: oe-enter 320ms cubic-bezier(0.2, 0, 0, 1) both;
}
img.oe-img-fade {
  opacity: 0;
  transition: opacity 260ms ease;
}
img.oe-img-fade.oe-img-loaded {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .oe-enter { animation: none; }
  img.oe-img-fade { transition: none; opacity: 1; }
}
`;
  document.head.appendChild(style);
}

function fadeImg(img) {
  if (img.dataset.oeFade) return;
  img.dataset.oeFade = '1';
  img.classList.add('oe-img-fade');
  if (img.complete && img.naturalWidth > 0) {
    requestAnimationFrame(() => img.classList.add('oe-img-loaded'));
  } else {
    img.addEventListener('load', () => img.classList.add('oe-img-loaded'), { once: true });
    img.addEventListener('error', () => img.classList.add('oe-img-loaded'), { once: true });
  }
}

function reveal(el, index = 0) {
  if (!(el instanceof HTMLElement)) return;
  injectStyles();
  el.classList.add('oe-enter');
  el.style.animationDelay = Math.min(index * 30, 300) + 'ms';
  if (el.tagName === 'IMG') fadeImg(el);
  else el.querySelectorAll('img').forEach(fadeImg);
}

const observed = new WeakSet();
function observeList(container) {
  if (!container || observed.has(container)) return;
  observed.add(container);
  injectStyles();
  let index = 0;
  const mo = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        reveal(node, index++);
      });
    }
  });
  mo.observe(container, { childList: true });
  Array.from(container.children).forEach(child => reveal(child, index++));
  return mo;
}

export { injectStyles, fadeImg, reveal, observeList };
