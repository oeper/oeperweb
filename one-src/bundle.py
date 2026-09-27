"""Inline every oneX app into one self-contained .html, then build one.html (the mother page holding all of them)."""
import re, json, pathlib
D = pathlib.Path(__file__).resolve().parent
OUT = D / 'dist'; OUT.mkdir(exist_ok=True)
APPS = {'word': 'oneword', 'sheet': 'onesheet', 'slide': 'oneslide', 'idea': 'oneidea', 'site': 'onesite'}

def inline(app_dir):
    base = D / app_dir
    html = (base / 'index.html').read_text(encoding='utf-8')
    def css(m):
        return '<style>\n' + (base / m.group(1)).read_text(encoding='utf-8') + '\n</style>'
    def js(m):
        src = (base / m.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script')
        return '<script>\n' + src + '\n</script>'
    html = re.sub(r'<link rel="stylesheet" href="((?!https?:)[^"?]+)(?:\?[^"]*)?">', css, html)
    html = re.sub(r'<script src="((?!https?:)[^"?]+)(?:\?[^"]*)?"></script>', js, html)
    assert not re.search(r'(href|src)="(?!https?:|#|data:)[^"]+\.(css|js)', html), app_dir + ': unresolved local asset'
    head = '<!doctype html>\n<html lang="en">\n'
    if 'name="viewport"' not in html:
        html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">', 1)
    return head + html + '\n</html>\n'

src = {}
for app_id, d in APPS.items():
    h = inline(d); src[app_id] = h
    (OUT / f'{d}.html').write_text(h, encoding='utf-8')
import subprocess, sys
subprocess.run([sys.executable, str(D / 'onepdf' / 'build.py')], check=True, stdout=subprocess.DEVNULL)
pdf = (D / 'onepdf' / 'index.html').read_text(encoding='utf-8'); src['pdf'] = pdf
(OUT / 'onepdf.html').write_text(pdf, encoding='utf-8')

shell = (D / 'shell' / 'shell.html').read_text(encoding='utf-8')
blob = json.dumps(src, ensure_ascii=False).replace('</', '<\\/').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
shell = shell.replace('/*M3_CSS*/', (D / 'shared' / 'm3.css').read_text(encoding='utf-8'))
shell = shell.replace('/*CORE_JS*/', (D / 'shared' / 'core.js').read_text(encoding='utf-8').replace('</script', '<\\/script'))
shell = shell.replace('/*APP_SRC*/', blob)
(OUT / 'one.html').write_text(shell.replace('<!--CLOUD-->', ''), encoding='utf-8')
# oeper.dev build: same page plus cloud saving (needs /shared/account.js from the site)
cloud = (D / 'shell' / 'cloud.js').read_text(encoding='utf-8')
# epic AI assistant (optional, off unless enabled in oeper.dev/settings) — shared/one-ai.js on the site
site = shell.replace('<!--CLOUD-->', '<script type="module">\n' + cloud.replace('</script', '<\\/script') + '\n</script>\n<script type="module" src="/shared/one-ai.js?v=1"></script>')
(OUT / 'one-oeper.html').write_text(site, encoding='utf-8')
# published copy: oeper.dev/one
(D.parent / 'one' / 'index.html').write_text(site, encoding='utf-8')
for f in sorted(OUT.iterdir()): print(f'{f.name:16} {f.stat().st_size/1024:8.0f} KB')
