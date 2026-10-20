"""Turns UI_Voyager_finetune.py and make_gguf.py (cells separated by '# %%' lines) into the Colab notebooks
UI_Voyager_finetune.ipynb and UI_Voyager_make_gguf.ipynb.
Run: python make_notebook.py   (the .py files are the source of truth; edit them, then run this again)."""
import json, os

here = os.path.dirname(os.path.abspath(__file__))


def build(py_name, nb_name, gpu):
    src = open(os.path.join(here, py_name), encoding='utf-8').read().split('\n')
    cells, cur, kind = [], [], None

    def flush():
        nonlocal cur
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
    meta = {'colab': {'provenance': []}, 'kernelspec': {'display_name': 'Python 3', 'name': 'python3'}, 'language_info': {'name': 'python'}}
    if gpu:
        meta['accelerator'] = 'GPU'
        meta['colab']['gpuType'] = 'T4'
    nb = {'cells': cells, 'metadata': meta, 'nbformat': 4, 'nbformat_minor': 0}
    out = os.path.join(here, nb_name)
    json.dump(nb, open(out, 'w', encoding='utf-8'), indent=1)
    print(len(cells), 'cells ->', out)


build('UI_Voyager_finetune.py', 'UI_Voyager_finetune.ipynb', True)
build('make_gguf.py', 'UI_Voyager_make_gguf.ipynb', False)
