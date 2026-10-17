// Talking to the epic AI worker (the same one the website and the Android app use) and the upload server.
import { idToken } from './acct.js';

export const AI = 'https://oeper-ai.oeper.workers.dev';
export const UPLOADS = 'https://fs.oeper.dev';

async function authHeaders(extra) {
  const h = { ...(extra || {}) };
  const t = await idToken().catch(() => null);
  if (t) h.Authorization = 'Bearer ' + t;
  return h;
}

/**
 * Streams /api/chat. onDelta(content, reasoning) gets the whole text so far; onEvent(json) gets the worker's own events
 * (remember, updateMemory, forget, setFollow, profile, image). Resolves { content, reasoning, meta }. Errors carry .isLimit for a 429.
 */
export async function streamChat({ messages, signal, quiet, onDelta, onEvent, onActivity }) {
  const res = await fetch(AI + '/api/chat', {
    method: 'POST', signal,
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ app: 'epicai', messages, quiet: quiet ? true : undefined, imageTools: quiet ? undefined : true }),
  });
  if (!res.ok || !res.body) {
    let msg = `Server error (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch {}
    const e = new Error(msg); if (res.status === 429) e.isLimit = true; throw e;
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', content = '', reasoning = '', meta = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (onActivity) onActivity();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let j; try { j = JSON.parse(payload); } catch { continue; }
      if (j.meta) { meta = j.meta; continue; }
      if (j.remember || j.updateMemory || j.forget || j.setFollow || j.image) { if (onEvent) onEvent(j); continue; }
      const d = (j.choices && j.choices[0] && j.choices[0].delta) || {};
      if (d.reasoning_content) reasoning += d.reasoning_content;
      if (d.content) content += d.content;
      if ((d.reasoning_content || d.content) && onDelta) onDelta(content, reasoning);
    }
  }
  return { content, reasoning, meta };
}

/** One quiet (not counted as a message) question, answered as plain text. */
export async function askQuiet(messages, signal) {
  const r = await streamChat({ messages, signal, quiet: true });
  return r.content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?<\/think>/, '').trim();
}

/** Today's allowance: { plan, signedIn, used, limit, resetsAt, bonus, ... } or null. */
export async function usage() {
  try {
    const r = await fetch(AI + '/api/usage', { headers: await authHeaders() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Redeems a promo code or key: resolves { summary }; rejects with the server's explanation. */
export async function redeem(code) {
  let res;
  try {
    res = await fetch(AI + '/api/redeem', { method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ code, source: 'app' }) });
  } catch { throw new Error("Couldn't reach the server. Check your connection and try again."); }
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || `Server answered ${res.status}`);
  return data;
}

/** A recording in, the words out (Whisper on the worker). Signed-in people only. */
export async function transcribe(blob) {
  let res;
  try {
    res = await fetch(AI + '/api/transcribe', { method: 'POST', headers: await authHeaders({ 'Content-Type': blob.type || 'audio/webm' }), body: blob });
  } catch { throw new Error("Couldn't reach the server."); }
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || `Server answered ${res.status}`);
  return data.text || '';
}

/** Uploads an image the person attached (like the website does) and resolves its URL. */
export async function uploadImage(file) {
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch(UPLOADS + '/upload-file', { method: 'POST', body: fd });
  let data = {}; try { data = await res.json(); } catch {}
  if (!res.ok || !data.url) throw new Error(data.error || `upload failed (HTTP ${res.status})`);
  return data.url;
}

export async function urlToDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('could not read image')); r.readAsDataURL(blob); });
}

export async function resizeImage(file, maxDim = 1024, quality = 0.85) {
  const img = await new Promise((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error('could not read image')); el.src = URL.createObjectURL(file); });
  let { width, height } = img;
  if (width > maxDim || height > maxDim) { const s = maxDim / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  return new File([blob], 'image.jpg', { type: 'image/jpeg' });
}

export async function dataUrlToFile(dataUrl, name) {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name || 'image.jpg', { type: blob.type || 'image/jpeg' });
}

/** A call to one of the worker's own JSON routes (share links...), signed in. Errors carry .status. */
export async function workerCall(method, path, body) {
  let res;
  try {
    res = await fetch(AI + path, { method, headers: await authHeaders(body ? { 'Content-Type': 'application/json' } : undefined), body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error("Couldn't reach the server. Check your connection and try again."); }
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error((data && data.error) || `Server answered ${res.status}`); e.status = res.status; throw e; }
  return data;
}

/** The thumbs-up on an answer (the worker allows only a few of these an hour, so the thumbs-down stays on the device). */
export function sendRating(version) {
  return workerCall('POST', '/api/feedback', { kind: 'rating', message: '👍 Helpful answer', app: 'desktop', version: version || '' }).catch(() => {});
}
