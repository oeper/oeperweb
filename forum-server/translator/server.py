#!/usr/bin/env python3
"""oneLang translator: NLLB-200 (distilled, 600M) on CTranslate2, served as a tiny local JSON API.

  GET  /health      {ok, model, busy, queued, languages:[oneLang codes]}
  POST /translate   {"texts":[...], "from":"auto"|code, "to":code}  ->  {"translations":[...], "detected":[code|null,...]}
  POST /detect      {"text":"..."}                                    ->  {"lang":code|null}

It listens on 127.0.0.1 only; forum-server/translate-proxy.js is the public door (sign-in, limits) and talks to it.
Everything is configured by environment variables, see README.md. Standard library + ctranslate2, sentencepiece, langid.
"""
import json, os, re, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from langs import NLLB, FROM_LANGID, NO_SPACE_TARGETS

MODEL_DIR = os.environ.get('TRANSLATOR_MODEL', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model'))
HOST = os.environ.get('TRANSLATOR_HOST', '127.0.0.1')
PORT = int(os.environ.get('TRANSLATOR_PORT', '8790'))
THREADS = int(os.environ.get('TRANSLATOR_THREADS', '0')) or (os.cpu_count() or 4)
BEAM = int(os.environ.get('TRANSLATOR_BEAM', '2'))
MAX_TEXTS = 100
MAX_CHARS = 24000
QUEUE_WAIT = 180          # seconds a request may wait for its turn

import ctranslate2, sentencepiece as spm, langid

sp = spm.SentencePieceProcessor(model_file=os.path.join(MODEL_DIR, 'sentencepiece.bpe.model'))
DEVICE = os.environ.get('TRANSLATOR_DEVICE', 'cpu').lower()    # cpu (default), cuda (NVIDIA only, experimental: hung on a GTX 1070 here), or auto
def make_translator():
    want_gpu = DEVICE == 'cuda' or (DEVICE == 'auto' and ctranslate2.get_cuda_device_count() > 0)
    if want_gpu:
        try: return ctranslate2.Translator(MODEL_DIR, device='cuda', compute_type='auto', inter_threads=1), 'cuda'
        except Exception as e:
            print('GPU not usable, using the CPU:', str(e)[:200], file=sys.stderr, flush=True)
            if DEVICE == 'cuda': raise
    return ctranslate2.Translator(MODEL_DIR, device='cpu', compute_type='int8', inter_threads=1, intra_threads=THREADS), 'cpu'
translator, USED_DEVICE = make_translator()
vocab = set(open(os.path.join(MODEL_DIR, 'shared_vocabulary.txt'), encoding='utf-8').read().split('\n'))
SUPPORTED = {c: n for c, n in NLLB.items() if n in vocab}
BY_NLLB = {n: c for c, n in SUPPORTED.items()}
langid.set_languages(None)

gate = threading.Semaphore(1)          # one translation at a time uses all the cores
state = {'busy': 0, 'queued': 0, 'done': 0, 'chars': 0}
state_lock = threading.Lock()

# ---------- splitting into sentences ----------
SENT = re.compile(r'(?<=[.!?…؟।։。！？])["”’»)\]]*\s+|(?<=[。！？])')
def split_sentences(line):
    out = []
    for part in SENT.split(line):
        part = part.strip() if part else ''
        if not part: continue
        while len(part) > 420:                      # a very long sentence: cut at a comma or space near the middle
            cut = max(part.rfind(', ', 0, 360), part.rfind('; ', 0, 360), part.rfind(' ', 0, 360))
            if cut < 120: cut = 360
            out.append(part[:cut + 1].strip()); part = part[cut + 1:].strip()
        if part: out.append(part)
    return out

def has_letters(s): return re.search(r'[^\W\d_]', s, re.U) is not None

def detect(text):
    s = text.strip()[:600]
    if not has_letters(s): return None
    code, _ = langid.classify(s)
    code = FROM_LANGID.get(code, code)
    if code == 'zh-CN' and re.search(r'[們這個來說還時過對國學會長開]', s) and not re.search(r'[们这个来说还时过对国学会长开]', s): code = 'zh-TW'
    return code if code in SUPPORTED else None

def translate_texts(texts, src, dst):
    """Returns (translations, detected). Each text: lines -> sentences -> NLLB batches (sorted by length) -> glued back with the same layout."""
    tgt = SUPPORTED[dst]
    detected, plan, jobs = [], [], []        # plan[i] = list of lines; each line = list of sentence slots ('raw' str or job index)
    for t in texts:
        from_code = src if src != 'auto' else detect(t)
        detected.append(from_code if src == 'auto' else None)
        lines = []
        for line in t.split('\n'):
            slots = []
            for s in split_sentences(line):
                if not has_letters(s) or from_code is None or from_code == dst: slots.append(s)
                else: slots.append(len(jobs)); jobs.append((SUPPORTED[from_code], s))
            lines.append((slots, len(line) - len(line.lstrip()), len(line) - len(line.rstrip())))
        plan.append(lines)
    results = [None] * len(jobs)
    if jobs:
        order = sorted(range(len(jobs)), key=lambda i: len(jobs[i][1]))
        sources = [[jobs[i][0]] + sp.encode(jobs[i][1], out_type=str) + ['</s>'] for i in order]
        prefixes = [[tgt] for _ in order]
        outs = translator.translate_batch(sources, target_prefix=prefixes, beam_size=BEAM, max_batch_size=2048, batch_type='tokens',
                                          max_decoding_length=300, repetition_penalty=1.1, no_repeat_ngram_size=0)
        for k, i in enumerate(order):
            toks = outs[k].hypotheses[0]
            if toks and toks[0] == tgt: toks = toks[1:]
            results[i] = sp.decode(toks).strip()
    glue = '' if dst in NO_SPACE_TARGETS else ' '
    final = []
    for lines in plan:
        built = []
        for slots, lead, trail in lines:
            text = glue.join(results[s] if isinstance(s, int) else s for s in slots)
            built.append(text)
        final.append('\n'.join(built))
    return final, detected

def turn(fn):
    """Wait for the single translation slot (queue), run, release."""
    with state_lock: state['queued'] += 1
    if not gate.acquire(timeout=QUEUE_WAIT):
        with state_lock: state['queued'] -= 1
        raise TimeoutError('busy')
    with state_lock: state['queued'] -= 1; state['busy'] += 1
    try: return fn()
    finally:
        with state_lock: state['busy'] -= 1
        gate.release()

class H(BaseHTTPRequestHandler):
    server_version = 'oneLangTranslator'
    def log_message(self, *a): pass
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body)
    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > 400000: raise ValueError('too big')
        return json.loads(self.rfile.read(n) or b'{}')
    def do_GET(self):
        if self.path.split('?')[0] == '/health':
            with state_lock: s = dict(state)
            return self._send(200, {'ok': True, 'model': os.path.basename(MODEL_DIR.rstrip('/\\')), 'threads': THREADS, 'device': USED_DEVICE, 'beam': BEAM, **s, 'languages': sorted(SUPPORTED)})
        self._send(404, {'error': 'not found'})
    def do_POST(self):
        try: body = self._body()
        except Exception: return self._send(400, {'error': 'bad request'})
        path = self.path.split('?')[0]
        if path == '/detect':
            return self._send(200, {'lang': detect(str(body.get('text') or ''))})
        if path != '/translate': return self._send(404, {'error': 'not found'})
        texts, src, dst = body.get('texts'), str(body.get('from') or 'auto'), str(body.get('to') or '')
        if not isinstance(texts, list) or not texts or not all(isinstance(t, str) for t in texts): return self._send(400, {'error': 'texts must be a list of strings'})
        if len(texts) > MAX_TEXTS or sum(len(t) for t in texts) > MAX_CHARS: return self._send(413, {'error': 'too much text in one request'})
        if dst not in SUPPORTED: return self._send(400, {'error': 'unsupported target language', 'code': 'lang'})
        if src != 'auto' and src not in SUPPORTED: return self._send(400, {'error': 'unsupported source language', 'code': 'lang'})
        t0 = time.time()
        try: out, det = turn(lambda: translate_texts(texts, src, dst))
        except TimeoutError: return self._send(503, {'error': 'the translator is busy', 'code': 'busy'})
        except Exception as e: print('translate failed:', repr(e), file=sys.stderr); return self._send(500, {'error': 'translation failed'})
        with state_lock: state['done'] += 1; state['chars'] += sum(len(t) for t in texts)
        self._send(200, {'translations': out, 'detected': det, 'ms': int((time.time() - t0) * 1000)})

if __name__ == '__main__':
    print(f'translator: {len(SUPPORTED)} languages, {USED_DEVICE}' + (f', {THREADS} threads' if USED_DEVICE == 'cpu' else '') + f', beam {BEAM}, listening on {HOST}:{PORT}', flush=True)
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
