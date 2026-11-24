#!/usr/bin/env python
"""Builds ../search-index.json: the static half of oeper.dev's search (pages, tools, articles, downloads, epic AI docs).

The worker (cf-ai-worker/src/search.js, GET /api/search) downloads this file from oeper.dev and merges it with the live
posts / videos / people / apps. Run it and commit the result whenever pages, tools, articles or the docs change:

    python scripts/build-search-index.py

Pages are read from the root *.html files (title, meta description, headings). Hand-written details (nicer names, keywords, the
quick links shown before you type) live in PAGES below. The hidden-page list in shared/topnav.js (HIDDEN_PAGES) is merged in too.
"""
import html
import json
import pathlib
import re
import time
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Pages that must never be searchable (admin tools, hand-off pages, error pages, needs-an-id pages)
SKIP = {'404', 'admin', 'storage', 'promo-admin', 'app-auth', 'ext-auth', 'share', 'search', 'activity'}

# Hand-written details. quick = position in the "before you type" list. keywords add to what is read from the page.
PAGES = {
    'index': dict(name='home', url='/', icon='home', desc='the oeper.dev home page with the latest posts and videos.', keywords=['home', 'start', 'main page', 'front page']),
    'feed': dict(name='feed', icon='forum', quick=3, desc='posts from everyone on oeper.dev: write, comment, vote and follow.', keywords=['posts', 'forum', 'community', 'social', 'timeline', 'write a post']),
    'videos': dict(name='videos', icon='smart_display', quick=4, desc='watch and upload videos.', keywords=['video', 'watch', 'upload video', 'clips']),
    'files': dict(name='files', icon='folder', quick=5, desc='your personal file storage on oeper.dev: upload, organise, share, make files private.', keywords=['file storage', 'upload', 'cloud', 'drive', 'documents', 'private files', 'share a file']),
    'messages': dict(name='messages', icon='chat', quick=7, desc='private chats and group chats with voice messages.', keywords=['chat', 'dm', 'direct message', 'inbox', 'groups', 'voice message']),
    'ai': dict(name='epic AI', icon='auto_awesome', quick=1, desc="oeper.dev's own AI assistant: chat, search the web, make pictures, write documents, remember what you tell it.", keywords=['epic ai', 'ai', 'assistant', 'chatbot', 'gpt', 'ask ai', 'chat with ai', 'draw a picture', 'generate image']),
    'epicenter': dict(name='Epicenter', icon='storefront', quick=6, desc='the app store: download apps for Android, Windows, Mac and Linux, rate them, publish your own.', keywords=['app store', 'apps', 'apk', 'download apps', 'install apps', 'publish an app']),
    'tools': dict(name='tools', icon='build', quick=8, desc='free tools: office suite, QR codes, music composer, PDF tools, chess, bot hosting.', keywords=['utilities', 'tools', 'free tools']),
    'settings': dict(name='settings', icon='settings', desc='theme, epic AI switch, privacy, files, notifications and account settings.', keywords=['preferences', 'theme', 'dark mode', 'light mode', 'account', 'privacy settings', 'dark theme']),
    'profile': dict(name='profile', icon='person', desc='your public profile (or someone else\'s with ?u=handle).', keywords=['my profile', 'account', 'avatar', 'handle', 'bio']),
    'usage': dict(name='usage', icon='bar_chart', desc='how much of your daily epic AI allowance you have used.', keywords=['epic ai usage', 'tokens', 'limit', 'quota', 'allowance']),
    'plus': dict(name='oeper+', icon='workspace_premium', desc='the oeper+ plan: more epic AI usage, more pictures, a + badge.', keywords=['oeper plus', 'premium', 'upgrade', 'subscription', 'pricing', 'plan']),
    'redeem': dict(name='redeem a code', icon='redeem', desc='redeem a promo code or product key.', keywords=['promo code', 'product key', 'coupon', 'redeem', 'code']),
    'status': dict(name='status', icon='monitor_heart', desc='is oeper.dev up? live status of the site, server and epic AI.', keywords=['uptime', 'down', 'server status', 'is it working', 'outage']),
    'dbhosting': dict(name='discord bot hosting', icon='smart_toy', desc='host a Discord bot or build one without code.', keywords=['discord bot', 'bot hosting', 'bot maker', 'host a bot', 'dbhosting']),
    'chess': dict(name='chess', icon='chess', desc='play chess.', keywords=['chess game', 'play chess', 'checkmate']),
    'composer': dict(name='music composer', icon='piano', desc='a melody grid: place notes, add a harmony echo, play.', keywords=['melody', 'music maker', 'piano', 'compose']),
    'qrmaker': dict(name='QR maker', icon='qr_code_2', desc='make QR codes for free, no sign-up.', keywords=['qr code', 'qr generator', 'qrcode']),
    'pdfcombiner': dict(name='PDF combiner', icon='merge', desc='merge several PDFs into one.', keywords=['merge pdf', 'combine pdf', 'join pdf']),
    'pdfsplitbysize': dict(name='PDF splitter', icon='call_split', desc='split a big PDF into smaller files by size.', keywords=['split pdf', 'pdf splitter', 'cut pdf']),
    'downloads': dict(name='downloads', icon='download', desc='files and software to download.', keywords=['download', 'software', 'assets', 'pock']),
    'articles': dict(name='articles', icon='newspaper', desc='guides, news, opinions and textbooks.', keywords=['blog', 'guides', 'news', 'textbooks', 'read']),
    'leaderboard': dict(name='leaderboard', icon='leaderboard', desc='most viewed, most liked and most followed on oeper.dev.', keywords=['rankings', 'top users', 'karma']),
    'feedback': dict(name='feedback', icon='rate_review', desc='tell us about a bug, an idea or anything else.', keywords=['report a bug', 'suggest', 'contact', 'idea', 'bug', 'help']),
    'privacy': dict(name='privacy policy', icon='shield', desc='what oeper.dev stores and why.', keywords=['privacy', 'data', 'gdpr', 'personal information']),
    'terms': dict(name='terms of service', icon='gavel', desc='the rules for using oeper.dev.', keywords=['terms', 'tos', 'rules', 'legal']),
    'refunds': dict(name='refunds', icon='undo', desc='the refund policy.', keywords=['refund', 'money back']),
    'cookies': dict(name='cookies', icon='cookie', desc='what cookies and local storage oeper.dev uses.', keywords=['cookie', 'consent', 'tracking']),
    'docs': dict(name='docs', icon='menu_book', quick=2, desc='documentation: how epic AI works, the search API, Epicenter for developers.', keywords=['documentation', 'help', 'guides', 'developers', 'api', 'how it works']),
    'epic-ai-docs': dict(name='how epic AI works', icon='menu_book', desc='how epic AI works: the pieces, tools, memory, limits, safety, privacy and how to extend it.', keywords=['epic ai docs', 'epic ai documentation', 'epic ai limits', 'epic ai privacy', 'epic ai memory', 'epic ai tools']),
    'search-api': dict(name='search API', icon='api', desc='use oeper.dev search from your own code: one GET request, JSON back.', keywords=['api', 'search api', 'developers', 'json']),
}

