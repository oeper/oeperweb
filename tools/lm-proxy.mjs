// Local bridge to your LM Studio server, for the "use my own provider" setting.
//
// Why: a browser will not send the Authorization header to a server whose CORS answer is just "Access-Control-Allow-Headers: *",
// so the key never gets through ("Failed to fetch"). This little server sits on your own computer, adds the key itself, and
// answers CORS properly. The key is read from the LM_KEY environment variable and is never written to a file or sent anywhere else.
//
//   PowerShell:  $env:LM_KEY = "your key"; node tools/lm-proxy.mjs
//   Then in Settings > your own AI model:  base address  http://127.0.0.1:8787/v1   (leave the API key box empty)
//
// Optional: LM_TARGET (default https://ai.oeper.dev), PORT (default 8787).
import http from 'node:http';
import https from 'node:https';

const TARGET = new URL(process.env.LM_TARGET || 'https://ai.oeper.dev');
const PORT = +(process.env.PORT || 8787);
const KEY = process.env.LM_KEY || '';
// only pages of this site may use the bridge, otherwise any web page you visit could spend your GPU
const ALLOWED = new Set(['https://oeper.dev', 'https://www.oeper.dev', 'http://localhost:8765', 'http://127.0.0.1:8765']);

http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED.has(origin)) { res.writeHead(403); return res.end('origin not allowed'); }
  const cors = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key, anthropic-version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const headers = { 'content-type': req.headers['content-type'] || 'application/json', accept: req.headers.accept || '*/*', host: TARGET.host };
  if (KEY) headers.authorization = 'Bearer ' + KEY;
  const up = https.request({ hostname: TARGET.hostname, port: TARGET.port || 443, path: req.url, method: req.method, headers }, r => {
    const out = { ...cors, 'content-type': r.headers['content-type'] || 'application/json', 'cache-control': 'no-cache' };
    res.writeHead(r.statusCode || 502, out);
    r.pipe(res);
  });
  up.on('error', err => { if (!res.headersSent) res.writeHead(502, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'bridge could not reach ' + TARGET.host + ': ' + err.message } })); });
  res.on('close', () => up.destroy());
  req.pipe(up);
}).listen(PORT, '127.0.0.1', () => console.log(`LM bridge on http://127.0.0.1:${PORT}/v1 -> ${TARGET.origin} (${KEY ? 'key loaded' : 'NO KEY set, requests will be refused with 401'})`));
