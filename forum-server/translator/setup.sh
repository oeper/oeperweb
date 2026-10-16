#!/bin/sh
# Installs the oneLang translator next to this file (Linux with glibc: Debian/Ubuntu, also inside proot, or macOS). Needs python3 (3.9+), pip, curl.
# Downloads about 650 MB of model once.   Usage:  sh setup.sh   then   sh run.sh
set -e
cd "$(dirname "$0")"
python3 -m venv venv
./venv/bin/pip install --upgrade pip >/dev/null
./venv/bin/pip install -r requirements.txt
mkdir -p model
BASE="https://huggingface.co/JustFrederik/nllb-200-distilled-600M-ct2-int8/resolve/main"
for f in config.json sentencepiece.bpe.model shared_vocabulary.txt model.bin; do
  if [ ! -s "model/$f" ]; then echo "downloading $f"; curl -L --fail -C - -o "model/$f" "$BASE/$f"; fi
done
echo "done. Start it with: sh run.sh"