# Extra entries that are not pages of their own (shortcuts into the One suite, epic AI downloads, ...)
EXTRA = [
    dict(name='one (office suite)', url='/one', icon='apps', desc='oneWord, oneSheet, oneSlide, oneIdea, oneDraw, onePDF, oneLang and oneSite in one place.', keywords=['office', 'oneword', 'onesheet', 'oneslide', 'oneidea', 'onepdf', 'onedraw', 'onesite', 'word', 'excel', 'powerpoint', 'docs', 'documents', 'spreadsheet', 'slides', 'presentation', 'whiteboard', 'pdf editor', 'edit pdf', 'translate'], quick=9),
    dict(name='oneLang (translator)', url='/one#open=lang', icon='translate', desc='translate text, documents, PDFs, images and websites in 130 languages.', keywords=['translate', 'translator', 'google translate', 'languages']),
    dict(name='epic AI for Android', url='/tools', icon='android', desc='the epic AI app: voice, phone control, photos, documents.', keywords=['epic ai apk', 'android app', 'epic ai android']),
    dict(name='epic AI browser extension', url='/docs', icon='extension', desc='epic AI in your browser: ask about a page or let it do tasks for you.', keywords=['browser extension', 'chrome extension', 'mcp', 'browser control']),
    dict(name='sign in', url='/settings', icon='login', desc='sign in with Google from settings.', keywords=['log in', 'login', 'sign up', 'register', 'account']),
]


