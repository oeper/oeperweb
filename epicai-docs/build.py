#!/usr/bin/env python
"""Builds ../epic-ai-docs.html from how-epic-ai-works.md (needs: python -m pip install markdown).

The page is plain static HTML (no JavaScript needed to read it) so people, search engines and epic AI's own
read_webpage tool can all read it. Run from anywhere:  python epicai-docs/build.py
"""
import html
import pathlib
import re

import markdown

here = pathlib.Path(__file__).resolve().parent
src = (here / 'how-epic-ai-works.md').read_text(encoding='utf-8')

md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc', 'sane_lists'], extension_configs={'toc': {'permalink': False}})
body = md.convert(src)

# the first h1 becomes the page title; the rest of the headings get anchors (toc extension already adds ids)
title = re.search(r'<h1[^>]*>(.*?)</h1>', body).group(1)
body = re.sub(r'<h1[^>]*>.*?</h1>', '', body, count=1, flags=re.S)
def flat(tokens):
    for t in tokens:
        yield t
        yield from flat(t.get('children', []))


def plain(name):
    return re.sub(r'^\d+\.\s*', '', name)


toc = ''.join('<a href="#%s">%s</a>' % (html.escape(t['id']), html.escape(plain(t['name']))) for t in flat(md.toc_tokens) if t['level'] == 2)
desc = 'How epic AI works: the pieces, what happens to a message, tools, memory, limits, safety and privacy, phone control, the browser extension, and how to extend it.'

page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(title)} — oeper.dev</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="icon" href="https://oeper.dev/icon.svg" type="image/svg+xml">
<script src="/shared/theme-boot.js?v=16" data-cfasync="false"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300;8..144,400;8..144,500;8..144,600&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/shared/fonts.css?v=1">
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  :root {{ --md-sys-color-background: #111318; --md-sys-color-surface: #1a1c22; --md-sys-color-surface-variant: #2f353d; --md-sys-color-primary: #a8c7fa; --md-sys-color-on-primary: #062e6f; --md-sys-color-secondary-container: #33485d; --md-sys-color-on-secondary-container: #d2e4ff; --md-sys-color-on-surface: #e2e2e6; --md-sys-color-on-surface-variant: #c4c7c5; --md-sys-color-outline: #43474e; }}
  body {{ min-height: 100vh; background-color: var(--md-sys-color-background); background-image: var(--oe-bg-image, none); color: var(--md-sys-color-on-surface); font-family: var(--oe-font-override, 'Google Sans', 'Roboto Flex', system-ui, sans-serif); -webkit-font-smoothing: antialiased; }}
  .page {{ max-width: 860px; margin: 0 auto; padding: 48px 24px 110px; }}
  h1.title {{ font-size: clamp(2rem, 5vw, 2.8rem); font-weight: 400; letter-spacing: -.5px; }}
  .toc {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 8px; }}
  .toc a {{ font-size: 13px; text-decoration: none; color: var(--md-sys-color-on-secondary-container); background: var(--md-sys-color-secondary-container); border-radius: 999px; padding: 5px 12px; }}
  h2 {{ font-size: 24px; font-weight: 500; margin: 44px 0 10px; scroll-margin-top: 80px; }}
  h3 {{ font-size: 18px; font-weight: 500; margin: 24px 0 6px; }}
  p, li {{ font-size: 15.5px; line-height: 1.65; color: var(--md-sys-color-on-surface-variant); }}
  p {{ margin: 10px 0; }} ul, ol {{ padding-left: 24px; margin: 10px 0; }} li {{ margin: 4px 0; }}
  strong {{ color: var(--md-sys-color-on-surface); font-weight: 600; }}
  a {{ color: var(--md-sys-color-primary); }}
  code {{ background: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface); padding: 1px 6px; border-radius: 6px; font-size: 13px; }}
  pre {{ background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline); border-radius: 16px; padding: 14px 16px; overflow-x: auto; margin: 14px 0; }}
  pre code {{ background: none; padding: 0; font-size: 12.5px; line-height: 1.5; }}
  .tablewrap {{ overflow-x: auto; margin: 14px 0; border-radius: 16px; border: 1px solid var(--md-sys-color-outline); }}
  table {{ border-collapse: collapse; width: 100%; min-width: 520px; }}
  th, td {{ text-align: left; padding: 9px 12px; font-size: 14px; line-height: 1.5; vertical-align: top; border-bottom: 1px solid var(--md-sys-color-outline); color: var(--md-sys-color-on-surface-variant); }}
  th {{ color: var(--md-sys-color-on-surface); font-weight: 600; background: var(--md-sys-color-surface); }}
  tr:last-child td {{ border-bottom: 0; }}
  em {{ color: var(--md-sys-color-on-surface); }}
</style>
</head>
<body>
<main class="page">
  <h1 class="title">{title}</h1>
  <nav class="toc" aria-label="Sections">{toc}</nav>
  <article>
{body}
  </article>
</main>
<script type="module" data-cfasync="false">
import {{ mountTopNav }} from '/shared/topnav.js?v=49';
mountTopNav();
</script>
</body>
</html>
'''
page = re.sub(r'<table>', '<div class="tablewrap"><table>', page)
page = page.replace('</table>', '</table></div>')
out = here.parent / 'epic-ai-docs.html'
out.write_text(page, encoding='utf-8')
print('wrote', out, len(page), 'bytes')
