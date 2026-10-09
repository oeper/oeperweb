// Carries the Searver app's remote-control API over the same Cloudflare tunnel as everything else:
//   https://<your domain>/searver-remote/...  ->  http://127.0.0.1:8799/...  (the Searver app on this same phone)
// It only forwards bytes. Every request is signed with a key that only the paired devices know, and the app rejects
// anything unsigned, so exposing this path doesn't expose the phone. Mounted before the JSON body parser so POST bodies
// pass through untouched.

const http = require('http');

module.exports = function mountRemoteProxy(app) {
  const PORT = Number(process.env.SEARVER_REMOTE_PORT) || 8799;
  app.use('/searver-remote', (req, res) => {
    const headers = { ...req.headers, host: `127.0.0.1:${PORT}` };
    delete headers['x-forwarded-for'];
    // the app throttles wrong guesses per caller; behind a tunnel the caller's address is in this header
    headers['x-real-ip'] = String(req.get('cf-connecting-ip') || req.ip || '');
    const up = http.request({ host: '127.0.0.1', port: PORT, method: req.method, path: req.url || '/', headers, timeout: 60000 }, r => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    });
    up.on('timeout', () => up.destroy());
    up.on('error', () => { if (!res.headersSent) res.status(502).json({ error: "the Searver app on the phone isn't answering (remote access may be off)" }); });
    req.pipe(up);
  });
};