class Text(HTMLParser):
    """Collects title, meta description, headings and the first chunk of visible text."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ''; self.desc = ''; self.h = []; self.noindex = False
        self.stack = []; self.buf = ''; self.body = []; self.skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta':
            n = (a.get('name') or '').lower()
            if n == 'description': self.desc = a.get('content') or ''
            if n == 'robots' and 'noindex' in (a.get('content') or '').lower(): self.noindex = True
        if tag in ('script', 'style', 'noscript', 'svg', 'template'): self.skip += 1
        if tag in ('title', 'h1', 'h2', 'h3'): self.stack.append(tag); self.buf = ''

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'svg', 'template'): self.skip = max(0, self.skip - 1)
        if self.stack and self.stack[-1] == tag:
            self.stack.pop(); t = ' '.join(self.buf.split())
            if tag == 'title': self.title = t
            elif t: self.h.append(t)

    def handle_data(self, data):
        if self.stack: self.buf += data
        if not self.skip and data.strip(): self.body.append(data.strip())


def clean_title(t):
    return re.sub(r'\s*[—|-]\s*oeper\.dev\s*$', '', t).strip() or t


def page_entries():
    out, seen = [], set()
    for f in sorted(ROOT.glob('*.html')):
        slug = f.stem
        if slug in SKIP:
            continue
        p = Text(); p.feed(f.read_text(encoding='utf-8', errors='replace'))
        if p.noindex and slug not in PAGES:   # search engines are told to skip it; our own search only skips the ones listed in SKIP
            continue
        o = PAGES.get(slug, {})
        url = o.get('url') or '/' + slug
        kw = list(o.get('keywords', []))
        kw += [h for h in p.h if 2 < len(h) < 60][:12]
        body = ' '.join(p.body)[:1500] if slug not in PAGES else ''
        out.append(dict(id='page:' + slug, type='page', title=o.get('name') or clean_title(p.title) or slug, url=url,
                        desc=o.get('desc') or p.desc or ' '.join(p.body)[:160], keywords=kw, body=body,
                        icon=o.get('icon', 'article'), **({'quick': o['quick']} if 'quick' in o else {})))
        seen.add(url)
    for i, e in enumerate(EXTRA):
        out.append(dict(id='extra:%d' % i, type='page', title=e['name'], url=e['url'], desc=e['desc'], keywords=e['keywords'], icon=e['icon'], **({'quick': e['quick']} if 'quick' in e else {})))
    return out


def hidden_pages():
    src = (ROOT / 'shared' / 'topnav.js').read_text(encoding='utf-8')
    m = re.search(r'export const HIDDEN_PAGES = \[(.*?)\n\];', src, re.S)
    out = []
    if not m:
        return out
    for row in re.finditer(r"\{\s*keywords:\s*\[(.*?)\],\s*name:\s*'([^']*)',\s*url:\s*'([^']*)',\s*icon:\s*'([^']*)'", m.group(1), re.S):
        kws = re.findall(r"'([^']*)'", row.group(1))
        out.append(dict(id='hidden:' + row.group(3), type='page', title=row.group(2), url=row.group(3), desc='', keywords=kws, icon=row.group(4)))
    return out


def tools():
    src = (ROOT / 'tools.html').read_text(encoding='utf-8')
    out = []
    for card in re.finditer(r'<(?:a|div)[^>]*class="tool-card[^"]*"[^>]*>(.*?)</h3>\s*<p>(.*?)</p>', src, re.S):
        block = card.group(0)
        name = re.search(r'<h3>(.*?)$', card.group(1), re.S)
        href = re.search(r'<a[^>]*href="(/[^"]*)"[^>]*class="tool-card', block) or re.search(r'class="tool-dl" href="(/[^"]*)"', src[card.start():card.start() + 4000])
        if not name or not href:
            continue
        title = html.unescape(re.sub(r'<[^>]+>', '', name.group(1))).strip()
        icon = re.search(r'material-symbols-rounded">([a-z_0-9]+)<', block)
        out.append(dict(id='tool:' + title, type='page', section='tools', title=title, url=href.group(1), desc=html.unescape(re.sub(r'<[^>]+>', '', card.group(2))).strip(), keywords=['tool'], icon=icon.group(1) if icon else 'build'))
    return out


def articles():
    j = json.loads((ROOT / 'data' / 'articles.json').read_text(encoding='utf-8'))
    out = []
    for i, a in enumerate(j.get('articles', [])):
        body = a.get('content') or ''
        if re.match(r'^https?://', body.strip()):
            body = ''
        out.append(dict(id='article:%d' % i, type='article', title=a.get('title', ''), url='/articles?article=%d' % i, desc=a.get('excerpt', ''), body=re.sub(r'[#*_`>\[\]()]', ' ', body)[:3000], keywords=[a.get('category', '')], icon='newspaper'))
    return out


def downloads():
    j = json.loads((ROOT / 'data' / 'downloads.json').read_text(encoding='utf-8'))
    out = []
    for i, f in enumerate(j.get('files', [])):
        out.append(dict(id='download:%d' % i, type='download', title=f.get('label', ''), url='/downloads?category=' + f.get('category', ''), desc=f.get('desc', ''), keywords=[f.get('category', ''), 'download'], icon='download'))
    return out


def docs():
    """One entry per section of the epic AI docs, linked to its anchor."""
    md = (ROOT / 'epicai-docs' / 'how-epic-ai-works.md').read_text(encoding='utf-8')
    out, cur, buf = [], None, []

    def flush():
        if cur and buf:
            text = re.sub(r'[`*|#>-]+', ' ', ' '.join(buf))
            anchor = re.sub(r'[^a-z0-9]+', '-', cur.lower()).strip('-')
            out.append(dict(id='doc:' + anchor, type='doc', section='how epic AI works', title=re.sub(r'^\d+\.\s*', '', cur), url='/epic-ai-docs#' + anchor, desc=' '.join(text.split())[:160], body=' '.join(text.split())[:4000], keywords=['epic ai', 'docs'], icon='menu_book'))
    for line in md.split('\n'):
        m = re.match(r'^## (.+)', line)
        if m:
            flush(); cur = m.group(1).strip(); buf = []
        elif cur:
            buf.append(line)
    flush()
    api = ROOT / 'search-api.html'
    return out


def main():
    items = page_entries() + hidden_pages() + tools() + articles() + downloads() + docs()
    # merge duplicates by url: keep the richest, union the keywords
    merged = {}
    for it in items:
        key = (it['type'], it['url'])
        if key in merged:
            m = merged[key]
            m['keywords'] = sorted(set(m.get('keywords', [])) | set(it.get('keywords', [])))
            for k in ('desc', 'body', 'quick', 'icon'):
                if not m.get(k) and it.get(k):
                    m[k] = it[k]
        else:
            merged[key] = it
    docs_out = list(merged.values())
    for d in docs_out:   # drop empty fields to keep the file small
        for k in [k for k, v in d.items() if v in ('', [], None)]:
            del d[k]
    out = ROOT / 'search-index.json'
    out.write_text(json.dumps({'v': 1, 'built': int(time.time() * 1000), 'docs': docs_out}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('wrote', out, len(docs_out), 'entries,', out.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
