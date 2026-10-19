# %% [markdown]
# # Fine-tune UI-Voyager to aim taps on YOUR phone (LoRA, Colab free T4)
#
# **What this does:** trains a small LoRA on top of `MarsXL/UI-Voyager` (Qwen3-VL-4B, MIT) with the "tap this" examples that epic AI saved on your phone
# (Settings > Phone control > *Save screens to train the tap model* > *Save zip to Downloads*).
# Each example is a screenshot, a request like `Click on: Search`, and the answer in UI-Voyager's own format (a click at the real button's centre).
#
# **Steps:** 1. put the zip(s) in Google Drive, folder `epicai-training` -> 2. Runtime > Change runtime type > **T4 GPU** -> 3. run the cells from the top.
# The first scoring cell tells you how often the ORIGINAL model already clicks inside the right button. If that is already ~90%+, training will not help much.
#
# Honest limits: this notebook was written without being run on a Colab GPU. If a cell fails, send me the error text.

# %%
from google.colab import drive
drive.mount('/content/drive')

DRIVE_DIR = '/content/drive/MyDrive/epicai-training'    # put epicai-training-*.zip files here
OUT_DIR = '/content/drive/MyDrive/epicai-training/out'  # the LoRA and the merged model are saved here
BASE = 'MarsXL/UI-Voyager'
MAX_TRAIN = 3000     # examples used for training at most
EPOCHS = 2
import os, glob
os.makedirs(OUT_DIR, exist_ok=True)
print(glob.glob(DRIVE_DIR + '/*.zip'))

# %%
!pip -q install -U "transformers>=4.57" peft accelerate bitsandbytes datasets pillow
import transformers, torch
print(transformers.__version__, torch.cuda.get_device_name(0))

# %% [markdown]
# ## 1. Load the examples
# Every zip is unpacked on its own; images are named by timestamp so they never collide.

# %%
import json, random, zipfile, shutil
from PIL import Image

DATA = '/content/data'
shutil.rmtree(DATA, ignore_errors=True)
rows = []
for z in sorted(glob.glob(DRIVE_DIR + '/*.zip')):
    d = os.path.join(DATA, os.path.splitext(os.path.basename(z))[0])
    zipfile.ZipFile(z).extractall(d)
    for line in open(os.path.join(d, 'train.jsonl'), encoding='utf-8'):
        r = json.loads(line)
        r['image_path'] = os.path.join(d, r['images'][0])
        rows.append(r)
