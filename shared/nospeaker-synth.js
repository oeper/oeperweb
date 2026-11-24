// nospeaker-synth.js: the sound of the "No speaker" page (nospeaker.html).
//
// Web port of the sound ideas in os6/nospeaker (MIT, https://github.com/os6/nospeaker, by a90.com):
// the voice is two tones (F1 + F2) restarted on every beat of the pitch so they buzz like a voice,
// hiss sounds are quick bursts of high tones, the melody sits in the loudest octave (A5-C7), the beat
// is a pitch-dive kick + noise snare + 3951 Hz hat + a bass whose tones are multiples of the root.
//
// The original asks macOS to speak the line and analyses it (linear prediction). A web page can't read
// the samples of speechSynthesis, so here a small rule-based text-to-phoneme step feeds the same
// "formants per 10 ms" frames. Everything is pure (no DOM, no AudioContext): each builder returns a
// Float32Array at the sample rate you give it, plus the timeline the page draws.
//
// MIT License (nospeaker): Copyright (c) the nospeaker authors. See https://github.com/os6/nospeaker/blob/main/LICENSE

export const HOP = 0.010;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ notes
const NOTE_SEMI = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
export function hz(note) {
  const oct = parseInt(note.slice(-1), 10), semi = NOTE_SEMI[note.slice(0, -1)];
  if (!Number.isFinite(oct) || semi === undefined) return 440;
  return 440 * Math.pow(2, (semi + (oct - 4) * 12) / 12);
}
export function noteName(f) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = Math.round(69 + 12 * Math.log2(f / 440));
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// ------------------------------------------------------------------ text -> phonemes
// ARPAbet-style tokens. Exceptions first, letter rules (g2p) for everything else.
const DICT = {
  the: 'DH AX', a: 'AX', an: 'AE N', and: 'AE N D', i: 'AY', "i'm": 'AY M', im: 'AY M', "i've": 'AY V', "i'll": 'AY L',
  it: 'IH T', "it's": 'IH T S', its: 'IH T S', is: 'IH Z', in: 'IH N', on: 'AO N', of: 'AH V', to: 'T UW', too: 'T UW',
  two: 'T UW', one: 'W AH N', you: 'Y UW', your: 'Y AO R', "you're": 'Y AO R', me: 'M IY', my: 'M AY', we: 'W IY',
  he: 'HH IY', she: 'SH IY', they: 'DH EY', this: 'DH IH S', that: 'DH AE T', there: 'DH EH R', their: 'DH EH R',
  here: 'HH IH R', hear: 'HH IH R', hello: 'HH AH L OW', hi: 'HH AY', hey: 'HH EY', good: 'G UH D',
  morning: 'M AO R N IH NG', afternoon: 'AE F T ER N UW N', evening: 'IY V N IH NG', late: 'L EY T',
  "don't": 'D OW N T', dont: 'D OW N T', do: 'D UW', does: 'D AH Z', not: 'N AA T', no: 'N OW', yes: 'Y EH S',
  have: 'HH AE V', has: 'HH AE Z', had: 'HH AE D', been: 'B IH N', meaning: 'M IY N IH NG',
  something: 'S AH M TH IH NG', say: 'S EY', speaker: 'S P IY K ER', trackpad: 'T R AE K P AE D',
  wires: 'W AY ER Z', just: 'JH AH S T', motor: 'M OW T ER', beat: 'B IY T', okay: 'OW K EY', ok: 'OW K EY',
  back: 'B AE K', clicking: 'K L IH K IH NG', gentle: 'JH EH N T AX L', be: 'B IY', turn: 'T ER N', can: 'K AE N',
  please: 'P L IY Z', stop: 'S T AA P', nobody: 'N OW B AA D IY', believes: 'B IH L IY V Z', live: 'L IH V',
  under: 'AH N D ER', glass: 'G L AE S', from: 'F R AH M', what: 'W AH T', who: 'HH UW', why: 'W AY', how: 'HH AW',
  are: 'AA R', was: 'W AH Z', for: 'F AO R', with: 'W IH DH', love: 'L AH V', or: 'AO R', but: 'B AH T',
  so: 'S OW', all: 'AO L', world: 'W ER L D', yeah: 'Y EH', up: 'AH P', out: 'AW T', give: 'G IH V', get: 'G EH T',
  come: 'K AH M', some: 'S AH M', said: 'S EH D', were: 'W ER', would: 'W UH D', could: 'K UH D', should: 'SH UH D',
  know: 'N OW', now: 'N AW', new: 'N UW', more: 'M AO R', sound: 'S AW N D', voice: 'V OY S', music: 'M Y UW Z IH K',
  computer: 'K AX M P Y UW T ER', mac: 'M AE K', talk: 'T AO K', sing: 'S IH NG', rap: 'R AE P', play: 'P L EY',
  zero: 'Z IH R OW', three: 'TH R IY', four: 'F AO R', five: 'F AY V', six: 'S IH K S', seven: 'S EH V AX N',
  eight: 'EY T', nine: 'N AY N', ten: 'T EH N', eleven: 'IH L EH V AX N', twelve: 'T W EH L V', hundred: 'HH AH N D R AX D',
  thousand: 'TH AW Z AX N D', oeper: 'OW P ER', dev: 'D EH V', epic: 'EH P IH K', 'oeper.dev': 'OW P ER D EH V',
};
const FUNCTION_WORDS = new Set('a an the and or but of to in on at is it its i im you your we he she me my be do not no so up for with from this that there here are was were been have has had can'.split(' '));
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

