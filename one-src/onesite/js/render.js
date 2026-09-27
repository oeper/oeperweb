/* oneSite — themes, the site's CSS, placeholder art and whole-page rendering.
   One renderer serves the editor canvas, the preview and every export, so what you see is what ships.
   mode: 'edit' (canvas, no animations/forms), 'single' (one file, #/page routing), 'multi' (page.html files). */
(() => {
'use strict';
const esc = ONE.esc;
const R = window.SITE = {};

R.PALETTES = {
  ocean:{ name:'Ocean', bg:'#ffffff', surface:'#f4f7fb', alt:'#eef3f9', text:'#0f1b2d', muted:'#51607a', accent:'#1f6feb', on:'#ffffff', dark:false },
  forest:{ name:'Forest', bg:'#fbfaf6', surface:'#f1f3ec', alt:'#eaeee2', text:'#1d2a1e', muted:'#56644f', accent:'#2f7d4f', on:'#ffffff', dark:false },
  sunset:{ name:'Sunset', bg:'#fffaf5', surface:'#fff1e6', alt:'#ffe9d8', text:'#2b1a12', muted:'#7a5a48', accent:'#e8590c', on:'#ffffff', dark:false },
  grape:{ name:'Grape', bg:'#fcfaff', surface:'#f4effc', alt:'#efe7fb', text:'#221533', muted:'#65557e', accent:'#7c3aed', on:'#ffffff', dark:false },
  coral:{ name:'Coral', bg:'#fffafa', surface:'#fff0f0', alt:'#ffe7e6', text:'#2d1616', muted:'#7d5555', accent:'#e5484d', on:'#ffffff', dark:false },
  mono:{ name:'Mono', bg:'#ffffff', surface:'#f5f5f5', alt:'#efefef', text:'#111111', muted:'#5c5c5c', accent:'#111111', on:'#ffffff', dark:false },
  sand:{ name:'Sand', bg:'#faf6ef', surface:'#f2ebdf', alt:'#ece3d3', text:'#2a241b', muted:'#6d6252', accent:'#a0692a', on:'#ffffff', dark:false },
  midnight:{ name:'Midnight', bg:'#0d1117', surface:'#161b24', alt:'#121823', text:'#e8edf5', muted:'#9aa6b8', accent:'#58a6ff', on:'#0d1117', dark:true },
  neon:{ name:'Neon', bg:'#0b0b10', surface:'#15151d', alt:'#111118', text:'#f1f1f6', muted:'#a0a0b4', accent:'#c6f432', on:'#0b0b10', dark:true }
};
R.FONTS = {
  modern:{ name:'Modern', head:'Space Grotesk', body:'Inter', w:'600' },
  classic:{ name:'Classic', head:'Playfair Display', body:'Source Sans 3', w:'700' },
  friendly:{ name:'Friendly', head:'Nunito', body:'Nunito', w:'800' },
  editorial:{ name:'Editorial', head:'Fraunces', body:'Inter', w:'600' },
  elegant:{ name:'Elegant', head:'Cormorant Garamond', body:'Lato', w:'600' },
  tech:{ name:'Tech', head:'JetBrains Mono', body:'IBM Plex Sans', w:'700' },
  bold:{ name:'Bold', head:'Archivo Black', body:'Archivo', w:'400' }
};
R.RADII = { sharp:['Sharp', 0, 0], soft:['Soft', 10, 10], round:['Round', 20, 999] };

const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const A = hexToRgb(a), C = hexToRgb(b); return '#' + A.map((v, i) => Math.round(v + (C[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
R.pal = site => Object.assign({}, R.PALETTES[site.theme.palette] || R.PALETTES.ocean, site.theme.accent ? { accent:site.theme.accent } : {});

/* ---------- placeholder art: soft shapes in the site's own colours ---------- */
R.placeholder = (kind, site) => {
  const p = R.pal(site), a = p.accent, s = p.dark ? mix(p.surface, '#ffffff', .06) : mix(p.bg, a, .12), s2 = mix(a, p.dark ? '#000000' : '#ffffff', .45);
  const seed = [...kind].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7), rnd = i => ((seed * (i + 3) * 2654435761) >>> 0) / 4294967296;
  const portrait = /^p\d/.test(kind), W = portrait ? 400 : 800, H = portrait ? 400 : kind === 'hero' ? 600 : 560;
  let body = `<rect width="${W}" height="${H}" fill="${s}"/>`;
  if (portrait) body += `<circle cx="200" cy="160" r="72" fill="${s2}"/><path d="M70 400c0-80 60-130 130-130s130 50 130 130z" fill="${a}" opacity=".75"/>`;
  else for (let i = 0; i < 5; i++) body += `<circle cx="${Math.round(rnd(i) * W)}" cy="${Math.round(rnd(i + 9) * H)}" r="${Math.round(60 + rnd(i + 20) * 170)}" fill="${i % 2 ? s2 : a}" opacity="${(.25 + rnd(i + 30) * .45).toFixed(2)}"/>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`);
};

/* ---------- the site's stylesheet ---------- */
R.css = site => {
  const p = R.pal(site), f = R.FONTS[site.theme.font] || R.FONTS.modern, rad = R.RADII[site.theme.radius] || R.RADII.soft;
  const line = p.dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)', soft = mix(p.bg, p.accent, p.dark ? .18 : .1);
  return `:root{--bg:${p.bg};--surface:${p.surface};--alt:${p.alt};--text:${p.text};--muted:${p.muted};--accent:${p.accent};--on:${p.on};--soft:${soft};--line:${line};--r:${rad[1]}px;--rb:${rad[2]}px;--hf:'${f.head}',system-ui,sans-serif;--bf:'${f.body}',system-ui,sans-serif;--hw:${f.w}}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.65 var(--bf);-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}a{color:var(--accent)}h1,h2,h3{font-family:var(--hf);font-weight:var(--hw);line-height:1.12;margin:0 0 .45em;letter-spacing:-.01em}
h1{font-size:clamp(2.3rem,5.4vw,4.2rem)}h2{font-size:clamp(1.8rem,3.6vw,2.7rem)}h3{font-size:1.2rem}p{margin:0 0 1em}
.wrap{max-width:1140px;margin:0 auto;padding:0 clamp(18px,4vw,32px)}.narrow{max-width:780px}.tc{text-align:center}.muted{color:var(--muted)}.small{font-size:.85rem;color:var(--muted);margin:0}
section{position:relative;padding:var(--pad) 0}.pad-s{--pad:clamp(32px,5vw,48px)}.pad-m{--pad:clamp(56px,8vw,100px)}.pad-l{--pad:clamp(84px,12vw,160px)}
.bg-alt{background:var(--alt)}.bg-accent{background:var(--accent);color:var(--on)}.bg-accent .muted,.bg-accent .lead,.bg-accent .kicker{color:inherit;opacity:.85}.bg-accent .btn{background:var(--on);color:var(--accent)}.bg-accent .btn.ghost{background:transparent;color:var(--on)}
.bg-dark{background:${p.dark ? '#05070b' : '#111418'};color:#f2f4f7;--muted:#aab3c0;--surface:#1b2027;--line:rgba(255,255,255,.1)}
.bg-image{color:#fff;background-size:cover;background-position:center;--muted:#e6e6e6}.bg-image::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.35))}.bg-image>*{position:relative}
.kicker{text-transform:uppercase;letter-spacing:.12em;font-size:.78rem;font-weight:700;color:var(--accent);margin-bottom:.8em}.lead{font-size:1.15rem;color:var(--muted);max-width:640px}.tc .lead,.head .lead,.hero-center .lead,.cta .lead{margin-left:auto;margin-right:auto}.body{white-space:normal}
.btns{display:flex;gap:12px;flex-wrap:wrap;margin-top:1.6em}.tc .btns,.hero-center .btns,.cta .btns{justify-content:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:.85em 1.5em;border-radius:var(--rb);background:var(--accent);color:var(--on);font-weight:600;text-decoration:none;border:0;cursor:pointer;font:600 1rem var(--bf);transition:transform .2s,box-shadow .2s,filter .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px -8px var(--accent);filter:brightness(1.05)}
.btn.ghost{background:transparent;color:inherit;box-shadow:inset 0 0 0 2px currentColor}.btn.ghost:hover{box-shadow:inset 0 0 0 2px currentColor,0 8px 20px -10px currentColor}.btn.sm{padding:.55em 1.1em;font-size:.92rem}
.rounded{border-radius:var(--r);width:100%;aspect-ratio:4/3;object-fit:cover}.rounded.wide{aspect-ratio:16/8;margin-bottom:28px}.rounded.portrait{aspect-ratio:1;margin-bottom:14px}
.avatar{width:44px;height:44px;border-radius:50%;object-fit:cover}.avatar.xl{width:140px;height:140px;margin:0 auto 14px}
.ico{font-family:'Material Symbols Rounded';font-size:28px;line-height:1;display:inline-grid;place-items:center;width:52px;height:52px;border-radius:calc(var(--r) * .8 + 6px);background:var(--soft);color:var(--accent);margin-bottom:16px;font-variation-settings:'FILL' 1;-webkit-font-feature-settings:'liga';font-feature-settings:'liga'}
.head{text-align:center;margin:0 auto 44px;max-width:720px}
.grid{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.card{background:var(--surface);border-radius:var(--r);padding:clamp(22px,3vw,32px);box-shadow:0 1px 0 var(--line),0 12px 32px -22px rgba(0,0,0,.35)}.bg-alt .card{background:var(--bg)}
.cell{padding:6px}.two{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,6vw,72px);align-items:center}.two.flip>:first-child{order:2}
/* nav */
.s-nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.nav-in{display:flex;align-items:center;gap:24px;min-height:68px}.logo{font:var(--hw) 1.25rem var(--hf);color:inherit;text-decoration:none;margin-right:auto}
.links{display:flex;align-items:center;gap:6px}.links a:not(.btn){color:inherit;text-decoration:none;padding:.45em .8em;border-radius:var(--rb);opacity:.8;font-weight:500}.links a:not(.btn):hover,.links a[aria-current]{opacity:1;background:var(--soft)}
.v-center .nav-in{flex-direction:column;gap:6px;padding:14px 0}.v-center .logo{margin:0}.nav-t,.nav-b{display:none}
/* hero */
.hero-center{text-align:center;max-width:900px}.hero-split{display:grid;grid-template-columns:1.05fr 1fr;gap:clamp(28px,6vw,72px);align-items:center}
.cover-bg{position:absolute;inset:0;overflow:hidden}.cover-bg img{width:100%;height:100%;object-fit:cover}.cover-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.25))}.has-cover{color:#fff;--muted:#eee}.has-cover .hero-center{position:relative}.has-cover .kicker{color:#fff}
/* features, stats */
.flist{display:grid;gap:22px}.fitem{display:flex;gap:18px}.fitem .ico{flex:none;margin:0}.fitem h3{margin-bottom:.25em}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:24px;text-align:center}.stat strong{display:block;font:var(--hw) clamp(2.2rem,4.5vw,3.2rem)/1.1 var(--hf);color:var(--accent)}.stat span{color:var(--muted)}.bg-accent .stat strong{color:inherit}
/* gallery */
.gal{display:grid;gap:14px;margin-top:28px}.gal figure{margin:0}.gal img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--r)}.gal figcaption{font-size:.9rem;color:var(--muted);margin-top:6px}
.g-grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.g-mosaic{grid-template-columns:repeat(4,1fr);grid-auto-rows:180px}.g-mosaic img{aspect-ratio:auto;height:100%}.g-mosaic figure:nth-child(6n+1){grid-column:span 2;grid-row:span 2}
.g-row{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:10px}.g-row figure{flex:0 0 min(78%,380px);scroll-snap-align:start}
/* quotes, team, pricing, faq, logos, cta, contact, video, footer */
.quote blockquote{margin:0 0 18px;font-size:1.05rem}blockquote.big{font:var(--hw) clamp(1.5rem,3.2vw,2.3rem)/1.3 var(--hf);margin:0 0 28px}.who{display:flex;gap:12px;align-items:center}.who.center{justify-content:center;text-align:left}.who b{display:block}.who small{color:var(--muted)}.who p,.who b{margin:0}
.team{text-align:center}.member h3{margin:0}.member p{margin:.2em 0 0}.team.grid{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.prices{align-items:stretch}.plan{display:flex;flex-direction:column}.plan .price{margin:.2em 0 1em}.plan .price strong{font:var(--hw) 2.6rem var(--hf)}.plan .price span{color:var(--muted);margin-left:4px}.plan ul{list-style:none;padding:0;margin:0 0 24px;flex:1}.plan li{padding:.45em 0 .45em 1.7em;position:relative;border-top:1px solid var(--line)}.plan li::before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700}
.plan.hot{background:var(--accent);color:var(--on);transform:scale(1.03)}.plan.hot .price span,.plan.hot li::before{color:inherit}.plan.hot li{border-color:rgba(255,255,255,.25)}.plan.hot .btn{background:var(--on);color:var(--accent)}.compact .plan{padding:22px}
.faq{margin-top:28px}.faq details{border-bottom:1px solid var(--line);padding:18px 0}.faq summary{cursor:pointer;font:600 1.1rem var(--hf);list-style:none;display:flex;justify-content:space-between;gap:16px}.faq summary::after{content:"+";font-size:1.4rem;line-height:1;transition:transform .25s}.faq details[open] summary::after{transform:rotate(45deg)}.faq details p{margin:12px 0 0;color:var(--muted)}.faq.two{display:grid;grid-template-columns:1fr 1fr;gap:28px 40px}
.logos{display:flex;flex-wrap:wrap;justify-content:center;gap:14px 40px;font:var(--hw) 1.3rem var(--hf);opacity:.6;margin:0}
.cta{text-align:center;padding:clamp(8px,2vw,20px)}.cta.card{background:var(--accent);color:var(--on);padding:clamp(32px,6vw,64px)}.cta.card .lead{color:inherit;opacity:.85}.cta.card .btn{background:var(--on);color:var(--accent)}
.info{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:14px}.info li{display:flex;gap:14px;align-items:center}.info .ico{width:42px;height:42px;font-size:22px;margin:0;flex:none}.info a{color:inherit}
.form{display:grid;gap:14px}.form label{display:grid;gap:6px;font-weight:600;font-size:.92rem}.form input,.form textarea{font:inherit;padding:.75em .9em;border-radius:calc(var(--r) * .6 + 4px);border:1px solid var(--line);background:var(--bg);color:var(--text);outline:none;transition:border-color .2s,box-shadow .2s}.form input:focus,.form textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--soft)}
.video{position:relative;aspect-ratio:16/9;border-radius:var(--r);overflow:hidden;background:var(--surface);margin-top:24px}.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.video-empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);padding:20px;text-align:center}
.s-foot{padding:48px 0 32px;border-top:1px solid var(--line);background:var(--alt)}.s-foot p{margin:0 0 .6em}.soc,.fcols nav{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 16px}.s-foot a{color:inherit;opacity:.8;text-decoration:none}.s-foot a:hover{opacity:1}.fcols{display:grid;grid-template-columns:2fr 1fr 1fr;gap:28px;margin-bottom:24px}.fcols nav{flex-direction:column}.fcols .logo{display:block;margin-bottom:.4em}
.els{display:grid;gap:18px}.els>.el>:last-child{margin-bottom:0}.els.cols{gap:28px;align-items:start}.c-two{grid-template-columns:1fr 1fr}.c-three{grid-template-columns:repeat(3,1fr)}
.el-btn{margin-top:0}.tc .el-btn{justify-content:center}.el-img{margin:0}.el-img img{width:100%;object-fit:cover}.el-img.w-small img{max-width:240px}.el-img.w-medium img{max-width:520px}.tc .el-img img{margin:0 auto}
.el-img.sh-rounded img{border-radius:var(--r)}.el-img.sh-circle img{border-radius:50%;aspect-ratio:1}.el-img figcaption{font-size:.9rem;color:var(--muted);margin-top:8px}
.el-icon{display:flex;gap:16px;text-align:left}.el-icon .ico{flex:none;margin:0}.el-icon h3{margin-bottom:.2em}.tc .el-icon{justify-content:center}
.el-list{margin:0;padding-left:1.3em}.el-list li{margin:.3em 0}.el-list.check{list-style:none;padding:0}.el-list.check li{position:relative;padding-left:1.7em}.el-list.check li::before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700}.tc .el-list{display:inline-block;text-align:left}
.el-quote{margin:0;padding:6px 0 6px 20px;border-left:4px solid var(--accent);font:var(--hw) 1.3rem/1.45 var(--hf)}.el-quote p{margin:0 0 .4em}.el-quote cite{font:500 .95rem var(--bf);color:var(--muted);font-style:normal}.tc .el-quote{border:0;padding:0}
.el-hr{border:0;margin:6px 0}.el-hr.line{border-top:1px solid var(--line)}.el-hr.short{width:64px;border-top:3px solid var(--accent);margin-left:0}.tc .el-hr.short{margin:6px auto}.el-hr.dots{text-align:center;height:auto}.el-hr.dots::before{content:"• • •";letter-spacing:.5em;color:var(--muted)}
.el-space.s{height:16px}.el-space.m{height:40px}.el-space.l{height:80px}.el-space.edit{background:repeating-linear-gradient(45deg,transparent 0 6px,rgba(66,133,244,.08) 6px 12px);border-radius:6px}.el-map{margin-top:0}
[data-reveal]{transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}.anim [data-reveal]:not(.in){opacity:0;transform:translateY(18px)}
@media (prefers-reduced-motion:reduce){.anim [data-reveal]{opacity:1!important;transform:none!important}html{scroll-behavior:auto}}
@media (max-width:760px){body{font-size:16px}.c-two,.c-three,.two,.hero-split,.faq.two,.fcols{grid-template-columns:1fr}.two.flip>:first-child{order:0}.g-mosaic{grid-template-columns:1fr 1fr;grid-auto-rows:140px}
  .nav-b{display:grid;gap:5px;cursor:pointer;padding:8px;margin-left:auto}.nav-b i{display:block;width:22px;height:2px;background:currentColor;border-radius:2px}.v-center .nav-b{position:absolute;right:14px;top:16px}
  .links{display:none;position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:stretch;padding:10px 16px 18px;background:var(--bg);border-bottom:1px solid var(--line)}.nav-t:checked~.links{display:flex}.nav-in{position:relative}.plan.hot{transform:none}}`;
};
R.fontLink = site => { const f = R.FONTS[site.theme.font] || R.FONTS.modern, fams = [...new Set([f.head, f.body])].map(n => 'family=' + n.replace(/ /g, '+') + ':wght@400;500;600;700;800').join('&'); return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fams}&display=swap"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block">`; };

/* ---------- sections and pages ---------- */
R.slug = (p, i) => i === 0 ? 'index' : (String(p.name || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page-' + (i + 1));
R.ctx = (site, page, mode) => {
  const pages = site.pages, home = pages[0];
  return {
    site, pages, pageId:page.id, homeId:home.id, mode,
    img:v => !v ? R.placeholder('x', site) : String(v).startsWith('ph:') ? R.placeholder(String(v).slice(3), site) : v,
    href:u => {
      u = String(u || '').trim(); if (!u) return '#';
      if (u.startsWith('page:')) { const i = pages.findIndex(p => p.id === u.slice(5)); if (i < 0) return '#'; return mode === 'multi' ? R.slug(pages[i], i) + '.html' : mode === 'single' ? (i === 0 ? '#/' : '#/' + R.slug(pages[i], i)) : '#'; }
      if (/^(https?:|mailto:|tel:|#)/i.test(u)) return u;
      if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(u)) return 'mailto:' + u;
      if (/^\+?[\d\s()-]{6,}$/.test(u)) return 'tel:' + u.replace(/[^\d+]/g, '');
      return 'https://' + u;
    }
  };
};
R.section = (b, ctx, attrs = '') => {
  const def = BLOCKS[b.type]; if (!def) return '';
  const inner = def.render(b.data, b.v in def.variants ? b.v : Object.keys(def.variants)[0], ctx);
  if (def.global) return inner.replace(/^<(header|footer)/, `<$1 data-block="${b.id}"${attrs}`);
  const bgImg = b.bg === 'image' && b.bgImg ? ` style="background-image:url('${esc(ctx.img(b.bgImg))}')"` : '';
  const anchor = b.anchor || b.type;
  return `<section id="${esc(anchor)}" class="s-${b.type} v-${b.v} bg-${b.bg || 'default'} pad-${b.pad || 'm'}${b.type === 'hero' && b.v === 'cover' ? ' has-cover' : ''}" data-block="${b.id}"${bgImg}${attrs}>${inner}</section>`;
};
R.page = (site, page, mode) => {
  const ctx = R.ctx(site, page, mode);
  return R.section(site.header, ctx) + `<main>${page.sections.map(b => R.section(b, ctx)).join('')}</main>` + R.section(site.footer, ctx);
};
const RUNTIME = `(function(){var io='IntersectionObserver' in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}})},{rootMargin:'0px 0px -8% 0px'}):null;
function reveal(root){(root||document).querySelectorAll('[data-reveal]').forEach(function(el){io?io.observe(el):el.classList.add('in');});}
document.addEventListener('submit',function(e){var f=e.target;if(!f.matches('form[data-mailto]'))return;e.preventDefault();var d=new FormData(f),to=f.getAttribute('data-mailto');location.href='mailto:'+to+'?subject='+encodeURIComponent('Message from '+(d.get('name')||'your website'))+'&body='+encodeURIComponent((d.get('message')||'')+'\\n\\n'+(d.get('name')||'')+' <'+(d.get('email')||'')+'>');});
document.addEventListener('click',function(e){var a=e.target.closest('.links a');if(a){var t=document.getElementById('navt');if(t)t.checked=false;}});
var pages=document.querySelectorAll('[data-page]');if(pages.length>1||(pages.length&&pages[0].hasAttribute('data-route'))){var show=function(){var h=location.hash,s=h.indexOf('#/')===0?h.slice(2)||'index':null;if(s===null)return;var hit=null;pages.forEach(function(p){if(p.getAttribute('data-page')===s)hit=p;});if(!hit)hit=pages[0];pages.forEach(function(p){p.hidden=p!==hit;});document.title=hit.getAttribute('data-title');window.scrollTo(0,0);reveal(hit);};addEventListener('hashchange',show);if(location.hash.indexOf('#/')===0)show();}
reveal();})();`;
R.doc = (site, pageOrAll, mode) => {
  const multi = mode === 'single' && site.pages.length > 1, page = pageOrAll || site.pages[0];
  const title = p => p === site.pages[0] ? site.title : `${p.name} · ${site.title}`;
  const bodyHTML = mode === 'single'
    ? site.pages.map((p, i) => `<div data-page="${R.slug(p, i)}" data-title="${esc(title(p))}"${multi ? ' data-route' : ''}${i ? ' hidden' : ''}>${R.page(site, p, 'single')}</div>`).join('\n')
    : R.page(site, page, mode);
  const fav = site.settings && site.settings.favicon ? `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${site.settings.favicon}</text></svg>`)}">` : '';
  const desc = site.settings && site.settings.description ? `<meta name="description" content="${esc(site.settings.description)}"><meta property="og:description" content="${esc(site.settings.description)}">` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title(page))}</title>${desc}<meta property="og:title" content="${esc(site.title)}">${fav}
${R.fontLink(site)}<style>${R.css(site)}</style></head>
<body class="${site.settings && site.settings.anim === false ? '' : 'anim'}">
${bodyHTML}
<script>${RUNTIME}</script>
</body></html>`;
};
})();
