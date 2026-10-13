// Serves Firebase's sign-in handler from oeper.dev, so Google's account chooser says "to continue to oeper.dev"
// instead of "oepernet-….firebaseapp.com". Only /__/auth/* and /__/firebase/* are routed here (see wrangler.toml);
// everything else on oeper.dev is still GitHub Pages. shared/account.js has authDomain: "oeper.dev".
const FIREBASE_HOST = 'oepernet-1683535959256.firebaseapp.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/__/auth/') && !url.pathname.startsWith('/__/firebase/')) return new Response('Not found', { status: 404 });
    url.protocol = 'https:';
    url.hostname = FIREBASE_HOST;
    url.port = '';
    const upstream = await fetch(new Request(url, request), { redirect: 'manual' });
    // the handler page and its scripts are cached by the browser as usual; nothing is rewritten
    return new Response(upstream.body, upstream);
  },
};
