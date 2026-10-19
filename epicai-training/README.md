# Training UI-Voyager on your own phone's screens

1. **Collect** (Android app, signed in as an owner): Settings > Phone control > *Save screens to train the tap model* ON. Use phone control as normal. Each screen it reads saves up to 4 examples
   ("Click on: Search" + the screenshot + the real button's centre and box). Banking/wallet/password apps and screens with a password box are never saved. Aim for 500+ examples.
2. **Export:** same screen > *Save zip to Downloads*. Copy the zip(s) into Google Drive, folder `epicai-training` (`MyDrive/epicai-training/`).
3. **Train:** open `UI_Voyager_finetune.ipynb` in Google Colab (File > Upload notebook), Runtime > Change runtime type > **T4 GPU**, run the cells top to bottom.
   It scores the ORIGINAL model first (how often its click lands inside the real button), trains a LoRA, scores again, and only then merges + converts to GGUF.
4. **Use:** put the two `.gguf` files (model + `mmproj`) in one folder under LM Studio's models directory and load it instead of `ui-voyager`.

Files: `UI_Voyager_finetune.py` is the source (cells split by `# %%`), `make_notebook.py` turns it into the `.ipynb`. The notebook has NOT been run on a real Colab GPU yet.
The prompt format is UI-Voyager's own (github.com/ui-voyager/UI-Voyager, MIT); the app and the notebook both use it verbatim.