const VOWELS = new Set(['IY', 'IH', 'EH', 'AE', 'AA', 'AO', 'UH', 'UW', 'AH', 'AX', 'ER', 'EY', 'AY', 'OW', 'AW', 'OY']);
const isVowelTok = (t) => VOWELS.has(t);

function g2p(w) {
  const out = [];
  const s = w;
  const L = s.length;
  const isV = (c) => !!c && 'aeiouy'.includes(c);
  const long = { a: 'EY', e: 'IY', i: 'AY', o: 'OW', u: 'UW' };
  const short = { a: 'AE', e: 'EH', i: 'IH', o: 'AA', u: 'AH' };
  let i = 0;
  while (i < L) {
    const c = s[i], p = s[i - 1] || '', n1 = s[i + 1] || '', n2 = s[i + 2] || '';
    const two = s.substr(i, 2), four = s.substr(i, 4), three = s.substr(i, 3);
    const rest = s.slice(i);
    // endings and clusters
    if (four === 'tion') { out.push('SH', 'AX', 'N'); i += 4; continue; }
    if (four === 'sion') { out.push('ZH', 'AX', 'N'); i += 4; continue; }
    if (four === 'ight') { out.push('AY', 'T'); i += 4; continue; }
    if (four === 'ough') { out.push('OW'); i += 4; continue; }
    if (three === 'igh') { out.push('AY'); i += 3; continue; }
    if (three === 'tch') { out.push('CH'); i += 3; continue; }
    if (rest === 'ing') { out.push('IH', 'NG'); i += 3; continue; }
    if (rest === 'ed' && i > 0) {
      out.push(...('td'.includes(p) ? ['IH', 'D'] : 'pkfsxh'.includes(p) ? ['T'] : ['D'])); i += 2; continue;
    }
    if (rest === 'es' && i > 0 && 'sxzc'.includes(p)) { out.push('IH', 'Z'); i += 2; continue; }
    if (rest === 'es' && i > 0 && !isV(p)) { out.push('Z'); i += 2; continue; } // games, makes: silent e
    if (rest === 'e' && i > 0 && !isV(p)) { i += 1; continue; } // silent final e
    if (rest === 'le' && i > 0 && !isV(p)) { out.push('AX', 'L'); i += 2; continue; }
    // consonant digraphs
    if (two === 'th') { out.push('TH'); i += 2; continue; }
    if (two === 'sh') { out.push('SH'); i += 2; continue; }
    if (two === 'ch') { out.push('CH'); i += 2; continue; }
    if (two === 'ph') { out.push('F'); i += 2; continue; }
    if (two === 'wh') { out.push('W'); i += 2; continue; }
    if (two === 'ck') { out.push('K'); i += 2; continue; }
    if (two === 'ng') { out.push('NG'); i += 2; continue; }
    if (two === 'nk') { out.push('NG', 'K'); i += 2; continue; }
    if (two === 'qu') { out.push('K', 'W'); i += 2; continue; }
    if (two === 'kn' && i === 0) { out.push('N'); i += 2; continue; }
    if (two === 'wr' && i === 0) { out.push('R'); i += 2; continue; }
    if (two === 'gh') { if (i > 0 && isV(p)) { i += 2; continue; } out.push('G'); i += 2; continue; }
    if (two === 'mb' && i + 2 === L) { out.push('M'); i += 2; continue; }
    if (two === 'dg') { out.push('JH'); i += 2; continue; }
    // vowel digraphs and r-vowels
    if (two === 'ee' || two === 'ea') { out.push('IY'); i += 2; continue; }
    if (two === 'oo') { out.push('UW'); i += 2; continue; }
    if (two === 'ou') { out.push('AW'); i += 2; continue; }
    if (two === 'ow') { out.push(i + 2 >= L ? 'OW' : 'AW'); i += 2; continue; }
    if (two === 'oi' || two === 'oy') { out.push('OY'); i += 2; continue; }
    if (two === 'ai' || two === 'ay' || two === 'ei' || two === 'ey') { out.push('EY'); i += 2; continue; }
    if (two === 'au' || two === 'aw') { out.push('AO'); i += 2; continue; }
    if (two === 'ie') { out.push('IY'); i += 2; continue; }
    if (two === 'oa') { out.push('OW'); i += 2; continue; }
    if (two === 'ue' || two === 'ew') { out.push('UW'); i += 2; continue; }
    if (two === 'er' || two === 'ir' || two === 'ur') { out.push('ER'); i += 2; continue; }
    if (two === 'ar') { out.push('AA', 'R'); i += 2; continue; }
    if (two === 'or') { out.push('AO', 'R'); i += 2; continue; }
    // single vowels
    if ('aeiou'.includes(c)) {
      const magic = !isV(n1) && n1 && n2 === 'e' && (i + 3 === L || (i + 4 === L && s[i + 3] === 's'));
      const openEnd = i === L - 1 && L <= 3 && 'eo'.includes(c) && !!p;
      if (c === 'a' && L === 1) out.push('AX');
      else if (magic || openEnd) out.push(long[c]);
      else out.push(short[c]);
      i++; continue;
    }
    if (c === 'y') {
      if (i === 0) out.push('Y');
      else if (i === L - 1) out.push(L > 3 ? 'IY' : 'AY');
      else out.push('IH');
      i++; continue;
    }
    // consonants
    if (c === 'c') { out.push('eiy'.includes(n1) ? 'S' : 'K'); i += (n1 === 'c' ? 2 : 1); continue; }
    if (c === 'g') { out.push('eiy'.includes(n1) ? 'JH' : 'G'); i += (n1 === 'g' ? 2 : 1); continue; }
    if (c === 'j') { out.push('JH'); i++; continue; }
    if (c === 'q') { out.push('K'); i++; continue; }
    if (c === 'x') { out.push('K', 'S'); i++; continue; }
    if (c === 'z') { out.push('Z'); i++; continue; }
    if (c === 's') {
      const z = (isV(p) && isV(n1)) || (i === L - 1 && i > 0 && (isV(p) || 'bdgmnlrvz'.includes(p)));
      out.push(z ? 'Z' : 'S'); i += (n1 === 's' ? 2 : 1); continue;
    }
    const map = { b: 'B', d: 'D', f: 'F', h: 'HH', k: 'K', l: 'L', m: 'M', n: 'N', p: 'P', r: 'R', t: 'T', v: 'V', w: 'W' };
    if (map[c]) { out.push(map[c]); i += (n1 === c ? 2 : 1); continue; }
    i++;
  }
  return out;
}

