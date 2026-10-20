# %% [markdown]
# # Make the GGUF from a finished LoRA (no training here)
#
# Use this when the training notebook finished (you have `epicai-training/out/lora` in Google Drive) but its GGUF step failed, or whenever you only want to rebuild the GGUF.
# **A GPU is not needed**: pick Runtime > Change runtime type > CPU (High-RAM if you have it) or leave the T4, then Runtime > **Run all**.
#
# Everything this notebook prints is ALSO written to `epicai-training/out/gguf-log.txt` in your Drive, so the log can be read from the computer without opening Colab.
# When it works you get `ui-voyager-ft-Q4_K_M.gguf` and `mmproj-ui-voyager-ft-f16.gguf` in `epicai-training/out/`.

# %%
from google.colab import drive
drive.mount('/content/drive')
import os, sys, gc, subprocess, traceback, time, shutil

OUT_DIR = '/content/drive/MyDrive/epicai-training/out'
BASE = 'MarsXL/UI-Voyager'
LOG = OUT_DIR + '/gguf-log.txt'
os.environ['HF_HUB_DISABLE_XET'] = '1'
os.environ['HF_HUB_DOWNLOAD_TIMEOUT'] = '60'
open(LOG, 'w').write('GGUF run started ' + time.ctime() + '\n')

def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s)
    with open(LOG, 'a') as f: f.write(s + '\n')

def sh(cmd, tail=40):
    log('$', cmd)
    r = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines = r.stdout.strip().split('\n')
    log('\n'.join(lines[-tail:]))
    log('exit code', r.returncode)
    return r.returncode == 0

def mem():
    try:
        import psutil
        m = psutil.virtual_memory(); return f'RAM free {m.available / 1e9:.1f} GB of {m.total / 1e9:.1f} GB'
    except Exception: return ''

log('LoRA files:', os.listdir(OUT_DIR + '/lora') if os.path.isdir(OUT_DIR + '/lora') else 'MISSING - run the training notebook first')
log(mem())
sh('pip -q install -U "transformers>=4.57" peft accelerate safetensors gguf sentencepiece')

# %% [markdown]
# ## 1. Merge the LoRA into the base model (on the CPU, in pieces so a free Colab does not run out of memory)

# %%
step = 'merge'
try:
    import torch
    from transformers import AutoProcessor, Qwen3VLForConditionalGeneration
    from peft import PeftModel
    shutil.rmtree('/content/merged', ignore_errors=True)
    base16 = Qwen3VLForConditionalGeneration.from_pretrained(BASE, torch_dtype=torch.float16, device_map='cpu', low_cpu_mem_usage=True)
    log('base loaded.', mem())
    merged = PeftModel.from_pretrained(base16, OUT_DIR + '/lora').merge_and_unload()
    log('merged.', mem())
    merged.save_pretrained('/content/merged', safe_serialization=True, max_shard_size='2GB')
    AutoProcessor.from_pretrained(BASE).save_pretrained('/content/merged')
    del merged, base16
    gc.collect()
    log('saved /content/merged:', sorted(os.listdir('/content/merged'))[:12])
except Exception:
    log(traceback.format_exc())
    raise

# %% [markdown]
# ## 2. Convert to GGUF with llama.cpp, then shrink it to Q4_K_M

# %%
L = '/content/llama.cpp'
if not os.path.isdir(L):
    assert sh(f'git clone -q --depth 1 https://github.com/ggml-org/llama.cpp {L}')
env_py = f'PYTHONPATH={L}/gguf-py python'
ok = (sh(f'{env_py} {L}/convert_hf_to_gguf.py /content/merged --outfile /content/ui-voyager-ft-f16.gguf --outtype f16')
      and sh(f'{env_py} {L}/convert_hf_to_gguf.py /content/merged --outfile /content/mmproj-ui-voyager-ft-f16.gguf --outtype f16 --mmproj'))
log('converted:', ok)
assert ok, 'conversion failed: see the log above (and gguf-log.txt in Drive)'

# %%
quant_ok = (sh(f'cmake -S {L} -B {L}/build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF', tail=8)
            and sh(f'cmake --build {L}/build --target llama-quantize -j 4', tail=8)
            and sh(f'{L}/build/bin/llama-quantize /content/ui-voyager-ft-f16.gguf /content/ui-voyager-ft-Q4_K_M.gguf Q4_K_M', tail=8))
final = '/content/ui-voyager-ft-Q4_K_M.gguf'
if not quant_ok:
    log('quantizing failed: falling back to Q8_0 straight from the converter (bigger file, same quality as f16 for practical purposes)')
    ok8 = sh(f'{env_py} {L}/convert_hf_to_gguf.py /content/merged --outfile /content/ui-voyager-ft-Q8_0.gguf --outtype q8_0')
    final = '/content/ui-voyager-ft-Q8_0.gguf' if ok8 else None

# %%
if final and os.path.exists(final):
    for p in (final, '/content/mmproj-ui-voyager-ft-f16.gguf'):
        shutil.copy(p, OUT_DIR + '/')
        log('copied to Drive:', os.path.basename(p), f'{os.path.getsize(p) / 1e9:.2f} GB')
    msg = 'GGUF: made (' + os.path.basename(final) + ' + mmproj-ui-voyager-ft-f16.gguf in out/)'
else:
    msg = 'GGUF: failed, read gguf-log.txt'
log(msg)
open(OUT_DIR + '/RESULT.txt', 'a').write(msg + '\n')

# %% [markdown]
# ## 3. Hand the compute back

# %%
AUTO_DISCONNECT = True
if AUTO_DISCONNECT:
    from google.colab import runtime
    runtime.unassign()
