// Two jobs, both on oeper.dev so the site never has to link to GitHub:
//  1. Firebase's sign-in handler (/__/auth/*, /__/firebase/*), so Google's account chooser says "to continue to oeper.dev"
//     instead of "oepernet-….firebaseapp.com". shared/account.js has authDomain: "oeper.dev".
//  2. /download/<name>: streams the epic AI app files (kept in GitHub releases) under an oeper.dev address.
// Only these paths are routed here (see wrangler.toml); everything else on oeper.dev is still GitHub Pages.
const FIREBASE_HOST = 'oepernet-1683535959256.firebaseapp.com';
const DESKTOP = 'https://github.com/oeper/oeperweb/releases/download/epicai-desktop-latest/';
const FILES = {
  'epic-ai-android.apk': ['https://github.com/oeper/releases/releases/download/epicai-latest/EpicAI.apk', 'EpicAI.apk', 'application/vnd.android.package-archive'],
  'epic-ai-windows.exe': [DESKTOP + 'epic-AI-Setup.exe', 'epic-AI-Setup.exe', 'application/vnd.microsoft.portable-executable'],
  'epic-ai-windows-portable.exe': [DESKTOP + 'epic-AI-Portable.exe', 'epic-AI-Portable.exe', 'application/vnd.microsoft.portable-executable'],
  'epic-ai-mac-apple-silicon.dmg': [DESKTOP + 'epic-AI-mac-arm64.dmg', 'epic-AI-mac-apple-silicon.dmg', 'application/x-apple-diskimage'],
  'epic-ai-mac-intel.dmg': [DESKTOP + 'epic-AI-mac-x64.dmg', 'epic-AI-mac-intel.dmg', 'application/x-apple-diskimage'],
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/download/')) {
      const f = FILES[url.pathname.slice('/download/'.length)];
      if (!f || (request.method !== 'GET' && request.method !== 'HEAD')) return new Response('Not found', { status: 404 });
      const upstream = await fetch(f[0], { method: request.method, redirect: 'follow' });
      if (!upstream.ok) return new Response('This download is not available right now.', { status: 502 });
      const h = new Headers();
      h.set('content-type', f[2]);
      h.set('content-disposition', `attachment; filename="${f[1]}"`);
      const len = upstream.headers.get('content-length'); if (len) h.set('content-length', len);
      h.set('cache-control', 'public, max-age=300');
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers: h });
    }
    if (!url.pathname.startsWith('/__/auth/') && !url.pathname.startsWith('/__/firebase/')) return new Response('Not found', { status: 404 });
    url.protocol = 'https:';
    url.hostname = FIREBASE_HOST;
    url.port = '';
    const upstream = await fetch(new Request(url, request), { redirect: 'manual' });
    // the handler page and its scripts are cached by the browser as usual; nothing is rewritten
    return new Response(upstream.body, upstream);
  },
};