/** "Good morning. I'm your trackpad" -> [{words:[{w, ph:[tokens], fn}], end:'.'|'?'|'!'|','}...] flattened per sentence. */
export function parseText(text) {
  const clean = String(text || '')
    .replace(/[0-9]/g, (d) => ' ' + DIGITS[+d] + ' ')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .toLowerCase();
  const toks = clean.match(/[a-z]+(?:'[a-z]+)*(?:\.[a-z]{2,}(?![a-z]))?|[.,!?;:…]/g) || [];
  const sentences = [];
  let cur = [];
  const close = (end) => { if (cur.length) sentences.push({ words: cur, end }); cur = []; };
  for (const t of toks) {
    if (/^[.!?…]$/.test(t)) close(t === '…' ? '.' : t);
    else if (/^[,;:]$/.test(t)) { if (cur.length) cur[cur.length - 1].after = 'comma'; }
    else {
      const key = t.replace(/\.$/, '');
      const ph = DICT[key] ? DICT[key].split(' ') : DICT[key.replace(/'/g, '')] ? DICT[key.replace(/'/g, '')].split(' ') : g2p(key.replace(/'/g, ''));
      cur.push({ w: key, ph, fn: FUNCTION_WORDS.has(key) });
    }
  }
  close('.');
  return sentences;
}

// ------------------------------------------------------------------ phoneme table
// [F1, F2] in Hz, duration in seconds. Voiced sounds carry two tones; hiss uses a band of high tones.
const VOW = {
  IY: [280, 2250, 0.11], IH: [400, 1920, 0.085], EH: [550, 1770, 0.10], AE: [690, 1660, 0.13], AA: [710, 1100, 0.13],
  AO: [590, 880, 0.13], UH: [450, 1030, 0.09], UW: [310, 870, 0.12], AH: [600, 1200, 0.09], AX: [500, 1400, 0.065], ER: [490, 1350, 0.12],
};
const DIPH = { EY: [[550, 1770], [380, 2050]], AY: [[710, 1100], [400, 1950]], OW: [[500, 900], [400, 800]], AW: [[710, 1100], [420, 880]], OY: [[590, 880], [400, 1950]] };
const SON = { L: [360, 1300, 0.07, 0.7], R: [420, 1300, 0.07, 0.7], W: [300, 700, 0.07, 0.65], Y: [280, 2200, 0.06, 0.65], M: [250, 1100, 0.075, 0.5], N: [250, 1500, 0.07, 0.5], NG: [250, 2000, 0.08, 0.5] };
// stops: [locus F2, burst band lo, hi, voiced]
const STOP = { B: [800, 500, 1500, 1], D: [1700, 2800, 4200, 1], G: [1800, 1500, 2800, 1], P: [800, 500, 1500, 0], T: [1700, 2800, 4300, 0], K: [1800, 1500, 2800, 0] };
// fricatives: [lo, hi, level, dur, voiced]
const FRIC = { S: [3300, 4300, 0.85, 0.095, 0], Z: [3300, 4300, 0.55, 0.08, 1], SH: [2200, 3500, 0.85, 0.1, 0], ZH: [2200, 3500, 0.55, 0.085, 1], F: [2700, 4200, 0.45, 0.085, 0], V: [2700, 4200, 0.35, 0.065, 1], TH: [2700, 4200, 0.4, 0.085, 0], DH: [2700, 4200, 0.3, 0.05, 1], HH: [1200, 3200, 0.45, 0.06, 0] };

/** Phonemes -> frames of {f1,f2,w1,w2,level,voiced,hiss,band,f0}. opts: base (Hz), flat (rap), speed. */
export function textToFrames(text, opts = {}) {
  const base = opts.base || 115, flat = !!opts.flat, speed = opts.speed || 1;
  const sentences = parseText(text);
  const segs = [];
  const mk = (o) => segs.push(Object.assign({ n: 1, a: [500, 1400], b: [500, 1400], level: 0, voiced: false, hiss: 0, band: [2700, 4300], stress: false, sent: 0, sil: false }, o));
  const nf = (d) => Math.max(1, Math.round(d / speed / HOP));
  sentences.forEach((sent, si) => {
    sent.words.forEach((word, wi) => {
      let stressed = false;
      const ph = word.ph;
      for (let k = 0; k < ph.length; k++) {
        const p = ph[k];
        const nextV = ph[k + 1] && isVowelTok(ph[k + 1]);
        const st = !word.fn && !stressed && isVowelTok(p);
        if (st) stressed = true;
        if (VOW[p]) {
          const [f1, f2, d] = VOW[p];
          mk({ n: nf(d * (st ? 1.15 : 0.9)), a: [f1, f2], b: [f1, f2], level: st ? 1 : 0.78, voiced: true, stress: st, sent: si });
        } else if (DIPH[p]) {
          const [a, b] = DIPH[p];
          mk({ n: nf(st ? 0.2 : 0.15), a, b, level: st ? 1 : 0.8, voiced: true, stress: st, sent: si });
        } else if (SON[p]) {
          const [f1, f2, d, lv] = SON[p];
          mk({ n: nf(d), a: [f1, f2], b: [f1, f2], level: lv, voiced: true, sent: si });
        } else if (STOP[p]) {
          const [loc, lo, hi, vcd] = STOP[p];
          mk({ n: nf(0.045), a: [250, loc], b: [250, loc], level: vcd ? 0.22 : 0, voiced: !!vcd, sent: si });
          mk({ n: nf(vcd ? 0.012 : 0.02), a: [300, loc], b: [300, loc], level: vcd ? 0.8 : 0.9, hiss: 1, band: [lo, hi], sent: si });
          if (!vcd && nextV) mk({ n: nf(0.022), a: [500, loc], b: [500, loc], level: 0.45, hiss: 1, band: [1200, 3200], sent: si });
        } else if (FRIC[p]) {
          const [lo, hi, lv, d, vcd] = FRIC[p];
          mk({ n: nf(d), a: [350, 1400], b: [350, 1400], level: lv, hiss: 1, voiced: !!vcd, band: [lo, hi], sent: si });
        } else if (p === 'CH' || p === 'JH') {
          mk({ n: nf(0.03), a: [300, 1800], b: [300, 1800], level: 0, sent: si });
          mk({ n: nf(0.085), a: [350, 1800], b: [350, 1800], level: 0.8, hiss: 1, voiced: p === 'JH', band: [2200, 3800], sent: si });
        } else if (p === 'ZH') {
          mk({ n: nf(0.08), a: [350, 1800], b: [350, 1800], level: 0.55, hiss: 1, voiced: true, band: [2200, 3500], sent: si });
        }
      }
      if (wi < sent.words.length - 1) {
        mk({ n: nf(word.after === 'comma' ? 0.2 : 0.03), level: 0, sil: true, sent: si });
      }
    });
    mk({ n: nf(sent.end === '.' || sent.end === '!' || sent.end === '?' ? 0.38 : 0.2), level: 0, sil: true, sent: si });
  });

  // frames from segments
  const frames = [];
  const sentOf = [];
  for (const sg of segs) {
    for (let k = 0; k < sg.n; k++) {
      const t = (k + 0.5) / sg.n;
      frames.push({
        f1: lerp(sg.a[0], sg.b[0], t), f2: lerp(sg.a[1], sg.b[1], t),
        w1: 1, w2: 0.5, level: sg.level, voiced: sg.voiced && sg.level > 0, hiss: sg.hiss ? sg.level : 0,
        band: sg.band, stress: sg.stress, sil: sg.sil, f0: base,
      });
      sentOf.push(sg.sent);
    }
  }
  // soften the very first/last frames of a sound so it doesn't click
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.voiced && (!frames[i - 1] || !frames[i - 1].voiced)) f.level *= 0.6;
    if (f.voiced && (!frames[i + 1] || !frames[i + 1].voiced)) f.level *= 0.7;
    // F2 matters more than its peak amplitude says: weight like the original (w2 * 1.8 later)
    f.w1 = 1; f.w2 = f.f2 < 1100 ? 0.45 : 0.55;
  }
  // formant smoothing across neighbours (3-tap), only inside voiced runs
  const raw = frames.map((f) => [f.f1, f.f2]);
  for (let i = 1; i < frames.length - 1; i++) {
    if (frames[i].voiced && frames[i - 1].voiced && frames[i + 1].voiced) {
      frames[i].f1 = (raw[i - 1][0] + raw[i][0] + raw[i + 1][0]) / 3;
      frames[i].f2 = (raw[i - 1][1] + raw[i][1] + raw[i + 1][1]) / 3;
    }
  }
  // pitch contour: declination, stress accent, question rise
  let i0 = 0;
  while (i0 < frames.length) {
    let i1 = i0;
    while (i1 < frames.length && sentOf[i1] === sentOf[i0]) i1++;
    const sent = sentences[sentOf[i0]];
    const len = Math.max(1, i1 - i0);
    for (let i = i0; i < i1; i++) {
      const frac = (i - i0) / len;
      let f0 = flat ? base * (1.04 - 0.08 * frac) : base * (1.14 - 0.3 * frac);
      if (frames[i].stress) f0 *= flat ? 1.12 : 1.1;
      if (sent && sent.end === '?' && frac > 0.7) f0 *= 1 + 0.55 * ((frac - 0.7) / 0.3);
      if (sent && sent.end === '!' && frames[i].stress) f0 *= 1.08;
      frames[i].f0 = f0;
    }
    i0 = i1;
  }
  // smooth f0 (5-tap) and clamp to the motor's friendly range
  const f0raw = frames.map((f) => f.f0);
  for (let i = 0; i < frames.length; i++) {
    let s = 0, c = 0;
    for (let k = -2; k <= 2; k++) { const v = f0raw[i + k]; if (v) { s += v; c++; } }
    frames[i].f0 = clamp(s / c, 70, 250);
  }
  return frames;
}

// ------------------------------------------------------------------ voice rendering
// A voiced beat = two sines (F1, F2) restarted every pitch period; hiss = 3 random high tones per 4 ms.
function addTones(out, sr, startT, dur, tones, level, decay) {
  const s0 = Math.floor(startT * sr);
  const n = Math.max(1, Math.round(dur * sr));
  for (let i = 0; i < n; i++) {
    const idx = s0 + i;
    if (idx >= out.length) return;
    const x = i / sr;
    let v = 0;
    for (const [f, a] of tones) v += a * Math.sin(TAU * f * x);
    const env = decay ? Math.pow(1 - i / n, 1.1) : Math.min(1, i / 12, (n - i) / 12);
    out[idx] += v * level * env;
  }
}

/** Renders frames to samples (mono Float32Array at sr). Returns {samples, cycles}. */
export function renderFrames(frames, sr, gain = 0.5) {
  const total = frames.length * HOP;
  const out = new Float32Array(Math.ceil(total * sr) + 64);
  let cycles = 0;
  // voiced layer
  let t = 0;
  while (t < total) {
    const f = frames[Math.min(frames.length - 1, Math.floor(t / HOP))];
    let step = 0.005;
    if (f.level > 0 && f.voiced) {
      step = 1 / f.f0;
      const w0 = f.w1, w1 = f.w2 * 1.8, sum = w0 + w1;
      addTones(out, sr, t, step, [[f.f1, w0 / sum], [f.f2, w1 / sum]], f.level * gain * 1.4, true);
      cycles += (f.f1 * w0 + f.f2 * w1) / sum * step;
    }
    t += step;
  }
  // hiss layer
  t = 0;
  while (t < total) {
    const f = frames[Math.min(frames.length - 1, Math.floor(t / HOP))];
    const step = 0.004;
    if (f.hiss > 0) {
      const [lo, hi] = f.band;
      const tones = [0, 1, 2].map(() => [lo + Math.random() * (hi - lo), 0.34]);
      addTones(out, sr, t, step, tones, f.hiss * (f.voiced ? 0.5 : 0.7) * gain * 1.5, false);
      cycles += ((lo + hi) / 2) * step;
    }
    t += step;
  }
  return { samples: out, cycles: Math.round(cycles) };
}

/** Text -> {frames, samples, cycles, duration}. opts: {base, flat, speed}. */
export function makeVoice(text, sr, opts = {}) {
  const frames = textToFrames(text, opts);
  const r = renderFrames(frames, sr);
  return { frames, samples: r.samples, cycles: r.cycles, duration: frames.length * HOP };
}

export function greetingLine(date = new Date()) {
  const h = date.getHours();
  const hello = h < 5 ? "You're up late." : h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : h < 22 ? 'Good evening.' : "You're up late.";
  return hello + " I'm your trackpad. I don't have a speaker. I've been meaning to say something.";
}

// ------------------------------------------------------------------ non-voice scenes
function buf(sr, seconds) { return new Float32Array(Math.ceil(seconds * sr) + 64); }

function thump(out, sr, startT, amp) {
  const s0 = Math.floor(startT * sr);
  const n = Math.floor(0.11 * sr);
  let ph = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / sr;
    ph += (TAU * (120 + 780 * Math.exp(-t / 0.02))) / sr;
    out[s0 + i] += Math.sin(ph) * amp * Math.exp(-t / 0.05) * 0.8;
  }
}

/** Two double thumps, no words. */
export function heartbeat(sr) {
  const out = buf(sr, 2.4);
  const times = [];
  for (let r = 0; r < 2; r++) {
    const t0 = r * 1.14;
    thump(out, sr, t0, 1); thump(out, sr, t0 + 0.28, 0.7);
    times.push(t0, t0 + 0.28);
  }
  return { samples: out, times, duration: 2.28, cycles: 400 };
}

/** A tone rising from 100 Hz to 4 kHz (exponential), 6 s by default. */
export function sweep(sr, seconds = 6) {
  const out = buf(sr, seconds);
  let ph = 0, cycles = 0;
  const n = Math.floor(seconds * sr);
  for (let i = 0; i < n; i++) {
    const f = 100 * Math.pow(40, i / sr / seconds);
    ph += (TAU * f) / sr; cycles += f / sr;
    const env = Math.min(1, i / 400, (n - i) / 400);
    out[i] = Math.sin(ph) * 0.45 * env;
  }
  return { samples: out, duration: seconds, cycles: Math.round(cycles) };
}

export const ROLL_NOTES = ['C7', 'A6', 'G6', 'E6', 'C6', 'A5'];
/** The hook: scoops, glides and vibrato in the motor's loudest octave. */
export function sing(sr) {
  const beat = 60 / 112;
  const melody = [['E6', 0.5], ['G6', 0.5], ['A6', 1], ['G6', 0.5], ['E6', 0.5], ['C6', 1],
    ['E6', 0.5], ['G6', 0.5], ['A6', 0.5], ['C7', 0.5], ['A6', 1], ['G6', 1],
    ['E6', 0.5], ['C6', 0.5], ['A5', 1], ['C6', 0.5], ['E6', 0.5], ['A6', 2.5]];
  const phraseEnds = new Set([5, 11, 17]);
  const totalBeats = melody.reduce((s, m) => s + m[1], 0);
  const out = buf(sr, totalBeats * beat + 0.3);
  const notes = [];
  let at = 0, prev = null, cycles = 0, ph = 0;
  melody.forEach(([name, beats], i) => {
    const target = hz(name), length = beats * beat;
    const sounding = phraseEnds.has(i) ? length * 0.86 : length;
    notes.push({ t0: at, t1: at + sounding, name });
    const n = Math.floor(sounding * sr), s0 = Math.floor(at * sr);
    for (let k = 0; k < n; k++) {
      const age = k / sr;
      let f = target;
      if (prev && age < 0.045) f = prev * Math.pow(target / prev, age / 0.045);
      else if (!prev && age < 0.04) f = target * Math.pow(2, (-0.6 * (1 - age / 0.04)) / 12);
      if (age > 0.2) f *= Math.pow(2, (Math.min(1, (age - 0.2) / 0.25) * 0.22 * Math.sin(TAU * 5.8 * age)) / 12);
      let level = age < 0.015 ? 0.6 + (0.4 * age) / 0.015 : 1;
      if (i === melody.length - 1) level *= Math.max(0, 1 - age / length);
      level *= Math.min(1, (n - k) / 200);
      ph += (TAU * f) / sr; cycles += f / sr;
      out[s0 + k] += (Math.sin(ph) * 0.4 + Math.sin(2 * ph) * 0.06) * level;
    }
    prev = phraseEnds.has(i) ? null : target;
    at += length;
  });
  return { samples: out, notes, duration: at, cycles: Math.round(cycles) };
}

const KICK = 'X.........X..x..', SNARE = '....X.......X...', HAT = 'x.x.x.x.x.x.xxx.', BASS_RHYTHM = 'x.....x...x.....';
export const GROOVE = { bpm: 92, bars: 4, rapBar: 2, kick: KICK, snare: SNARE, hat: HAT };
/** Drums + bass for 4 bars; from bar 2 the rapped line (a makeVoice result) rides on top and ducks the band. */
export function groove(sr, rap) {
  const bpm = GROOVE.bpm, bars = GROOVE.bars, s16 = 15 / bpm, barLen = 16 * s16, rapBar = GROOVE.rapBar;
  const end = bars * barLen, rapStart = rapBar * barLen;
  const out = buf(sr, end + 0.4);
  const talkingAt = (t) => {
    if (!rap || t < rapStart) return false;
    const f = rap.frames[Math.floor((t - rapStart) / HOP)];
    return !!f && f.level > 0 && (f.voiced || f.hiss > 0);
  };
  // hits
  const hits = [];
  for (let i = 0; i < bars * 16; i++) {
    [[KICK, 0], [SNARE, 1], [HAT, 2]].forEach(([p, kind]) => {
      const c = p[i % 16];
      if (c !== '.') hits.push({ t: i * s16, kind, acc: c === 'X' ? 1 : 0.65 });
    });
  }
  let cycles = 0;
  for (const h of hits) {
    const s0 = Math.floor(h.t * sr);
    const len = h.kind === 0 ? 0.14 : h.kind === 1 ? 0.16 : 0.05;
    const n = Math.floor(len * sr);
    let ph = 0, lp = 0;
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const age = i / sr;
      const talking = talkingAt(h.t + age);
      const duck = talking ? [0.4, 0.25, 0][h.kind] : 1;
      if (!duck) continue;
      let v = 0;
      if (h.kind === 0) {
        const f = 150 + 850 * Math.exp(-age / 0.018);
        ph += (TAU * f) / sr; cycles += f / sr;
        v = Math.sin(ph) * 0.9 * h.acc * Math.exp(-age / 0.05) * 0.8;
      } else if (h.kind === 1) {
        const noise = Math.random() * 2 - 1;
        lp += 0.55 * (noise - lp); // brighten: noise minus its low-pass
        v = (noise - lp) * 0.75 * h.acc * Math.exp(-age / 0.045) * 0.7;
        cycles += 2500 / sr;
      } else {
        v = Math.sin(TAU * 3951 * age) * 0.9 * h.acc * 0.5 * Math.exp(-age / 0.012);
        cycles += 3951 / sr;
      }
      out[s0 + i] += v * duck;
    }
  }
  // bass tones (multiples of the root near 880 and 1320 Hz), off while the voice talks
  const roots = [110, 87.31, 130.81, 98];
  const n = Math.floor(end * sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (talkingAt(t)) continue;
    const i16 = Math.floor(t / s16), pos = i16 % 16;
    let last = 0;
    for (let k = pos; k >= 0; k--) if (BASS_RHYTHM[k] !== '.') { last = k; break; }
    const age = t - (Math.floor(i16 / 16) * 16 + last) * s16;
    const env = (age < 0.01 ? age / 0.01 : 1) * (0.25 + 0.75 * Math.exp(-age * 7));
    const bass = roots[Math.floor(i16 / 16) % roots.length];
    let v = 0;
    for (const [target, w] of [[880, 0.6], [1320, 0.4]]) {
      const f = Math.max(1, Math.round(target / bass)) * bass;
      v += Math.sin(TAU * f * t) * 0.45 * env * w;
    }
    out[i] += v * 0.9;
    cycles += 1000 / sr;
  }
  // the rap
  if (rap) {
    const s0 = Math.floor(rapStart * sr);
    for (let i = 0; i < rap.samples.length && s0 + i < out.length; i++) out[s0 + i] += rap.samples[i];
    cycles += rap.cycles;
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 1.1) * 0.8;
  return { samples: out, hits, rapStart, bpm, bars, s16, barLen, duration: end + 0.3, cycles: Math.round(cycles) };
}

