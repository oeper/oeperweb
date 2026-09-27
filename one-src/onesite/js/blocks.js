/* oneSite — the section library. Each block: name, icon, cat, desc, variants, make() (starter content),
   fields (what the inspector edits) and render(data, variant, ctx) → HTML. Text marked data-k="path" can be
   typed over right on the page; data-img="path" pictures open the picture field. */
(() => {
'use strict';
const esc = ONE.esc;
const B = window.BLOCKS = {};
const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
// editable text; line breaks survive
const T = (d, k, tag = 'p', cls = '') => `<${tag}${cls ? ` class="${cls}"` : ''} data-k="${k}">${esc(get(d, k) || '').replace(/\n/g, '<br>')}</${tag}>`;
const img = (d, k, ctx, cls = '', alt) => { const v = get(d, k) || ''; return `<img${cls ? ` class="${cls}"` : ''} src="${esc(ctx.img(v))}" alt="${esc(alt != null ? alt : get(d, k + 'Alt') || '')}" data-img="${k}" loading="lazy">`; };
const btn = (d, k, ctx, cls = 'btn') => { const b = get(d, k); if (!b || !b.label) return ''; return `<a class="${cls}" href="${esc(ctx.href(b.url))}" data-k="${k}.label" data-link="${k}">${esc(b.label)}</a>`; };
const icon = n => `<span class="ico" aria-hidden="true">${esc(n || 'star')}</span>`;
const list = (d, k, fn) => (get(d, k) || []).map((it, i) => fn(it, `${k}.${i}`, i)).join('');
B._T = T; B._img = img; B._btn = btn;

B.nav = {
  name:'Header', icon:'web_asset', cat:'Global', desc:'Logo and links to your pages', global:true,
  variants:{ split:'Logo left, links right', center:'Centered', bold:'With a button' },
  make:() => ({ logo:'My Site', cta:{ label:'Contact', url:'#contact' } }),
  fields:[['logo', 'text', 'Site name'], ['cta', 'link', 'Button (with a button layout)']],
  render:(d, v, ctx) => `<header class="s-nav v-${v}"><div class="wrap nav-in">
    <a class="logo" href="${esc(ctx.href('page:' + ctx.homeId))}"><span data-k="logo">${esc(d.logo)}</span></a>
    <input type="checkbox" id="navt" class="nav-t" aria-label="Menu"><label for="navt" class="nav-b" aria-hidden="true"><i></i><i></i><i></i></label>
    <nav class="links">${ctx.pages.map(p => `<a href="${esc(ctx.href('page:' + p.id))}"${p.id === ctx.pageId ? ' aria-current="page"' : ''}>${esc(p.name)}</a>`).join('')}${v === 'bold' ? btn(d, 'cta', ctx, 'btn sm') : ''}</nav>
  </div></header>`
};
B.hero = {
  name:'Hero', icon:'star', cat:'Intro', desc:'A big headline to open the page',
  variants:{ center:'Centered', split:'Picture beside', cover:'Picture behind' },
  make:() => ({ kicker:'Welcome', title:'Make something people remember', text:'A short sentence about what you do and who it’s for. Keep it clear and friendly.', btn1:{ label:'Get started', url:'#contact' }, btn2:{ label:'Learn more', url:'#about' }, image:'ph:hero' }),
  fields:[['kicker', 'text', 'Small line above'], ['title', 'text', 'Headline'], ['text', 'area', 'Text'], ['btn1', 'link', 'Main button'], ['btn2', 'link', 'Second button'], ['image', 'image', 'Picture']],
  render:(d, v, ctx) => v === 'split'
    ? `<div class="wrap hero-split"><div class="hero-copy" data-reveal>${T(d, 'kicker', 'p', 'kicker')}${T(d, 'title', 'h1')}${T(d, 'text', 'p', 'lead')}<div class="btns">${btn(d, 'btn1', ctx)}${btn(d, 'btn2', ctx, 'btn ghost')}</div></div><div class="hero-media" data-reveal>${img(d, 'image', ctx, 'rounded')}</div></div>`
    : `${v === 'cover' ? `<div class="cover-bg">${img(d, 'image', ctx)}</div>` : ''}<div class="wrap hero-center" data-reveal>${T(d, 'kicker', 'p', 'kicker')}${T(d, 'title', 'h1')}${T(d, 'text', 'p', 'lead')}<div class="btns">${btn(d, 'btn1', ctx)}${btn(d, 'btn2', ctx, 'btn ghost')}</div></div>`
};
B.features = {
  name:'Features', icon:'grid_view', cat:'Content', desc:'Three or four things you’re great at',
  variants:{ cards:'Cards', icons:'Icons in a row', list:'List beside a title' },
  make:() => ({ title:'Why people choose us', text:'A sentence that sums up what makes you different.', items:[
    { icon:'bolt', title:'Fast', text:'Say what this means for the people you help.' },
    { icon:'favorite', title:'Friendly', text:'A line or two is plenty here.' },
    { icon:'verified', title:'Reliable', text:'Keep each one short and specific.' }] }),
  fields:[['title', 'text', 'Title'], ['text', 'area', 'Intro'], ['items', 'list', 'Features', { make:() => ({ icon:'star', title:'New feature', text:'Describe it in a sentence.' }), fields:[['icon', 'icon', 'Icon'], ['title', 'text', 'Title'], ['text', 'area', 'Text']], max:8 }]],
  render:(d, v) => v === 'list'
    ? `<div class="wrap two"><div data-reveal>${T(d, 'title', 'h2')}${T(d, 'text', 'p', 'lead')}</div><div class="flist">${list(d, 'items', (it, k) => `<div class="fitem" data-reveal>${icon(it.icon)}<div>${T(d, k + '.title', 'h3')}${T(d, k + '.text')}</div></div>`)}</div></div>`
    : `<div class="wrap"><div class="head" data-reveal>${T(d, 'title', 'h2')}${T(d, 'text', 'p', 'lead')}</div><div class="grid ${v === 'cards' ? 'cards' : 'plain'}">${list(d, 'items', (it, k) => `<div class="${v === 'cards' ? 'card' : 'cell'}" data-reveal>${icon(it.icon)}${T(d, k + '.title', 'h3')}${T(d, k + '.text')}</div>`)}</div></div>`
};
B.about = {
  name:'Text and picture', icon:'art_track', cat:'Content', desc:'Tell your story next to a picture',
  variants:{ right:'Picture right', left:'Picture left', stack:'Picture above' },
  make:() => ({ kicker:'About', title:'A little about us', text:'Write a few friendly sentences about who you are, how you started, and what you care about.\nA second paragraph can go into a bit more detail.', btn:{ label:'Get in touch', url:'#contact' }, image:'ph:about' }),
  fields:[['kicker', 'text', 'Small line above'], ['title', 'text', 'Title'], ['text', 'area', 'Text'], ['btn', 'link', 'Button'], ['image', 'image', 'Picture']],
  render:(d, v, ctx) => v === 'stack'
    ? `<div class="wrap narrow" data-reveal>${img(d, 'image', ctx, 'rounded wide')}${T(d, 'kicker', 'p', 'kicker')}${T(d, 'title', 'h2')}${T(d, 'text', 'p', 'body')}<div class="btns">${btn(d, 'btn', ctx)}</div></div>`
    : `<div class="wrap two ${v === 'left' ? 'flip' : ''}"><div data-reveal>${T(d, 'kicker', 'p', 'kicker')}${T(d, 'title', 'h2')}${T(d, 'text', 'p', 'body')}<div class="btns">${btn(d, 'btn', ctx)}</div></div><div data-reveal>${img(d, 'image', ctx, 'rounded')}</div></div>`
};
B.text = {
  name:'Text', icon:'notes', cat:'Content', desc:'A heading and paragraphs',
  variants:{ left:'Left aligned', center:'Centered' },
  make:() => ({ title:'A heading', text:'Write anything here. Press Enter for a new line.\nThis block is handy for longer writing, policies or announcements.' }),
  fields:[['title', 'text', 'Heading'], ['text', 'area', 'Text']],
  render:(d, v) => `<div class="wrap narrow ${v === 'center' ? 'tc' : ''}" data-reveal>${T(d, 'title', 'h2')}${T(d, 'text', 'p', 'body')}</div>`
};
B.gallery = {
  name:'Gallery', icon:'photo_library', cat:'Media', desc:'A grid of pictures',
  variants:{ grid:'Even grid', mosaic:'Mosaic', row:'Scrolling row' },
  make:() => ({ title:'Gallery', items:[1, 2, 3, 4, 5, 6].map(i => ({ image:'ph:g' + i, caption:'' })) }),
  fields:[['title', 'text', 'Title'], ['items', 'list', 'Pictures', { make:() => ({ image:'ph:g1', caption:'' }), fields:[['image', 'image', 'Picture'], ['caption', 'text', 'Caption']], max:24 }]],
  render:(d, v, ctx) => `<div class="wrap">${T(d, 'title', 'h2', 'tc')}<div class="gal g-${v}">${list(d, 'items', (it, k) => `<figure data-reveal>${img(d, k + '.image', ctx)}${it.caption ? `<figcaption data-k="${k}.caption">${esc(it.caption)}</figcaption>` : ''}</figure>`)}</div></div>`
};
B.stats = {
  name:'Numbers', icon:'monitoring', cat:'Content', desc:'A few big numbers that impress',
  variants:{ row:'In a row', cards:'Cards' },
  make:() => ({ items:[{ num:'10k+', label:'Happy customers' }, { num:'4.9★', label:'Average rating' }, { num:'24/7', label:'Support' }, { num:'12', label:'Years' }] }),
  fields:[['items', 'list', 'Numbers', { make:() => ({ num:'100', label:'Something' }), fields:[['num', 'text', 'Number'], ['label', 'text', 'Label']], max:6 }]],
  render:(d, v) => `<div class="wrap"><div class="stats ${v === 'cards' ? 'cards' : ''}">${list(d, 'items', (it, k) => `<div class="stat${v === 'cards' ? ' card' : ''}" data-reveal>${T(d, k + '.num', 'strong')}${T(d, k + '.label', 'span')}</div>`)}</div></div>`
};
B.testimonials = {
  name:'Testimonials', icon:'format_quote', cat:'Proof', desc:'What people say about you',
  variants:{ cards:'Cards', single:'One big quote' },
  make:() => ({ title:'Kind words', items:[
    { quote:'Honestly the best decision we made this year. Friendly, fast and thoughtful.', name:'Alex Kim', role:'Café owner', image:'ph:p1' },
    { quote:'They listened, and it shows. Everything felt easy from start to finish.', name:'Sam Rivera', role:'Designer', image:'ph:p2' },
    { quote:'I recommend them to everyone. Great work at a fair price.', name:'Jordan Lee', role:'Teacher', image:'ph:p3' }] }),
  fields:[['title', 'text', 'Title'], ['items', 'list', 'Quotes', { make:() => ({ quote:'Something nice someone said.', name:'Name', role:'Role', image:'ph:p1' }), fields:[['quote', 'area', 'Quote'], ['name', 'text', 'Name'], ['role', 'text', 'Role'], ['image', 'image', 'Photo']], max:9 }]],
  render:(d, v, ctx) => v === 'single'
    ? `<div class="wrap narrow tc" data-reveal>${(d.items || []).slice(0, 1).map((it, i) => `<blockquote class="big">“<span data-k="items.${i}.quote">${esc(it.quote)}</span>”</blockquote><div class="who center">${img(d, `items.${i}.image`, ctx, 'avatar')}<div>${T(d, `items.${i}.name`, 'b')}${T(d, `items.${i}.role`, 'small')}</div></div>`).join('')}</div>`
    : `<div class="wrap">${T(d, 'title', 'h2', 'tc')}<div class="grid cards">${list(d, 'items', (it, k) => `<figure class="card quote" data-reveal><blockquote>“<span data-k="${k}.quote">${esc(it.quote)}</span>”</blockquote><figcaption class="who">${img(d, k + '.image', ctx, 'avatar')}<div>${T(d, k + '.name', 'b')}${T(d, k + '.role', 'small')}</div></figcaption></figure>`)}</div></div>`
};
B.pricing = {
  name:'Pricing', icon:'sell', cat:'Sell', desc:'Plans side by side',
  variants:{ cards:'Cards', compact:'Compact' },
  make:() => ({ title:'Simple pricing', text:'No surprises. Change or cancel any time.', items:[
    { name:'Starter', price:'$9', per:'/month', features:'1 project\nEmail support\nAll the basics', btn:{ label:'Choose Starter', url:'#contact' }, hot:false },
    { name:'Pro', price:'$29', per:'/month', features:'10 projects\nPriority support\nEverything in Starter', btn:{ label:'Choose Pro', url:'#contact' }, hot:true },
    { name:'Team', price:'$79', per:'/month', features:'Unlimited projects\nA dedicated helper\nEverything in Pro', btn:{ label:'Talk to us', url:'#contact' }, hot:false }] }),
  fields:[['title', 'text', 'Title'], ['text', 'area', 'Intro'], ['items', 'list', 'Plans', { make:() => ({ name:'Plan', price:'$0', per:'/month', features:'A feature\nAnother feature', btn:{ label:'Choose', url:'#contact' }, hot:false }), fields:[['name', 'text', 'Name'], ['price', 'text', 'Price'], ['per', 'text', 'Per'], ['features', 'area', 'Features (one per line)'], ['btn', 'link', 'Button'], ['hot', 'toggle', 'Highlight this plan']], max:4 }]],
  render:(d, v, ctx) => `<div class="wrap"><div class="head" data-reveal>${T(d, 'title', 'h2')}${T(d, 'text', 'p', 'lead')}</div><div class="grid prices ${v}">${list(d, 'items', (it, k) => `<div class="card plan${it.hot ? ' hot' : ''}" data-reveal>${T(d, k + '.name', 'h3')}<p class="price"><strong data-k="${k}.price">${esc(it.price)}</strong><span data-k="${k}.per">${esc(it.per)}</span></p><ul>${String(it.features || '').split('\n').filter(Boolean).map(f => `<li>${esc(f)}</li>`).join('')}</ul>${btn(d, k + '.btn', ctx, it.hot ? 'btn' : 'btn ghost')}</div>`)}</div></div>`
};
B.faq = {
  name:'Questions', icon:'help', cat:'Content', desc:'Answers to what people ask most',
  variants:{ accordion:'Tap to open', two:'Two columns' },
  make:() => ({ title:'Questions', items:[
    { q:'How long does it take?', a:'Most things are ready within a week. We’ll give you a clear date up front.' },
    { q:'Can I change my mind?', a:'Of course. Just let us know and we’ll sort it out.' },
    { q:'Do you work with small projects?', a:'Yes, small projects are some of our favourites.' }] }),
  fields:[['title', 'text', 'Title'], ['items', 'list', 'Questions', { make:() => ({ q:'A question?', a:'The answer.' }), fields:[['q', 'text', 'Question'], ['a', 'area', 'Answer']], max:20 }]],
  render:(d, v) => `<div class="wrap narrow">${T(d, 'title', 'h2', 'tc')}<div class="faq ${v}">${list(d, 'items', (it, k) => v === 'two' ? `<div data-reveal>${T(d, k + '.q', 'h3')}${T(d, k + '.a')}</div>` : `<details data-reveal><summary data-k="${k}.q">${esc(it.q)}</summary>${T(d, k + '.a')}</details>`)}</div></div>`
};
B.team = {
  name:'Team', icon:'groups', cat:'Proof', desc:'The people behind it',
  variants:{ grid:'Grid', round:'Round photos' },
  make:() => ({ title:'Meet the team', items:[{ name:'Riley Chen', role:'Founder', image:'ph:p1' }, { name:'Morgan Park', role:'Design', image:'ph:p2' }, { name:'Casey Diaz', role:'Support', image:'ph:p3' }, { name:'Jamie Fox', role:'Engineering', image:'ph:p4' }] }),
  fields:[['title', 'text', 'Title'], ['items', 'list', 'People', { make:() => ({ name:'Name', role:'Role', image:'ph:p1' }), fields:[['name', 'text', 'Name'], ['role', 'text', 'Role'], ['image', 'image', 'Photo']], max:16 }]],
  render:(d, v, ctx) => `<div class="wrap">${T(d, 'title', 'h2', 'tc')}<div class="grid team ${v}">${list(d, 'items', (it, k) => `<div class="member" data-reveal>${img(d, k + '.image', ctx, v === 'round' ? 'avatar xl' : 'rounded portrait')}${T(d, k + '.name', 'h3')}${T(d, k + '.role', 'p', 'muted')}</div>`)}</div></div>`
};
B.logos = {
  name:'Trusted by', icon:'workspace_premium', cat:'Proof', desc:'Names of people you’ve worked with',
  variants:{ row:'Row of names' },
  make:() => ({ title:'Trusted by teams at', text:'Northwind · Lumen · Acme Co · Riverbend · Orbit' }),
  fields:[['title', 'text', 'Line above'], ['text', 'text', 'Names (separate with ·)']],
  render:d => `<div class="wrap tc" data-reveal>${T(d, 'title', 'p', 'kicker')}<p class="logos">${String(d.text || '').split('·').map(s => s.trim()).filter(Boolean).map(s => `<span>${esc(s)}</span>`).join('')}</p></div>`
};
B.cta = {
  name:'Call to action', icon:'campaign', cat:'Sell', desc:'A bold banner with a button',
  variants:{ banner:'Banner', card:'Card' },
  make:() => ({ title:'Ready when you are', text:'It only takes a minute to get started.', btn:{ label:'Get started', url:'#contact' } }),
  fields:[['title', 'text', 'Title'], ['text', 'area', 'Text'], ['btn', 'link', 'Button']],
  render:(d, v, ctx) => `<div class="wrap"><div class="cta ${v === 'card' ? 'card' : ''}" data-reveal>${T(d, 'title', 'h2')}${T(d, 'text', 'p', 'lead')}<div class="btns">${btn(d, 'btn', ctx)}</div></div></div>`
};
B.contact = {
  name:'Contact', icon:'mail', cat:'Sell', desc:'How to reach you, with a message form',
  variants:{ split:'Details and form', simple:'Just the details' },
  make:() => ({ title:'Say hello', text:'We usually reply within a day.', email:'hello@example.com', phone:'+1 555 0100', address:'123 Main Street, Springfield' }),
  fields:[['title', 'text', 'Title'], ['text', 'area', 'Text'], ['email', 'text', 'Email (the form sends here)'], ['phone', 'text', 'Phone'], ['address', 'area', 'Address']],
  render:(d, v) => {
    const info = `<div data-reveal>${T(d, 'title', 'h2')}${T(d, 'text', 'p', 'lead')}<ul class="info">${d.email ? `<li>${icon('mail')}<a href="mailto:${esc(d.email)}" data-k="email">${esc(d.email)}</a></li>` : ''}${d.phone ? `<li>${icon('call')}<span data-k="phone">${esc(d.phone)}</span></li>` : ''}${d.address ? `<li>${icon('location_on')}<span data-k="address">${esc(d.address).replace(/\n/g, '<br>')}</span></li>` : ''}</ul></div>`;
    return v === 'simple' ? `<div class="wrap narrow tc">${info}</div>` : `<div class="wrap two">${info}<form class="card form" data-reveal data-mailto="${esc(d.email || '')}"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Message<textarea name="message" rows="4" required></textarea></label><button class="btn" type="submit">Send message</button></form></div>`;
  }
};
B.video = {
  name:'Video', icon:'smart_display', cat:'Media', desc:'A YouTube or Vimeo video',
  variants:{ wide:'Wide', narrow:'Narrow' },
  make:() => ({ title:'See it in action', url:'' }),
  fields:[['title', 'text', 'Title'], ['url', 'text', 'YouTube or Vimeo link']],
  render:(d, v) => {
    const u = String(d.url || ''), yt = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(u), vm = /vimeo\.com\/(\d+)/.exec(u);
    const src = yt ? `https://www.youtube-nocookie.com/embed/${yt[1]}` : vm ? `https://player.vimeo.com/video/${vm[1]}` : '';
    return `<div class="wrap ${v === 'narrow' ? 'narrow' : ''}">${T(d, 'title', 'h2', 'tc')}<div class="video" data-reveal>${src ? `<iframe src="${esc(src)}" title="${esc(d.title || 'Video')}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>` : '<div class="video-empty">Paste a YouTube or Vimeo link in the panel on the right</div>'}</div></div>`;
  }
};
B.footer = {
  name:'Footer', icon:'call_to_action', cat:'Global', desc:'Links and small print at the bottom', global:true,
  variants:{ simple:'Simple', columns:'With columns' },
  make:() => ({ text:'Made with care.', note:'© ' + new Date().getFullYear() + ' My Site. All rights reserved.', social:'' }),
  fields:[['text', 'area', 'Short line about you'], ['note', 'text', 'Small print'], ['social', 'text', 'Social links (separate with spaces)']],
  render:(d, v, ctx) => {
    const soc = String(d.social || '').split(/\s+/).filter(Boolean).map(u => { const n = (/(instagram|facebook|twitter|x\.com|youtube|tiktok|linkedin|github|threads|bsky)/i.exec(u) || [, 'link'])[1].replace('.com', ''); return `<a href="${esc(/^https?:/.test(u) ? u : 'https://' + u)}" rel="noopener" target="_blank">${esc(n[0].toUpperCase() + n.slice(1))}</a>`; }).join('');
    return `<footer class="s-foot v-${v}"><div class="wrap">${v === 'columns' ? `<div class="fcols"><div><b class="logo">${esc(ctx.site.header.data.logo || '')}</b>${T(d, 'text')}</div><nav>${ctx.pages.map(p => `<a href="${esc(ctx.href('page:' + p.id))}">${esc(p.name)}</a>`).join('')}</nav>${soc ? `<nav>${soc}</nav>` : ''}</div>` : `${T(d, 'text')}${soc ? `<nav class="soc">${soc}</nav>` : ''}`}${T(d, 'note', 'p', 'small')}</div></footer>`;
  }
};

B.ORDER = ['hero', 'features', 'about', 'text', 'gallery', 'stats', 'testimonials', 'logos', 'team', 'pricing', 'faq', 'cta', 'contact', 'video'];
B.new = type => { const b = B[type]; return { id:ONE.uid(), type, v:Object.keys(b.variants)[0], bg:'default', pad:'m', data:b.make() }; };
})();
