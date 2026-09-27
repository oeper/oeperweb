/* oneSlide — model: themes, layouts, shapes, charts, slide rendering, history, persistence */
(() => {
'use strict';
const { $, $$, el, esc, store } = ONE;
const S = window.S = {};
S.hooks = [];

/* ---------- themes ---------- */
S.THEMES = {
  office:{ name:'Office', bg:'#FFFFFF', title:'#1F1F1F', body:'#3A3A3A', tf:'"Calibri Light", Calibri, Carlito, sans-serif', bf:'Calibri, Carlito, sans-serif', acc:['#4472C4','#ED7D31','#A5A5A5','#FFC000','#5B9BD5','#70AD47'], dark:false },
  material:{ name:'Material', bg:'#F7F9FF', title:'#0B2F5E', body:'#2E3440', tf:'"Roboto Flex", "Segoe UI", sans-serif', bf:'"Roboto Flex", "Segoe UI", sans-serif', acc:['#2A5EA8','#6E5676','#3E8E7E','#E8A33D','#8FB3F0','#C75D5D'], deco:'material', dark:false },
  midnight:{ name:'Midnight', bg:'linear-gradient(135deg,#0F172A,#1E293B)', title:'#F8FAFC', body:'#CBD5E1', tf:'"Roboto Flex", "Segoe UI", sans-serif', bf:'"Roboto Flex", "Segoe UI", sans-serif', acc:['#38BDF8','#F472B6','#A78BFA','#FBBF24','#34D399','#FB7185'], deco:'glow', dark:true },
  ion:{ name:'Ion', bg:'#12303C', title:'#FFFFFF', body:'#D6E6EC', tf:'"Century Gothic", Futura, "Roboto Flex", sans-serif', bf:'"Century Gothic", Futura, "Roboto Flex", sans-serif', acc:['#2FB5B0','#F2C14E','#F78154','#5E81AC','#B4D6C1','#E9ECEF'], deco:'bar', dark:true },
  organic:{ name:'Organic', bg:'#F4EFE6', title:'#3F4B2F', body:'#4A4A40', tf:'Garamond, "EB Garamond", Georgia, serif', bf:'Georgia, serif', acc:['#6B8F47','#B5703A','#8C6D4F','#D9B44A','#4F7C6E','#A45C5C'], deco:'leaf', dark:false },
  slate:{ name:'Slate', bg:'#2B2F36', title:'#FFFFFF', body:'#C9CED6', tf:'"Segoe UI", "Roboto Flex", sans-serif', bf:'"Segoe UI", "Roboto Flex", sans-serif', acc:['#E07A5F','#81B29A','#F2CC8F','#3D90D7','#BC6C9E','#9CA3AF'], deco:'line', dark:true },
  retro:{ name:'Retrospect', bg:'#FFF8E7', title:'#C0392B', body:'#3B3024', tf:'"Trebuchet MS", sans-serif', bf:'"Trebuchet MS", sans-serif', acc:['#C0392B','#2C7DA0','#F4A261','#2A9D8F','#8E5572','#E9C46A'], deco:'stripe', dark:false },
  gradient:{ name:'Aurora', bg:'linear-gradient(120deg,#5B2A86,#1F6FB2 55%,#1BB5A2)', title:'#FFFFFF', body:'#EAF2FF', tf:'"Roboto Flex", "Segoe UI", sans-serif', bf:'"Roboto Flex", "Segoe UI", sans-serif', acc:['#FFD166','#EF476F','#06D6A0','#FFFFFF','#118AB2','#F78C6B'], deco:'none', dark:true }
};
S.VARIANTS = [null, ['#E4572E','#29335C','#F3A712','#A8C686','#669BBC','#DB2B39'], ['#2D6A4F','#40916C','#95D5B2','#FFB703','#219EBC','#8ECAE6'], ['#7B2CBF','#C77DFF','#3C096C','#FF9E00','#E0AAFF','#240046']];

/* ---------- presentation ---------- */
S.newDeck = (title = 'Presentation') => ({ id:ONE.uid(), title, theme:'material', variant:0, ratio:'16:9', slides:[], updated:Date.now(), footer:{ text:'', num:false, date:false }, loop:false });
S.deck = S.newDeck();
S.cur = 0;
S.W = () => S.deck.ratio === '4:3' ? 960 : 1280; S.H = () => 720;
S.theme = () => { const t = S.THEMES[S.deck.theme] || S.THEMES.office; const v = S.VARIANTS[S.deck.variant]; return v ? Object.assign({}, t, { acc:v }) : t; };
S.slide = () => S.deck.slides[S.cur];
S.newId = () => ONE.uid();

/* ---------- layouts ---------- */
const ph = (role, x, y, w, h, extra = {}) => Object.assign({ id:S.newId(), mid:S.newId(), type:'text', role, x, y, w, h, rot:0, html:'', style:{} }, extra);
S.LAYOUTS = {
  title:{ name:'Title Slide', make:W => [ph('title', 120, 220, W - 240, 150, { style:{ size:60, align:'center', valign:'bottom' } }), ph('subtitle', 160, 390, W - 320, 80, { style:{ size:26, align:'center', valign:'top' } })] },
  content:{ name:'Title and Content', make:W => [ph('title', 80, 50, W - 160, 110, { style:{ size:44, valign:'middle' } }), ph('body', 80, 180, W - 160, 470, { style:{ size:26, valign:'top' }, html:'' })] },
  section:{ name:'Section Header', make:W => [ph('title', 100, 250, W - 200, 130, { style:{ size:54, valign:'bottom' } }), ph('subtitle', 100, 400, W - 200, 70, { style:{ size:24, valign:'top' } })] },
  two:{ name:'Two Content', make:W => [ph('title', 80, 50, W - 160, 110, { style:{ size:44, valign:'middle' } }), ph('body', 80, 180, (W - 200) / 2, 470, { style:{ size:24, valign:'top' } }), ph('body', 120 + (W - 200) / 2, 180, (W - 200) / 2, 470, { style:{ size:24, valign:'top' } })] },
  compare:{ name:'Comparison', make:W => [ph('title', 80, 40, W - 160, 100, { style:{ size:40, valign:'middle' } }), ph('subtitle', 80, 150, (W - 200) / 2, 56, { style:{ size:26, bold:true, valign:'bottom' } }), ph('subtitle', 120 + (W - 200) / 2, 150, (W - 200) / 2, 56, { style:{ size:26, bold:true, valign:'bottom' } }), ph('body', 80, 215, (W - 200) / 2, 440, { style:{ size:22, valign:'top' } }), ph('body', 120 + (W - 200) / 2, 215, (W - 200) / 2, 440, { style:{ size:22, valign:'top' } })] },
  titleonly:{ name:'Title Only', make:W => [ph('title', 80, 50, W - 160, 110, { style:{ size:44, valign:'middle' } })] },
  quote:{ name:'Quote', make:W => [ph('title', 160, 180, W - 320, 260, { style:{ size:40, italic:true, align:'center', valign:'middle' } }), ph('subtitle', 160, 460, W - 320, 60, { style:{ size:22, align:'center' } })] },
  bignum:{ name:'Big Number', make:W => [ph('title', 100, 140, W - 200, 280, { style:{ size:150, bold:true, align:'center', valign:'bottom', color:'accent1' } }), ph('subtitle', 160, 440, W - 320, 100, { style:{ size:28, align:'center', valign:'top' } })] },
  blank:{ name:'Blank', make:() => [] }
};
S.PROMPT = { title:'Click to add title', subtitle:'Click to add subtitle', body:'Click to add text' };
S.newSlide = (layout = 'content') => ({ id:S.newId(), layout, bg:null, notes:'', hidden:false, transition:{ type:'fade', dur:.6, after:0 }, els:S.LAYOUTS[layout].make(S.W()) });

/* ---------- shapes ---------- */
S.SHAPES = {
  rect:'Rectangle', round:'Rounded Rectangle', ellipse:'Oval', triangle:'Triangle', rtriangle:'Right Triangle', diamond:'Diamond', pentagon:'Pentagon', hexagon:'Hexagon',
  arrowR:'Right Arrow', arrowL:'Left Arrow', arrowU:'Up Arrow', chevron:'Chevron', star:'Star', heart:'Heart', callout:'Speech Bubble', plus:'Plus', line:'Line', arrowLine:'Arrow Line', wave:'Wave', frame:'Frame'
};
S.shapePath = (k, w, h, r = 0) => {
  const W = w, H = h, m = Math.min(w, h);
  switch (k) {
    case 'rect': return `M0 0H${W}V${H}H0Z`;
    case 'round': { const q = Math.min(r || m * .16, m / 2); return `M${q} 0H${W - q}Q${W} 0 ${W} ${q}V${H - q}Q${W} ${H} ${W - q} ${H}H${q}Q0 ${H} 0 ${H - q}V${q}Q0 0 ${q} 0Z`; }
    case 'ellipse': return `M${W / 2} 0A${W / 2} ${H / 2} 0 1 1 ${W / 2 - .01} 0Z`;
    case 'triangle': return `M${W / 2} 0L${W} ${H}H0Z`;
    case 'rtriangle': return `M0 0L${W} ${H}H0Z`;
    case 'diamond': return `M${W / 2} 0L${W} ${H / 2}L${W / 2} ${H}L0 ${H / 2}Z`;
    case 'pentagon': return `M${W / 2} 0L${W} ${H * .38}L${W * .81} ${H}H${W * .19}L0 ${H * .38}Z`;
    case 'hexagon': return `M${W * .25} 0H${W * .75}L${W} ${H / 2}L${W * .75} ${H}H${W * .25}L0 ${H / 2}Z`;
    case 'arrowR': return `M0 ${H * .28}H${W * .62}V0L${W} ${H / 2}L${W * .62} ${H}V${H * .72}H0Z`;
    case 'arrowL': return `M${W} ${H * .28}H${W * .38}V0L0 ${H / 2}L${W * .38} ${H}V${H * .72}H${W}Z`;
    case 'arrowU': return `M${W * .28} ${H}V${H * .38}H0L${W / 2} 0L${W} ${H * .38}H${W * .72}V${H}Z`;
    case 'chevron': return `M0 0H${W * .7}L${W} ${H / 2}L${W * .7} ${H}H0L${W * .3} ${H / 2}Z`;
    case 'star': { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? .4 : 1; p += (i ? 'L' : 'M') + (W / 2 + Math.cos(a) * W / 2 * rr) + ' ' + (H * .53 + Math.sin(a) * H * .53 * rr); } return p + 'Z'; }
    case 'heart': return `M${W / 2} ${H}C${W * .1} ${H * .72} 0 ${H * .5} 0 ${H * .3}A${W / 4} ${H * .28} 0 0 1 ${W / 2} ${H * .22}A${W / 4} ${H * .28} 0 0 1 ${W} ${H * .3}C${W} ${H * .5} ${W * .9} ${H * .72} ${W / 2} ${H}Z`;
    case 'callout': return `M${m * .12} 0H${W - m * .12}Q${W} 0 ${W} ${m * .12}V${H * .7 - m * .12}Q${W} ${H * .7} ${W - m * .12} ${H * .7}H${W * .38}L${W * .2} ${H}L${W * .24} ${H * .7}H${m * .12}Q0 ${H * .7} 0 ${H * .7 - m * .12}V${m * .12}Q0 0 ${m * .12} 0Z`;
    case 'plus': return `M${W * .35} 0H${W * .65}V${H * .35}H${W}V${H * .65}H${W * .65}V${H}H${W * .35}V${H * .65}H0V${H * .35}H${W * .35}Z`;
    case 'line': return `M0 ${H / 2}H${W}`;
    case 'arrowLine': return `M0 ${H / 2}H${W - 14}M${W - 18} ${H / 2 - 9}L${W} ${H / 2}L${W - 18} ${H / 2 + 9}`;
    case 'wave': return `M0 ${H * .2}C${W * .25} ${-H * .05} ${W * .5} ${H * .45} ${W} ${H * .15}V${H * .8}C${W * .75} ${H * 1.05} ${W * .5} ${H * .55} 0 ${H * .85}Z`;
    case 'frame': { const t = m * .14; return `M0 0H${W}V${H}H0ZM${t} ${t}V${H - t}H${W - t}V${t}Z`; }
  }
  return `M0 0H${W}V${H}H0Z`;
};
S.isLine = k => k === 'line' || k === 'arrowLine';

/* ---------- colors ---------- */
S.color = (c, fallback) => { if (!c) return fallback; const m = /^accent(\d)$/.exec(c); if (m) return S.theme().acc[+m[1] - 1]; if (c === 'title') return S.theme().title; if (c === 'body') return S.theme().body; if (c === 'bg') return S.theme().bg; return c; };

/* ---------- charts ---------- */
S.chartSVG = (ch, w, h, t) => {
  const pal = t.acc, d = ch.data || { cats:[], series:[] }, fg = t.body, grid = t.dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.1)';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" font-family="${esc(t.bf).replace(/"/g, "'")}" font-size="16" fill="${fg}">`;
  const top = ch.title ? 50 : 16, legend = d.series.length > 1 || ch.kind === 'pie' || ch.kind === 'doughnut', bottom = h - (legend ? 50 : 30);
  if (ch.title) s += `<text x="${w / 2}" y="32" text-anchor="middle" font-size="22" font-weight="600" fill="${t.title}">${esc(ch.title)}</text>`;
  const leg = names => { const iw = Math.min(170, (w - 40) / names.length); let x = (w - iw * names.length) / 2; return names.map((n, i) => { const o = `<rect x="${x + 6}" y="${h - 30}" width="14" height="14" rx="3" fill="${pal[i % pal.length]}"/><text x="${x + 26}" y="${h - 18}" font-size="15">${esc(String(n).slice(0, 18))}</text>`; x += iw; return o; }).join(''); };
  if (ch.kind === 'pie' || ch.kind === 'doughnut') {
    const v = (d.series[0] || { vals:[] }).vals.map(x => Math.max(0, x)), tot = v.reduce((a, b) => a + b, 0) || 1, cx = w / 2, cy = (top + bottom) / 2, R = Math.max(10, Math.min(w / 2 - 30, (bottom - top) / 2)); let a0 = -Math.PI / 2;
    v.forEach((x, i) => { const f = x / tot, a1 = a0 + f * Math.PI * 2; s += f >= .9999 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${pal[i % pal.length]}"/>` : f > 0 ? `<path d="M${cx} ${cy}L${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)}A${R} ${R} 0 ${f > .5 ? 1 : 0} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}Z" fill="${pal[i % pal.length]}" stroke="${t.dark ? '#0000' : '#fff'}" stroke-width="2"/>` : '';
      if (f > .05) { const am = (a0 + a1) / 2, lr = ch.kind === 'doughnut' ? R * .78 : R * .62; s += `<text x="${cx + lr * Math.cos(am)}" y="${cy + lr * Math.sin(am) + 6}" text-anchor="middle" fill="#fff" font-weight="700">${Math.round(f * 100)}%</text>`; } a0 = a1; });
    if (ch.kind === 'doughnut') s += `<circle cx="${cx}" cy="${cy}" r="${R * .55}" fill="${t.dark ? '#1b1f27' : '#fff'}"/>`;
    return s + leg(d.cats) + '</svg>';
  }
  const all = d.series.flatMap(x => x.vals), mx = Math.max(0, ...all, 1), step0 = mx / 5, p = Math.pow(10, Math.floor(Math.log10(step0 || 1))), step = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= step0) || 1, hi = Math.ceil(mx / step) * step;
  const left = 64, right = w - 20, n = d.cats.length || 1, bw = (right - left) / n, Y = v => bottom - v / hi * (bottom - top);
  for (let v = 0; v <= hi + 1e-9; v += step) s += `<line x1="${left}" x2="${right}" y1="${Y(v)}" y2="${Y(v)}" stroke="${grid}"/><text x="${left - 10}" y="${Y(v) + 5}" text-anchor="end" font-size="14" opacity=".8">${v >= 1000 ? +(v / 1000).toFixed(1) + 'K' : +v.toFixed(2)}</text>`;
  d.cats.forEach((c, i) => s += `<text x="${left + bw * (i + .5)}" y="${bottom + 22}" text-anchor="middle" font-size="14" opacity=".85">${esc(String(c).slice(0, 12))}</text>`);
  if (ch.kind === 'line' || ch.kind === 'area') d.series.forEach((se, j) => { const pts = se.vals.map((v, i) => [left + bw * (i + .5), Y(v)]); if (ch.kind === 'area') s += `<path d="M${pts[0][0]} ${bottom}${pts.map(q => 'L' + q.join(' ')).join('')}L${pts[pts.length - 1][0]} ${bottom}Z" fill="${pal[j % pal.length]}" opacity=".45"/>`; s += `<polyline fill="none" stroke="${pal[j % pal.length]}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(q => q.join(',')).join(' ')}"/>` + pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="5" fill="${pal[j % pal.length]}"/>`).join(''); });
  else { const k = d.series.length, cw = bw * .7 / k; d.cats.forEach((_, i) => d.series.forEach((se, j) => { const v = se.vals[i] || 0; s += `<rect x="${left + bw * i + bw * .15 + cw * j}" y="${Y(v)}" width="${cw - 2}" height="${bottom - Y(v)}" rx="4" fill="${pal[j % pal.length]}"/>`; })); }
  s += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="${fg}" opacity=".4"/>`;
  return s + (legend ? leg(d.series.map(x => x.name)) : '') + '</svg>';
};

/* ---------- rendering ---------- */
const shadowCSS = st => st.shadow ? (st.shadow === 'soft' ? '0 10px 30px rgba(0,0,0,.28)' : st.shadow === 'hard' ? '8px 8px 0 rgba(0,0,0,.35)' : '0 4px 12px rgba(0,0,0,.3)') : '';
S.textCSS = (st, e, t) => {
  const isTitle = e.role === 'title', font = st.font || (isTitle ? t.tf : t.bf);
  return `font-family:${font.replace(/"/g, "'")};font-size:${st.size || (isTitle ? 44 : 24)}px;color:${S.color(st.color, isTitle ? t.title : t.body)};${st.bold ? 'font-weight:700;' : isTitle ? 'font-weight:500;' : ''}${st.italic ? 'font-style:italic;' : ''}${st.underline || st.strike ? `text-decoration:${st.underline ? 'underline ' : ''}${st.strike ? 'line-through' : ''};` : ''}text-align:${st.align || (e.type === 'shape' ? 'center' : 'left')};line-height:${st.lh || (isTitle ? 1.1 : 1.3)};${st.spacing ? `letter-spacing:${st.spacing}px;` : ''}${st.tshadow ? 'text-shadow:0 2px 8px rgba(0,0,0,.35);' : ''}${st.wordart ? S.WORDART[st.wordart] || '' : ''}`;
};
S.WORDART = {
  gradient:'background-image:linear-gradient(180deg,var(--wa1,#8FB3F0),var(--wa2,#1F3763));-webkit-background-clip:text;background-clip:text;color:transparent;',
  outline:'-webkit-text-stroke:2px currentColor;color:transparent;', shadow:'text-shadow:4px 4px 0 rgba(0,0,0,.28);', glow:'text-shadow:0 0 10px rgba(255,209,102,.95),0 0 24px rgba(255,209,102,.6);',
  retro:'text-shadow:3px 3px 0 #F4A261,6px 6px 0 #2A9D8F;', gold:'background-image:linear-gradient(180deg,#FFE699,#BF9000);-webkit-background-clip:text;background-clip:text;color:transparent;'
};
S.renderEl = (e, t, opt = {}) => {
  const st = e.style || {};
  const box = el('div', { class:'el el-' + e.type + (e.role ? ' ph-' + e.role : ''), 'data-id':e.id });
  box.style.cssText = `left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;${e.rot || e.flipH || e.flipV ? `transform:rotate(${e.rot || 0}deg)${e.flipH ? ' scaleX(-1)' : ''}${e.flipV ? ' scaleY(-1)' : ''};` : ''}${st.opacity != null && st.opacity < 1 ? `opacity:${st.opacity};` : ''}`;
  if (e.type === 'shape') {
    const line = S.isLine(e.shape), fill = line ? 'none' : st.fill === 'none' ? 'none' : S.color(st.fill, t.acc[0]), stroke = st.line === 'none' ? 'none' : S.color(st.line, line ? t.body : 'none'), sw = st.lw != null ? st.lw : line ? 4 : 0;
    const grad = st.grad && !line ? `<defs><linearGradient id="g${e.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${S.color(st.fill, t.acc[0])}"/><stop offset="1" stop-color="${S.color(st.grad, t.acc[1])}"/></linearGradient></defs>` : '';
    box.innerHTML = `<svg class="shp" viewBox="${-sw / 2} ${-sw / 2} ${e.w + sw} ${e.h + sw}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;${st.shadow ? `filter:drop-shadow(${st.shadow === 'soft' ? '0 10px 16px rgba(0,0,0,.28)' : st.shadow === 'hard' ? '8px 8px 0 rgba(0,0,0,.35)' : '0 4px 6px rgba(0,0,0,.3)'})` : ''}">${grad}<path d="${S.shapePath(e.shape, e.w, e.h, st.radius)}" fill="${grad ? `url(#g${e.id})` : fill}" stroke="${stroke}" stroke-width="${sw}" ${st.dash ? `stroke-dasharray="${st.dash === 'dot' ? '2 6' : '12 8'}"` : ''} stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if (!line) box.append(textBox(e, t, st, fill));
  } else if (e.type === 'image') {
    box.innerHTML = `<img alt="${esc(e.alt || '')}" src="${e.src}" draggable="false" style="object-fit:${e.fit || 'cover'};${st.radius ? `border-radius:${st.radius === 'circle' ? '50%' : st.radius + 'px'};` : ''}${st.filter ? `filter:${st.filter};` : ''}${shadowCSS(st) ? `box-shadow:${shadowCSS(st)};` : ''}${st.frame ? 'border:10px solid #fff;box-sizing:border-box;' : ''}">`;
  } else if (e.type === 'chart') {
    box.innerHTML = S.chartSVG(e, e.w, e.h, t);
  } else if (e.type === 'table') {
    const acc = S.color(st.fill, t.acc[0]);
    const tb = el('table', { class:'stbl' + (e.banded !== false ? ' banded' : ''), style:{ '--acc':acc, fontFamily:(st.font || t.bf), fontSize:(st.size || 18) + 'px', color:S.color(st.color, t.body) } });
    tb.innerHTML = e.rows.map((r, i) => `<tr>${r.map(c => i === 0 && e.header !== false ? `<th>${c}</th>` : `<td>${c}</td>`).join('')}</tr>`).join('');
    box.append(tb);
  } else if (e.type === 'icon') {
    box.innerHTML = `<span class="ico" style="color:${S.color(st.color, t.acc[0])};font-size:${Math.min(e.w, e.h)}px">${esc(e.icon)}</span>`;
  } else box.append(textBox(e, t, st));
  if (!opt.thumb && e.anim && S.showAnimBadges) box.append(el('span', { class:'anim-badge', text:e.anim.order || '' }));
  return box;
};
function textBox(e, t, st, shapeFill){
  const tx = el('div', { class:'tx' + (e.list ? ' list-' + e.list : ''), style:{ justifyContent:{ top:'flex-start', middle:'center', bottom:'flex-end' }[st.valign || (e.type === 'shape' ? 'middle' : 'top')], padding:(st.pad != null ? st.pad : e.type === 'shape' ? 12 : 8) + 'px' } });
  const inner = el('div', { class:'txi' }); inner.style.cssText = S.textCSS(st, e, t) + (e.type === 'shape' && !st.color && shapeFill && shapeFill !== 'none' ? 'color:#fff;' : '');
  inner.innerHTML = e.html || '';
  if (!e.html && e.role) inner.setAttribute('data-prompt', S.PROMPT[e.role] || '');
  tx.append(inner); return tx;
}
S.decoHTML = t => ({
  material:`<div class="deco" style="position:absolute;right:-120px;top:-160px;width:520px;height:520px;border-radius:50%;background:${t.acc[0]};opacity:.12"></div><div class="deco" style="position:absolute;left:-80px;bottom:-120px;width:320px;height:320px;border-radius:38%;background:${t.acc[1]};opacity:.1;transform:rotate(18deg)"></div>`,
  glow:`<div class="deco" style="position:absolute;right:-200px;top:-200px;width:640px;height:640px;border-radius:50%;background:radial-gradient(circle,${t.acc[0]}55,transparent 65%)"></div>`,
  bar:`<div class="deco" style="position:absolute;left:0;top:0;bottom:0;width:22px;background:${t.acc[0]}"></div>`,
  leaf:`<div class="deco" style="position:absolute;right:-40px;bottom:-60px;width:300px;height:300px;border-radius:0 70% 0 70%;background:${t.acc[0]};opacity:.14"></div>`,
  line:`<div class="deco" style="position:absolute;left:80px;right:80px;bottom:40px;height:3px;background:${t.acc[0]};opacity:.8"></div>`,
  stripe:`<div class="deco" style="position:absolute;left:0;right:0;top:0;height:18px;background:repeating-linear-gradient(90deg,${t.acc[0]} 0 60px,${t.acc[1]} 60px 120px,${t.acc[2]} 120px 180px)"></div>`
}[t.deco] || '');
S.renderSlide = (s, opt = {}) => {
  const t = S.theme(), W = S.W(), H = S.H();
  const root = el('div', { class:'slide' + (opt.thumb ? ' thumb' : ''), 'data-sid':s.id, style:{ width:W + 'px', height:H + 'px', background:s.bg ? (s.bg.img ? `center/cover url("${s.bg.img}")` : s.bg.value) : t.bg, color:t.body } });
  root.style.setProperty('--acc1', t.acc[0]);
  if (!s.bg || s.bg.deco !== false) root.insertAdjacentHTML('beforeend', S.decoHTML(t));
  s.els.forEach(e => { if (opt.thumb && e.role && !e.html) return; root.append(S.renderEl(e, t, opt)); });
  const f = S.deck.footer, idx = S.deck.slides.indexOf(s);
  if ((f.text || f.num || f.date) && s.layout !== 'title') {
    const fs = `position:absolute;bottom:22px;font:14px ${t.bf.replace(/"/g, "'")};color:${t.body};opacity:.7`;
    if (f.date) root.insertAdjacentHTML('beforeend', `<div style="${fs};left:60px">${new Date().toLocaleDateString()}</div>`);
    if (f.text) root.insertAdjacentHTML('beforeend', `<div style="${fs};left:0;right:0;text-align:center">${esc(f.text)}</div>`);
    if (f.num) root.insertAdjacentHTML('beforeend', `<div style="${fs};right:60px">${idx + 1}</div>`);
  }
  return root;
};
S.thumb = (s, width) => {
  const wrap = el('div', { class:'thumbwrap', style:{ width:width + 'px', height:width * S.H() / S.W() + 'px' } });
  const sl = S.renderSlide(s, { thumb:true }); sl.style.transform = `scale(${width / S.W()})`; sl.style.transformOrigin = '0 0'; wrap.append(sl); return wrap;
};

/* ---------- history ---------- */
const U = S.undo = { list:[], i:-1 };
const snap = () => JSON.stringify({ slides:S.deck.slides, theme:S.deck.theme, variant:S.deck.variant, ratio:S.deck.ratio, footer:S.deck.footer, cur:S.cur });
S.resetUndo = () => { U.list = [snap()]; U.i = 0; };
S.record = () => { const s = snap(); if (U.list[U.i] === s) return; U.list.splice(U.i + 1); U.list.push(s); if (U.list.length > 150) U.list.shift(); U.i = U.list.length - 1; };
S.go = d => { const j = U.i + d; if (j < 0 || j >= U.list.length) return ONE.toast(d < 0 ? 'Nothing to undo.' : 'Nothing to redo.'); U.i = j; const s = JSON.parse(U.list[j]); Object.assign(S.deck, { slides:s.slides, theme:s.theme, variant:s.variant, ratio:s.ratio, footer:s.footer }); S.cur = Math.min(s.cur, S.deck.slides.length - 1); S.sel = []; S.refresh(false); };
S.changed = (rec = true) => { if (rec) S.record(); S.refresh(false); S.dirty(); };
S.refresh = () => { S.hooks.forEach(f => { try { f(); } catch (err) { console.error(err); } }); };

/* ---------- persistence ---------- */
S.lib = store.get('op-lib', { current:null, docs:{} });
let saveT;
S.dirty = () => { const s = $('#saveState'); s.textContent = 'Saving…'; s.classList.add('busy'); clearTimeout(saveT); saveT = setTimeout(() => S.save(false), 900); };
S.save = () => {
  clearTimeout(saveT); S.deck.title = $('#docTitle').value.trim() || 'Presentation'; S.deck.updated = Date.now();
  const ok = store.set('op-doc-' + S.deck.id, S.deck);
  S.lib.docs[S.deck.id] = { title:S.deck.title, updated:S.deck.updated, slides:S.deck.slides.length, theme:S.deck.theme }; S.lib.current = S.deck.id; store.set('op-lib', S.lib);
  const st = $('#saveState'); st.classList.remove('busy'); st.textContent = ok ? 'Saved' : 'Not saved'; st.title = ok ? 'Saved in this browser' : 'This browser blocked local storage.'; return ok;
};
S.open = d => {
  if (S.deck && S.deck.id && S.lib.docs[S.deck.id]) S.save();
  S.deck = Object.assign(S.newDeck(), d); S.deck.footer = Object.assign({ text:'', num:false, date:false }, d.footer || {});
  if (!S.deck.slides.length) S.deck.slides.push(S.newSlide('title'));
  S.cur = 0; S.sel = []; $('#docTitle').value = S.deck.title; S.resetUndo(); S.refresh(); S.lib.current = S.deck.id; store.set('op-lib', S.lib);
};
})();
