# No speaker (desktop)

Electron app (Windows + macOS) with the whole show from [os6/nospeaker](https://github.com/os6/nospeaker) (MIT, a90.com):
a voice made of two tones, a sweep, a melody, a beat with a rap, a touch instrument and "say anything".

Windows PCs have no haptic trackpad motor to drive (the original does that on a MacBook), so the sound plays through the speakers.

- Run: `cd desktop/nospeaker && npm i && npx electron .`
- Build: `npx electron-builder` (or the "No speaker desktop" workflow, which publishes to the release `nospeaker-desktop-latest`).
- `app/synth.js` is pure (text -> sound, no DOM) and `app/index.html` holds the show, visuals and controls.
- Add oddly pronounced words to `DICT` in `app/synth.js`.
