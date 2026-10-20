#!/usr/bin/env python
"""One-off generator for docs.html and search-api.html (they reuse the look of epic-ai-docs.html). Kept so the pages can be regenerated; the
pages themselves are plain static HTML afterwards."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'epic-ai-docs.html').read_text(encoding='utf-8')
head = src[:src.index('<main class="page">')]
head = re.sub(r'<title>.*?</title>', '<title>@TITLE@ — oeper.dev</title>', head, flags=re.S)
head = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="@DESC@">', head)
extra_css = '''  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; margin: 22px 0; }
  .dcard { display: block; text-decoration: none; background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline); border-radius: 22px; padding: 18px 20px; color: inherit; transition: background .15s, transform .15s; backdrop-filter: var(--oe-glass-blur, none); }
  .dcard:hover { background: var(--md-sys-color-surface-variant); transform: translateY(-2px); }
  .dcard .material-symbols-rounded { font-size: 28px; color: var(--md-sys-color-primary); }
  .dcard h3 { font-size: 17px; font-weight: 500; margin: 8px 0 4px; color: var(--md-sys-color-on-surface); }
  .dcard p { font-size: 14px; margin: 0; }
  .lead { color: var(--md-sys-color-on-surface-variant); font-size: 16px; line-height: 1.55; margin: 10px 0 8px; }
  .try { display: flex; gap: 8px; margin: 14px 0; } .try input { flex: 1; min-width: 0; font: inherit; padding: 10px 14px; border-radius: 999px; border: 1px solid var(--md-sys-color-outline); background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); }
  .try button { font: inherit; font-weight: 500; border: 0; border-radius: 999px; padding: 10px 20px; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); cursor: pointer; }
  #tryOut { max-height: 340px; }
</style>'''
head = head.replace('</style>', extra_css, 1)
tail = '''<script type="module" data-cfasync="false">
import { mountTopNav } from '/shared/topnav.js?v=50';
mountTopNav();
@SCRIPT@
</script>
</body>
</html>
'''

docs_body = '''<main class="page">
  <h1 class="title">docs</h1>
  <p class="lead">how things on oeper.dev work, for people and for developers.</p>
  <div class="cards">
    <a class="dcard" href="/epic-ai-docs"><span class="material-symbols-rounded">auto_awesome</span><h3>how epic AI works</h3><p>the pieces, what happens to a message, tools, memory, limits, safety and privacy.</p></a>
    <a class="dcard" href="/search-api"><span class="material-symbols-rounded">api</span><h3>search API</h3><p>use oeper.dev search from your own code: one GET request, JSON back.</p></a>
    <a class="dcard" href="/epicenter/developers"><span class="material-symbols-rounded">storefront</span><h3>Epicenter for developers</h3><p>publish an app, ship updates with a manifest, check for updates from your app.</p></a>
    <a class="dcard" href="/epicai-extension/README.md"><span class="material-symbols-rounded">extension</span><h3>epic AI browser extension</h3><p>install it, how it controls a tab safely, and the MCP bridge for other AI apps.</p></a>
    <a class="dcard" href="/dbhosting"><span class="material-symbols-rounded">smart_toy</span><h3>Discord bot hosting</h3><p>host a bot or make one without code.</p></a>
    <a class="dcard" href="/privacy"><span class="material-symbols-rounded">shield</span><h3>privacy &amp; terms</h3><p>what oeper.dev stores and the rules for using it.</p></a>
  </div>
</main>
'''
(ROOT / 'docs.html').write_text(head.replace('@TITLE@', 'docs').replace('@DESC@', 'Documentation for oeper.dev: how epic AI works, the search API, Epicenter for developers, the browser extension.') + docs_body + tail.replace('@SCRIPT@', ''), encoding='utf-8')

api = 'https://oeper-ai.oeper.workers.dev/api/search'
api_body = '''<main class="page">
  <h1 class="title">search API</h1>
  <p class="lead">oeper.dev's own search, as a free public API. One GET request, JSON back, no key. It searches pages, tools, articles, downloads, the docs, posts, videos, people and Epicenter apps. Nothing private is indexed (no e-mail addresses, chats or shared conversations).</p>

  <h2>try it</h2>
  <div class="try"><input id="tryQ" value="epic ai limits" aria-label="query"><button id="tryGo">search</button></div>
  <pre id="tryOut">press search</pre>

  <h2>search</h2>
<pre>GET @API@?q=chess&amp;type=page&amp;limit=10</pre>
  <div class="tablewrap"><table><thead><tr><th>parameter</th><th>meaning</th></tr></thead><tbody>
    <tr><td><code>q</code></td><td>what to look for (required, up to 120 characters). Several words must (mostly) all match. Small typos still find things.</td></tr>
    <tr><td><code>type</code></td><td>only one kind: <code>page</code>, <code>doc</code>, <code>post</code>, <code>video</code>, <code>user</code>, <code>app</code>, <code>article</code>, <code>download</code>. Leave out for everything.</td></tr>
    <tr><td><code>limit</code></td><td>results per page, 1 to 50 (default 20).</td></tr>
    <tr><td><code>offset</code></td><td>skip this many results (for the next page).</td></tr>
  </tbody></table></div>
  <p>Answer:</p>
<pre>{
  "ok": true,
  "q": "epic ai limits",
  "took": 12,
  "terms": ["epic", "ai", "limits"],
  "total": 4,
  "counts": { "doc": 3, "page": 1 },
  "didYouMean": "",
  "indexed": 412,
  "results": [
    {
      "type": "doc",
      "title": "Limits, plans and codes",
      "url": "/epic-ai-docs#6-limits-plans-and-codes",
      "snippet": "Everything is counted in tokens per person per day…",
      "icon": "menu_book",
      "section": "how epic AI works",
      "score": 61.3
    }
  ]
}</pre>
  <p><code>url</code> is a path on <code>https://oeper.dev</code>. <code>counts</code> is how many matches each type has (for filter chips), <code>total</code> how many match in the chosen type, and <code>didYouMean</code> is a corrected query when almost nothing matched. People results have a <code>photo</code>; posts and videos have <code>by</code> and <code>at</code> (milliseconds).</p>

  <h2>suggest</h2>
<pre>GET @API@/suggest?q=vid</pre>
  <p>Up to 8 compact results (<code>type</code>, <code>title</code>, <code>url</code>, <code>icon</code>) for search-as-you-type. With an empty <code>q</code> it returns the site's quick links. This is what the search box in the top bar uses.</p>

  <h2>stats</h2>
<pre>GET @API@/stats</pre>
  <p>How many things are indexed, by type.</p>

  <h2>rules</h2>
  <ul>
    <li>Free to use from any website or program (CORS is open for GET). Please keep it under about 2 requests a second; over 120 a minute from one address answers 429.</li>
    <li>Answers are cached for 30 seconds. New posts show up within a couple of minutes.</li>
    <li>Be kind: link back to oeper.dev, do not copy the index.</li>
  </ul>

  <h2>examples</h2>
<pre>curl "@API@?q=discord+bot&amp;limit=3"

const r = await fetch('@API@?q=' + encodeURIComponent('piano'));
const { results } = await r.json();
for (const x of results) console.log(x.type, x.title, 'https://oeper.dev' + x.url);

import requests
r = requests.get('@API@', params={'q': 'qr code', 'type': 'page'})
print([x['title'] for x in r.json()['results']])</pre>
</main>
'''.replace('@API@', api)
script = '''const out = document.getElementById('tryOut'), qi = document.getElementById('tryQ');
async function go() { out.textContent = 'searching…'; try { const r = await fetch('@API@?limit=3&q=' + encodeURIComponent(qi.value)); out.textContent = JSON.stringify(await r.json(), null, 2); } catch (e) { out.textContent = 'could not reach the API: ' + e.message; } }
document.getElementById('tryGo').addEventListener('click', go);
qi.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });'''.replace('@API@', api)
(ROOT / 'search-api.html').write_text(head.replace('@TITLE@', 'search API').replace('@DESC@', 'Use oeper.dev search from your own code: one GET request, JSON back.') + api_body + tail.replace('@SCRIPT@', script), encoding='utf-8')
print('ok')
