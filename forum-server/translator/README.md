# oneLang translator

NLLB-200 (distilled, 600M parameters, int8) on CTranslate2: a free, unlimited translator for oneLang (oeper.dev/one) that runs on your own machine.
About 650 MB on disk, about 1.5 GB of RAM while running, 200 languages (124 of them are in oneLang's list).

```
sh setup.sh     # once: python venv, packages, model download
sh run.sh       # listens on 127.0.0.1:8790
```

`server.py` has no sign-in and listens on localhost only. `../translate-proxy.js` (mounted by upload-server.js) is the public door: `GET /translate/health`
and `POST /translate/api` (Firebase sign-in, daily character limit per person, owners unlimited). Environment variables:

| variable | default | meaning |
|---|---|---|
| `TRANSLATOR_URL` (forum-server) | `http://127.0.0.1:8790` | where the proxy finds it |
| `TRANSLATE_DAILY_CHARS` (forum-server) | 1000000 | characters per person per day |
| `TRANSLATOR_PORT`, `TRANSLATOR_HOST` | 8790, 127.0.0.1 | |
| `TRANSLATOR_THREADS` | all cores | CPU threads |
| `TRANSLATOR_BEAM` | 2 | beam size: 1 faster, 4 a little better |
| `TRANSLATOR_MODEL` | `./model` | model folder |

Speed: about 480 characters a second on a 16-thread PC (a 600,000 character textbook in roughly 20 minutes). A tablet is several times slower.
Quality is clearly below DeepL, Google or epic AI for hard text, but it never skips or invents sentences, and it has no token allowance.
oneLang falls back to epic AI by itself when this is offline or the language isn't covered (Dhivehi, Dogri, Konkani, Hawaiian, Hmong, Krio, Latin, Corsican...).