random.seed(1)
random.shuffle(rows)
print(len(rows), 'examples')
n_eval = max(20, len(rows) // 20)
eval_rows, train_rows = rows[:n_eval], rows[n_eval:][:MAX_TRAIN]
print('train', len(train_rows), 'eval', len(eval_rows))

# %%
# Sanity check: the red dot must sit on the named button.
from PIL import ImageDraw
import re
def centre(r):
    m = re.search(r'"coordinate": \[(\d+), (\d+)\]', r['messages'][1]['content'])
    return int(m.group(1)), int(m.group(2))
for r in train_rows[:3]:
    im = Image.open(r['image_path']).convert('RGB'); w, h = im.size
    x, y = centre(r)
    ImageDraw.Draw(im).ellipse([x / 999 * w - 12, y / 999 * h - 12, x / 999 * w + 12, y / 999 * h + 12], outline='red', width=5)
    print(r['messages'][0]['content'].split('The user query: ')[1].split('\n')[0])
    display(im.resize((w // 3, h // 3)))

# %% [markdown]
# ## 2. The model and UI-Voyager's own system prompt

# %%
import torch
from transformers import AutoProcessor, Qwen3VLForConditionalGeneration, BitsAndBytesConfig

SYSTEM = r"""# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name": "mobile_use", "description": "Use a touchscreen to interact with a mobile device, and take screenshots.\\n* This is an interface to a mobile device with touchscreen. You can perform actions like clicking, typing, swiping, etc.\\n* Some applications may take time to start or process actions, so you may need to wait and take successive screenshots to see the results of your actions.\\n* The screen's resolution is 999x999.\\n* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don't click boxes on their edges unless asked.", "parameters": {"properties": {"action": {"description": "The action to perform. The available actions are:\\n* `click`: Click the point on the screen with coordinate (x, y).\\n* `long_press`: Press the point on the screen with coordinate (x, y) for specified seconds.\\n* `swipe`: Swipe from the starting point with coordinate (x, y) to the end point with coordinates2 (x2, y2).\\n* `type`: Input the specified text into the activated input box.\\n* `answer`: Output the answer.\\n* `system_button`: Press the system button.\\n* `wait`: Wait specified seconds for the change to happen.\\n* `terminate`: Terminate the current task and report its completion status.", "enum": ["click", "long_press", "swipe", "type", "answer", "system_button", "wait", "terminate"], "type": "string"}, "coordinate": {"description": "(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates to move the mouse to. Required only by `action=click`, `action=long_press`, and `action=swipe`.", "type": "array"}, "coordinate2": {"description": "(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates to move the mouse to. Required only by `action=swipe`.", "type": "array"}, "text": {"description": "Required only by `action=type` and `action=answer`.", "type": "string"}, "time": {"description": "The seconds to wait. Required only by `action=long_press` and `action=wait`.", "type": "number"}, "button": {"description": "Back means returning to the previous interface, Home means returning to the desktop, Menu means opening the application background menu, and Enter means pressing the enter. Required only by `action=system_button`", "enum": ["Back", "Home", "Menu", "Enter"], "type": "string"}, "status": {"description": "The status of the task. Required only by `action=terminate`.", "type": "string", "enum": ["success", "failure"]}}, "required": ["action"], "type": "object"}}}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call>

# Response format

Response format for every step:
1) Thought: one concise sentence explaining the next move (no multi-step reasoning).
2) Action: a short imperative describing what to do in the UI.
3) A single <tool_call>...</tool_call> block containing only the JSON: {"name": <function-name>, "arguments": <args-json-object>}.

Rules:
- Output exactly in the order: Thought, Action, <tool_call>.
- Be brief: one sentence for Thought, one for Action.
- Do not output anything else outside those three parts.
- If finishing, use action=terminate in the tool call.
- If the user query is to find an answer to a specific question and you have determined, provided or confirmed the answer, use action=terminate and status=success in the tool call to end the task."""

processor = AutoProcessor.from_pretrained(BASE)
model = Qwen3VLForConditionalGeneration.from_pretrained(
    BASE, torch_dtype=torch.float16, device_map='auto',
    quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=torch.float16, bnb_4bit_use_double_quant=True))
print(torch.cuda.memory_allocated() / 1e9, 'GB')

def load_image(path):
    im = Image.open(path).convert('RGB')
    s = 1000 / max(im.size)          # about 450 image tokens for a phone screen
    return im.resize((int(im.width * s), int(im.height * s))) if s < 1 else im

def build(r, with_answer):
    msgs = [{'role': 'system', 'content': [{'type': 'text', 'text': SYSTEM}]},
            {'role': 'user', 'content': [{'type': 'image'}, {'type': 'text', 'text': r['messages'][0]['content']}]}]
    if with_answer:
        msgs.append({'role': 'assistant', 'content': [{'type': 'text', 'text': r['messages'][1]['content']}]})
    return processor.apply_chat_template(msgs, tokenize=False, add_generation_prompt=not with_answer)

# %% [markdown]
# ## 3. Score the ORIGINAL model first
# "Hit" = the click it asks for lands inside the real button. Run this before training and again after.

# %%
@torch.no_grad()
def score(rows_, n=60):
    model.eval()
    hits = fmt_bad = 0
    rows_ = rows_[:n]
    for r in rows_:
        inp = processor(text=[build(r, False)], images=[load_image(r['image_path'])], return_tensors='pt').to(model.device)
        out = model.generate(**inp, max_new_tokens=160, do_sample=False)
        text = processor.batch_decode(out[:, inp['input_ids'].shape[1]:], skip_special_tokens=True)[0]
        m = re.search(r'"coordinate":\s*\[\s*(\d+)[^\d]+(\d+)', text)
        if not m:
            fmt_bad += 1
            continue
        x, y = int(m.group(1)), int(m.group(2)); l, t, rr, b = r['box']
        hits += int(l <= x <= rr and t <= y <= b)
    print(f'hit rate {hits}/{len(rows_)} = {100 * hits / len(rows_):.0f}%   (unreadable answers: {fmt_bad})')
    return hits / len(rows_)

before = score(eval_rows)

# %% [markdown]
# ## 4. Train the LoRA (language model only, the vision part stays frozen)

# %%
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import Trainer, TrainingArguments

model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
model = get_peft_model(model, LoraConfig(
    r=16, lora_alpha=32, lora_dropout=0.05, task_type='CAUSAL_LM',
    target_modules=r'.*language_model.*\.(q_proj|k_proj|v_proj|o_proj|gate_proj|up_proj|down_proj)'))
model.print_trainable_parameters()

class Ds(torch.utils.data.Dataset):
    def __init__(self, rows_): self.rows = rows_
    def __len__(self): return len(self.rows)
    def __getitem__(self, i): return self.rows[i]

def collate(batch):            # batch size is 1: gradient accumulation does the rest
    r = batch[0]
    img = load_image(r['image_path'])
    full = processor(text=[build(r, True)], images=[img], return_tensors='pt')
    prompt = processor(text=[build(r, False)], images=[img], return_tensors='pt')
    labels = full['input_ids'].clone()
    labels[:, :prompt['input_ids'].shape[1]] = -100      # only the answer is trained on
    full['labels'] = labels
    return full

args = TrainingArguments(
    output_dir='/content/run', per_device_train_batch_size=1, gradient_accumulation_steps=8,
    num_train_epochs=EPOCHS, learning_rate=1e-4, lr_scheduler_type='cosine', warmup_ratio=0.05,
    fp16=True, logging_steps=10, save_strategy='no', report_to='none', remove_unused_columns=False,
    gradient_checkpointing=True, optim='paged_adamw_8bit')
Trainer(model=model, args=args, train_dataset=Ds(train_rows), data_collator=collate).train()
model.save_pretrained(OUT_DIR + '/lora')
print('LoRA saved to', OUT_DIR + '/lora')

# %%
after = score(eval_rows)
print(f'before {100 * before:.0f}%  ->  after {100 * after:.0f}%')

# %% [markdown]
# ## 5. Merge into a normal model, then make a GGUF for LM Studio
# Only worth doing if "after" is clearly better than "before". The conversion is the least tested part: if it fails, send me the error.

# %%
import gc
del model; gc.collect(); torch.cuda.empty_cache()
from peft import PeftModel
base16 = Qwen3VLForConditionalGeneration.from_pretrained(BASE, torch_dtype=torch.float16, device_map='cpu')
merged = PeftModel.from_pretrained(base16, OUT_DIR + '/lora').merge_and_unload()
merged.save_pretrained('/content/merged', safe_serialization=True)
processor.save_pretrained('/content/merged')
print('merged')

# %%
!git clone -q --depth 1 https://github.com/ggml-org/llama.cpp /content/llama.cpp
!pip -q install -r /content/llama.cpp/requirements/requirements-convert_hf_to_gguf.txt
!python /content/llama.cpp/convert_hf_to_gguf.py /content/merged --outfile /content/ui-voyager-ft-f16.gguf --outtype f16
!python /content/llama.cpp/convert_hf_to_gguf.py /content/merged --outfile /content/mmproj-ui-voyager-ft-f16.gguf --outtype f16 --mmproj

# %%
!cmake -S /content/llama.cpp -B /content/llama.cpp/build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF > /dev/null
!cmake --build /content/llama.cpp/build --target llama-quantize -j 4 > /dev/null
!/content/llama.cpp/build/bin/llama-quantize /content/ui-voyager-ft-f16.gguf /content/ui-voyager-ft-Q4_K_M.gguf Q4_K_M
!cp /content/ui-voyager-ft-Q4_K_M.gguf /content/mmproj-ui-voyager-ft-f16.gguf "{OUT_DIR}/"
!ls -la "{OUT_DIR}"
print('Download both .gguf files from Drive and put them in one folder under LM Studio\'s models directory.')
