/* oneLang — listening (speech synthesis) and talking (speech recognition), both from the browser. */
(() => {
'use strict';
const V = window.VOICE = {};
const syn = window.speechSynthesis, SR = window.SpeechRecognition || window.webkitSpeechRecognition;
V.canSpeak = !!syn; V.canListen = !!SR;
let voices = [];
const load = () => { try { voices = syn.getVoices(); } catch {} };
if (syn) { load(); syn.addEventListener && syn.addEventListener('voiceschanged', load); }

V.voiceFor = code => {
  const l = LANG.by[code]; if (!l || !voices.length) return null;
  const want = l.speech.toLowerCase(), base = want.split('-')[0];
  return voices.find(v => v.lang.toLowerCase().replace('_', '-') === want) || voices.find(v => v.lang.toLowerCase().startsWith(base)) || null;
};
V.has = code => !syn ? false : !voices.length ? true : !!V.voiceFor(code);

let playing = null;
V.stop = () => { try { syn && syn.cancel(); } catch {} if (playing) { const p = playing; playing = null; p(); } };
/* speak text in a language; onEnd runs when it finishes or is stopped. Long text is read sentence by sentence (browsers cut long utterances short). */
V.speak = (text, code, { onEnd, rate = 1 } = {}) => {
  V.stop();
  if (!syn) return false;
  const l = LANG.by[code]; const v = V.voiceFor(code);
  if (voices.length && !v) return false;
  const parts = String(text).match(/[^.!?。！？\n]+[.!?。！？]*/g) || [text];
  const q = []; let cur = '';
  parts.forEach(p => { if ((cur + p).length > 180 && cur) { q.push(cur); cur = ''; } cur += p; }); if (cur.trim()) q.push(cur);
  let done = false; const finish = () => { if (done) return; done = true; if (playing === finish) playing = null; onEnd && onEnd(); };
  playing = finish;
  q.forEach((t, i) => { const u = new SpeechSynthesisUtterance(t.trim()); u.lang = l ? l.speech : code; if (v) u.voice = v; u.rate = rate; if (i === q.length - 1) { u.onend = finish; u.onerror = finish; } else u.onerror = finish; syn.speak(u); });
  return true;
};
V.speaking = () => { try { return !!(syn && syn.speaking); } catch { return false; } };

let rec = null;
V.stopListening = () => { try { rec && rec.stop(); } catch {} };
/* listen once. lang may be 'auto' (the browser's own language is used). Calls onText(text, final) as words come in. */
V.listen = (code, { onText, onEnd, onError } = {}) => {
  if (!SR) { onError && onError(new Error('This browser can’t listen. Try Chrome, Edge or Safari.')); return false; }
  V.stop(); V.stopListening();
  const r = rec = new SR(); r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  r.lang = code && code !== LANG.AUTO && LANG.by[code] ? LANG.by[code].speech : (navigator.language || 'en-US');
  let text = '';
  r.onresult = e => { let s = '', fin = false; for (let i = 0; i < e.results.length; i++) { s += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; } text = s; onText && onText(s.trim(), fin); };
  r.onerror = e => { if (e.error === 'no-speech' || e.error === 'aborted') return; onError && onError(new Error(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Allow the microphone to talk to oneLang.' : e.error === 'language-not-supported' ? 'This browser can’t listen in that language.' : 'Listening stopped (' + e.error + ').')); };
  r.onend = () => { if (rec === r) rec = null; onEnd && onEnd(text.trim()); };
  try { r.start(); } catch (err) { rec = null; onError && onError(err); return false; }
  return true;
};
V.listening = () => !!rec;
})();
