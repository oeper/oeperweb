#!/usr/bin/env python
"""PC side of the training loop: Colab trains, this PC hosts the result.

  python pc_sync.py status     what Colab last produced (RESULT.txt, gguf-log.txt tail)
  python pc_sync.py push       copy new epicai-training-*.zip files from Downloads into Google Drive (Drive for desktop syncs them up for Colab)
  python pc_sync.py install    copy the finished GGUF + mmproj from Drive into LM Studio's models folder (only when they changed)
  python pc_sync.py watch      push + install every minute, so the only manual step left is pressing Run all in Colab

Plain standard library, any Python 3.8+. Nothing is ever deleted; an installed model is only replaced by a newer one, and the previous one is kept as '.previous'.
"""
import os, shutil, sys, time, glob

HOME = os.path.expanduser('~')
DRIVE = next((p for p in (r'G:\My Drive', r'G:\Mein Drive', os.path.join(HOME, 'Google Drive', 'My Drive')) if os.path.isdir(p)), None)
TRAIN = os.path.join(DRIVE, 'epicai-training') if DRIVE else None
OUT = os.path.join(TRAIN, 'out') if TRAIN else None
DOWNLOADS = os.path.join(HOME, 'Downloads')
LM = os.path.join(HOME, '.lmstudio', 'models', 'epicai', 'UI-Voyager-ft')    # LM Studio lists it as epicai/UI-Voyager-ft
MODEL_GLOBS = ['ui-voyager-ft-Q4_K_M.gguf', 'ui-voyager-ft-Q8_0.gguf']
MMPROJ = 'mmproj-ui-voyager-ft-f16.gguf'


def need_drive():
    if not DRIVE:
        sys.exit('Google Drive for desktop was not found (looked for G:\\My Drive). Install it or edit DRIVE at the top of this file.')


def status():
    need_drive()
    r = os.path.join(OUT, 'RESULT.txt')
    print(open(r, encoding='utf-8').read() if os.path.exists(r) else 'No RESULT.txt yet: training has not finished in Colab.')
    log = os.path.join(OUT, 'gguf-log.txt')
    if os.path.exists(log):
        print('--- end of gguf-log.txt ---')
        print(''.join(open(log, encoding='utf-8', errors='replace').readlines()[-25:]))


def push():
    need_drive()
    os.makedirs(TRAIN, exist_ok=True)
    n = 0
    for z in sorted(glob.glob(os.path.join(DOWNLOADS, 'epicai-training-*.zip'))):
        dst = os.path.join(TRAIN, os.path.basename(z))
        if os.path.exists(dst) and os.path.getsize(dst) == os.path.getsize(z):
            continue
        shutil.copy2(z, dst)
        print('copied to Drive:', os.path.basename(z))
        n += 1
    print(f'push: {n} new file(s)')
    return n


def install():
    need_drive()
    model = next((os.path.join(OUT, g) for g in MODEL_GLOBS if os.path.exists(os.path.join(OUT, g))), None)
    mm = os.path.join(OUT, MMPROJ)
    if not model or not os.path.exists(mm):
        print('install: no finished GGUF in Drive yet')
        return False
    os.makedirs(LM, exist_ok=True)
    done = False
    for src in (model, mm):
        dst = os.path.join(LM, os.path.basename(src))
        if os.path.exists(dst) and os.path.getsize(dst) == os.path.getsize(src) and os.path.getmtime(dst) >= os.path.getmtime(src):
            continue
        if os.path.exists(dst):
            shutil.copy2(dst, dst + '.previous')
        shutil.copy2(src, dst + '.tmp')
        os.replace(dst + '.tmp', dst)
        print('installed:', dst)
        done = True
    if done:
        print('In LM Studio: My Models > epicai/UI-Voyager-ft. Load it instead of ui-voyager (the old model is untouched).')
    else:
        print('install: already up to date')
    return done


def watch():
    print('watching (Ctrl+C to stop). Press Run all in the Colab notebook when new examples are in Drive.')
    while True:
        try:
            push(); install()
        except Exception as e:
            print('error:', e)
        time.sleep(60)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    {'status': status, 'push': push, 'install': install, 'watch': watch}.get(cmd, lambda: print(__doc__))()
