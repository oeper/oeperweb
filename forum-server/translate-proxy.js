// The public door of the oneLang translator (forum-server/translator/server.py, NLLB-200 on this machine).
//
//   GET  /translate/health   public: { online, languages, busy, queued } (cached a few seconds; online:false when the translator isn't running)
//   POST /translate/api      signed in (Firebase ID token): { texts:[...], from:"auto"|code, to:code } -> { translations, detected }
//
// The translator itself only listens on 127.0.0.1 (TRANSLATOR_URL, default http://127.0.0.1:8790) and has no sign-in, so this is the only way in.
// Each person gets TRANSLATE_DAILY_CHARS characters a day (default 1,000,000; owners are unlimited). It is free, unlike epic AI's token allowance,
// but it is one slow machine: one request is translated at a time and the rest wait in line.

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

module.exports = function mountTranslate(app, { verifyFirebaseToken, isOwner, dataDir }) {
  const TARGET = new URL(process.env.TRANSLATOR_URL || 'http://127.0.0.1:8790');
  const DAILY = Number(process.env.TRANSLATE_DAILY_CHARS) || 1000000;
  const usageFile = path.join(dataDir, 'translate-usage.json');
  let usage = {}; try { usage = JSON.parse(fs.readFileSync(usageFile, 'utf8')); } catch {}
  const today = () => new Date().toISOString().slice(0, 10);
  const save = () => { try { fs.writeFileSync(usageFile, JSON.stringify(usage)); } catch {} };
  const used = email => (usage[email] && usage[email].day === today() ? usage[email].chars : 0);

  const call = (method, p, body, timeout) => new Promise((ok, bad) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({ host: TARGET.hostname, port: TARGET.port || 80, method, path: p, timeout, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, r => {
      const chunks = []; r.on('data', c => chunks.push(c));
      r.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {} ok({ status: r.statusCode || 502, json: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', bad);
    if (data) req.write(data); req.end();
  });

  let healthCache = { at: 0, v: { online: false } };
  async function health() {
    if (Date.now() - healthCache.at < 5000) return healthCache.v;
    let v = { online: false };
    try { const r = await call('GET', '/health', null, 2500); if (r.status === 200 && r.json.ok) v = { online: true, model: r.json.model, languages: r.json.languages, busy: r.json.busy, queued: r.json.queued, threads: r.json.threads }; } catch {}
    healthCache = { at: Date.now(), v }; return v;
  }

  app.get('/translate/health', async (req, res) => { res.set('Cache-Control', 'no-store'); res.json(await health()); });

  app.post('/translate/api', verifyFirebaseToken, express.json({ limit: '300kb' }), async (req, res) => {
    const b = req.body || {};
    if (!Array.isArray(b.texts) || !b.texts.length || !b.texts.every(t => typeof t === 'string')) return res.status(400).json({ error: 'texts must be a list of strings' });
    const chars = b.texts.reduce((n, t) => n + t.length, 0);
    const email = req.user.email, owner = isOwner(email);
    if (!owner && used(email) + chars > DAILY) return res.status(429).json({ error: `You have used today's ${DAILY.toLocaleString('en-US')} free translation characters. They come back at midnight UTC.`, code: 'daily' });
    try {
      const r = await call('POST', '/translate', { texts: b.texts, from: b.from || 'auto', to: b.to }, 200000);
      if (r.status === 200 && !owner) { usage[email] = { day: today(), chars: used(email) + chars }; save(); }
      if (r.status === 503) res.set('Retry-After', '20');
      res.status(r.status).json(r.json);
    } catch (e) {
      healthCache = { at: Date.now(), v: { online: false } };
      res.status(502).json({ error: "The translator isn't running right now.", code: 'offline' });
    }
  });
};