/** An arpeggio up, then the motor's purest note (3951 Hz) fading out. */
export function sparkle(sr) {
  const out = buf(sr, 5 * 0.09 + 0.7);
  let at = 0, cycles = 0;
  for (const n of ['A5', 'C6', 'E6', 'A6', 'C7']) {
    const f = hz(n), len = 0.09, s0 = Math.floor(at * sr), cnt = Math.floor(len * sr);
    for (let i = 0; i < cnt; i++) out[s0 + i] += Math.sin(TAU * f * (i / sr)) * 0.45 * Math.min(1, i / 60, (cnt - i) / 100);
    cycles += f * len; at += len;
  }
  const s0 = Math.floor(at * sr), cnt = Math.floor(0.6 * sr);
  for (let i = 0; i < cnt; i++) out[s0 + i] += Math.sin(TAU * 3951 * (i / sr)) * 0.4 * Math.exp(-(i / sr) / 0.18) * Math.min(1, i / 60);
  cycles += 3951 * 0.6;
  return { samples: out, duration: at + 0.6, cycles: Math.round(cycles) };
}

/** The ten notes of the touch pad, left to right. */
export const TOUCH_SCALE = ['G5', 'A5', 'B5', 'C6', 'E6', 'F6', 'G6', 'A6', 'B6', 'C7'].map((n) => ({ name: n, hz: hz(n) }));
