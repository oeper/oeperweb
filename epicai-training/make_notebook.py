"""Turns UI_Voyager_finetune.py (cells separated by '# %%' lines) into UI_Voyager_finetune.ipynb for Google Colab.
Run: python make_notebook.py   (the .py is the source of truth; edit it, then run this again)."""
import json, os

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'UI_Voyager_finetune.py'), encoding='utf-8').read().split('\n')

cells, cur, kind = [], [], None

def flush():
    global cur, kind
    while cur and not cur[-1].strip():
        cur.pop()
    if kind is None or not cur:
        cur = []
        return
    if kind == 'md':
        text = [l[2:] if l.startswith('# ') else l.lstrip('#') for l in cur]
        cells.append({'cell_type': 'markdown', 'metadata': {}, 'source': [t + '\n' for t in text[:-1]] + [text[-1]]})
    else:
        cells.append({'cell_type': 'code', 'metadata': {}, 'execution_count': None, 'outputs': [], 'source': [t + '\n' for t in cur[:-1]] + [cur[-1]]})
    cur = []

for line in src:
    if line.startswith('# %%'):
        flush()
        kind = 'md' if '[markdown]' in line else 'code'
    else:
        cur.append(line)
flush()

nb = {
    'cells': cells,
    'metadata': {
        'accelerator': 'GPU',
        'colab': {'gpuType': 'T4', 'provenance': []},
        'kernelspec': {'display_name': 'Python 3', 'name': 'python3'},
        'language_info': {'name': 'python'},
    },
    'nbformat': 4,
    'nbformat_minor': 0,
}
out = os.path.join(here, 'UI_Voyager_finetune.ipynb')
json.dump(nb, open(out, 'w', encoding='utf-8'), indent=1)
print(len(cells), 'cells ->', out)
