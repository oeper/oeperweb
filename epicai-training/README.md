# Training UI-Voyager on your own phone's screens

1. **Collect** (Android app, signed in as an owner): Settings > Phone control > *Save screens to train the tap model* ON. Use phone control as normal. Each screen it reads saves up to 4 examples
   ("Click on: Search" + the screenshot + the real button's centre and box). Banking/wallet/password apps and screens with a password box are never saved. Aim for 500+ examples.
2. **Export:** same screen > *Save zip to Downloads*. Copy the zip(s) into Google Drive, folder `epicai-training` (`MyDrive/epicai-training/`).
3. **Train:** open `UI_Voyager_finetune.ipynb` in Google Colab (File > Upload notebook), Runtime > Change runtime type > **T4 GPU**, run the cells top to bottom.
   It scores the ORIGINAL model first (how often its click lands inside the real button), trains a LoRA, scores again, and only then merges + converts to GGUF.
4. **Use:** put the two `.gguf` files (model + `mmproj`) in one folder under LM Studio's models directory and load it instead of `ui-voyager`.

Files: `UI_Voyager_finetune.py` is the source (cells split by `# %%`), `make_notebook.py` turns it into the `.ipynb`. The notebook has NOT been run on a real Colab GPU yet.
The prompt format is UI-Voyager's own (github.com/ui-voyager/UI-Voyager, MIT); the app and the notebook both use it verbatim.

## The loop: Colab trains, this PC hosts (added 2026-10-20)
- `python pc_sync.py watch` (PC, Google Drive for desktop at `G:\My Drive`): copies new `epicai-training-*.zip` from Downloads into Drive and, when Colab has finished, copies the GGUF + mmproj from Drive `out/` into LM Studio (`~/.lmstudio/models/epicai/UI-Voyager-ft`, the old model is left alone, a replaced file is kept as `.previous`). `status` shows `RESULT.txt` and the end of `gguf-log.txt`; `push` / `install` do one half each.
- The only manual step left is **Run all** in the Colab notebook. Colab cannot be started by a script on the free tier, and this PC's GTX 1070 (8 GB) is too small to train the 4B vision model.
- If the GGUF step of the training notebook fails, run `UI_Voyager_make_gguf.ipynb` (no training; merges `out/lora` into the base, converts, quantizes Q4_K_M with a Q8_0 fallback). Both notebooks write their command output to `out/gguf-log.txt` in Drive, so the log can be read from the PC.
- `make_notebook.py` builds both notebooks from `UI_Voyager_finetune.py` and `make_gguf.py`.

## Free-roam training in an emulator (added 2026-10-20, owner only)
- `python explore.py` roams through apps in an Android emulator (default `Small_Phone`; this PC uses `--avd Pixel_Tablet`, which is already running with a 1080x2280 size override, so add `--no-start`). It reads each screen's accessibility tree over adb, keeps a screenshot, and saves the same "Click on: <button>" examples as the phone app (`train.jsonl` + images, box on the 0-999 grid of the screenshot's own size), then taps around to reach new screens. Writes `epicai-training-explore-<time>.zip` straight into the Drive folder (`G:\My Drive\epicai-training`) for the Colab notebook.
- Safe by construction: only the emulator, only allowed apps (no Chrome, Play Store or Google login apps), never types, skips delete/reset/call/send style buttons. Install extra login-free APKs (`adb install x.apk`) and pass them with `--apps pkg1,pkg2` for variety.
- It teaches accurate tapping, not planning. Run it for hours (`--minutes 120`), then train in Colab as before.
