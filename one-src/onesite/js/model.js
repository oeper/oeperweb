/* oneSite — the site model, starter templates, undo and saving (localStorage ob-lib / ob-doc-<id>). */
(() => {
'use strict';
const { $, store } = ONE;
const M = window.M = {};
const blk = (type, v, data, extra) => Object.assign(BLOCKS.new(type), v ? { v } : {}, extra || {}, { data:Object.assign(BLOCKS[type].make(), data || {}) });
const page = (name, sections) => ({ id:ONE.uid(), name, sections });

M.newSite = (title = 'My Site', opts = {}) => ({
  id:ONE.uid(), title, updated:Date.now(),
  theme:Object.assign({ palette:'ocean', font:'modern', radius:'soft', accent:null }, opts.theme),
  settings:Object.assign({ description:'', favicon:'✨', anim:true }, opts.settings),
  header:blk('nav', opts.navV || 'bold', { logo:title }), footer:blk('footer', 'simple', { note:`© ${new Date().getFullYear()} ${title}. All rights reserved.` }),
  pages:opts.pages || [page('Home', [blk('hero'), blk('features'), blk('about'), blk('cta', null, null, { bg:'alt' }), blk('contact')])],
  published:null
});

/* ---------- templates ---------- */
M.TEMPLATES = {
  business:{ name:'Business', desc:'A company or service with pricing and contact', icon:'business_center', make:() => M.newSite('Northwind Studio', { theme:{ palette:'ocean', font:'modern' }, pages:[
    page('Home', [blk('hero', 'split', { kicker:'Design & build', title:'Websites that bring you customers', text:'We design and build fast, friendly websites for small businesses — so you can get back to what you love.' }), blk('logos'), blk('features', 'cards'), blk('stats', 'row', null, { bg:'alt' }), blk('testimonials'), blk('cta', 'card')]),
    page('Services', [blk('text', 'center', { title:'What we do', text:'From a single landing page to a full online shop, we’ll help you look great online.' }, { pad:'s' }), blk('features', 'list', { title:'Services' }), blk('pricing', null, null, { bg:'alt' }), blk('faq')]),
    page('Contact', [blk('contact')])] }) },
  portfolio:{ name:'Portfolio', desc:'Show off your work with a big gallery', icon:'photo_camera', make:() => M.newSite('Avery Lane', { theme:{ palette:'mono', font:'editorial', radius:'sharp' }, navV:'split', pages:[
    page('Home', [blk('hero', 'center', { kicker:'Photographer & designer', title:'Avery Lane', text:'Quiet, honest pictures of people and places.', btn1:{ label:'See the work', url:'#gallery' }, btn2:null }), blk('gallery', 'mosaic', { title:'Selected work' }), blk('about', 'left', { title:'Hello, I’m Avery' }, { bg:'alt' }), blk('contact', 'simple', { title:'Let’s make something' })])] }) },
  restaurant:{ name:'Restaurant', desc:'Menu highlights, hours and how to find you', icon:'restaurant', make:() => M.newSite('Casa Verde', { theme:{ palette:'sand', font:'classic', radius:'round' }, settings:{ favicon:'🍝' }, pages:[
    page('Home', [blk('hero', 'cover', { kicker:'Est. 2012', title:'Fresh pasta, slow evenings', text:'Seasonal Italian cooking in the heart of town.', btn1:{ label:'Book a table', url:'#contact' }, btn2:{ label:'See the menu', url:'#pricing' } }),
      blk('features', 'icons', { title:'Why guests come back', items:[{ icon:'eco', title:'Local produce', text:'Vegetables from farms within 30 miles.' }, { icon:'restaurant', title:'Made in house', text:'Pasta rolled fresh every morning.' }, { icon:'wine_bar', title:'Natural wine', text:'A small list we love to talk about.' }] }),
      blk('pricing', 'compact', { title:'Tonight’s favourites', text:'A few dishes from the menu.', items:[{ name:'Tagliatelle', price:'$18', per:'', features:'Slow-cooked ragù\nParmesan', btn:null, hot:false }, { name:'Risotto', price:'$21', per:'', features:'Wild mushrooms\nThyme butter', btn:null, hot:true }, { name:'Tiramisu', price:'$9', per:'', features:'House recipe', btn:null, hot:false }] }, { bg:'alt' }),
      blk('gallery', 'row', { title:'Inside Casa Verde' }), blk('contact', 'split', { title:'Book a table', text:'Open Tue–Sun, 5pm–11pm.' })])] }) },
  event:{ name:'Event', desc:'A launch, meetup or wedding with a schedule', icon:'celebration', make:() => M.newSite('Launch Night', { theme:{ palette:'neon', font:'bold', radius:'round' }, settings:{ favicon:'🎉' }, navV:'center', pages:[
    page('Home', [blk('hero', 'center', { kicker:'June 14 · 7pm', title:'You’re invited', text:'An evening of music, food and good company.', btn1:{ label:'RSVP', url:'#contact' }, btn2:{ label:'Schedule', url:'#faq' } }, { pad:'l' }), blk('stats', 'cards', { items:[{ num:'300', label:'Guests' }, { num:'5', label:'Artists' }, { num:'1', label:'Night only' }] }), blk('faq', 'two', { title:'Schedule', items:[{ q:'7:00 · Doors', a:'Drinks and snacks at the bar.' }, { q:'8:00 · Live music', a:'Three bands, two stages.' }, { q:'10:00 · Dance floor', a:'DJ until late.' }, { q:'12:00 · Goodnight', a:'See you next year!' }] }), blk('contact', 'split', { title:'RSVP', text:'Let us know you’re coming.' })])] }) },
  personal:{ name:'Personal', desc:'A simple page about you', icon:'person', make:() => M.newSite('Jamie Park', { theme:{ palette:'grape', font:'friendly', radius:'round' }, settings:{ favicon:'👋' }, navV:'split', pages:[
    page('Home', [blk('hero', 'split', { kicker:'Hi there', title:'I’m Jamie. I make things for the web.', text:'Currently studying, building side projects and drinking too much tea.', btn1:{ label:'Say hi', url:'#contact' }, btn2:null, image:'ph:p1' }), blk('about', 'right', { kicker:'About', title:'A bit about me' }, { bg:'alt' }), blk('features', 'icons', { title:'What I’m into', text:'' }), blk('contact', 'simple')])] }) },
  blank:{ name:'Blank', desc:'Just a header and footer', icon:'draft', make:() => M.newSite('My Site', { pages:[page('Home', [blk('hero')])] }) }
};
M.PAGE_TEMPLATES = {
  blank:{ name:'Blank page', icon:'draft', make:() => [blk('text')] },
  about:{ name:'About', icon:'info', make:() => [blk('about', 'right', { kicker:'About us' }), blk('team'), blk('stats', 'row', null, { bg:'alt' })] },
  services:{ name:'Services', icon:'design_services', make:() => [blk('features', 'list', { title:'Services' }), blk('pricing', null, null, { bg:'alt' }), blk('faq')] },
  work:{ name:'Work', icon:'photo_library', make:() => [blk('text', 'center', { title:'Our work', text:'A few projects we’re proud of.' }, { pad:'s' }), blk('gallery', 'mosaic', { title:'' })] },
  contact:{ name:'Contact', icon:'mail', make:() => [blk('contact'), blk('faq', 'accordion', null, { bg:'alt' })] }
};
M.newPage = (name, tpl = 'blank') => page(name, (M.PAGE_TEMPLATES[tpl] || M.PAGE_TEMPLATES.blank).make());

/* ---------- state, undo ---------- */
M.site = null; M.pi = 0; M.hooks = [];
M.page = () => M.site.pages[M.pi] || M.site.pages[0];
M.find = id => {
  if (M.site.header.id === id) return { b:M.site.header, list:null, i:-1 };
  if (M.site.footer.id === id) return { b:M.site.footer, list:null, i:-1 };
  const list = M.page().sections, i = list.findIndex(b => b.id === id); return i < 0 ? null : { b:list[i], list, i };
};
const U = { list:[], i:-1 };
const snap = () => JSON.stringify({ site:M.site, pi:M.pi });
M.resetUndo = () => { U.list = [snap()]; U.i = 0; };
M.record = () => { const s = snap(); if (U.list[U.i] === s) return; U.list.splice(U.i + 1); U.list.push(s); if (U.list.length > 80) U.list.shift(); U.i = U.list.length - 1; };
M.go = d => { const j = U.i + d; if (j < 0 || j >= U.list.length) return ONE.toast(d < 0 ? 'Nothing to undo.' : 'Nothing to redo.'); U.i = j; const s = JSON.parse(U.list[j]); M.site = s.site; M.pi = Math.min(s.pi, M.site.pages.length - 1); M.changed(false, 'all'); };
M.canUndo = () => U.i > 0; M.canRedo = () => U.i < U.list.length - 1;
// what: 'all' (re-render everything), a block id (just that section), 'none'
M.changed = (rec = true, what = 'all') => { M.pristine = false; if (rec) M.record(); M.hooks.forEach(f => { try { f(what); } catch (e) { console.error(e); } }); M.dirty(); };

/* ---------- saving ---------- */
M.lib = store.get('ob-lib', { current:null, docs:{} });
let saveT;
M.dirty = () => { if (M.pristine) return; const s = $('#saveState'); if (s) { s.textContent = 'Saving…'; s.classList.add('busy'); } clearTimeout(saveT); saveT = setTimeout(M.save, 800); };
M.save = () => {
  clearTimeout(saveT); if (!M.site || M.pristine) return true;
  M.site.title = ($('#docTitle') && $('#docTitle').value.trim()) || M.site.title || 'My Site'; M.site.updated = Date.now();
  const ok = store.set('ob-doc-' + M.site.id, M.site);
  M.lib.docs[M.site.id] = { title:M.site.title, updated:M.site.updated, pages:M.site.pages.length, palette:M.site.theme.palette };
  M.lib.current = M.site.id; store.set('ob-lib', M.lib);
  const st = $('#saveState'); if (st) { st.classList.remove('busy'); st.textContent = ok ? 'Saved' : 'Not saved'; st.title = ok ? 'Saved in this browser' : 'This browser’s storage is full. Big pictures use a lot of space — try smaller ones, or export the site.'; }
  if (!ok) ONE.toast('Couldn’t save: this browser’s storage is full. Try smaller pictures, or export the site.');
  return ok;
};
M.open = (site, pristine = false) => {
  if (M.site && !M.pristine && M.lib.docs[M.site.id]) M.save();
  M.site = site; M.pi = 0; M.pristine = pristine; $('#docTitle').value = site.title;
  M.resetUndo(); M.hooks.forEach(f => f('open'));
  if (!pristine) { M.lib.current = site.id; store.set('ob-lib', M.lib); }
};
})();
