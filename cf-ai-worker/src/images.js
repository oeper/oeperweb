// Picture making for epic AI (the generate_image tool) and the One suite (POST /api/image). Both go through makeImage(), so the daily limits are shared.
//
// Two models, picked to keep the neuron allowance alive:
//   standard  @cf/black-forest-labs/flux-2-klein-4b   Workers AI. Distilled, fast, good. Priced per 512x512 output tile (26.05 neurons), so a 1024x1024 picture is
//                                                      ~104 neurons (~$0.001). Everyone gets it. Always at most 1 megapixel, one picture per call.
//   best      google/nano-banana-2.1                   Third party, billed to the Cloudflare account in dollars (output image tokens, ~3 to 4 cents a picture),
//                                                      never in neurons. oeper+ only, a few a day (see ledger.js images.plusPremium / premiumGlobal). If the call
//                                                      fails (no unified-billing credit, outage...) the picture is simply made with the standard model instead.
// Every size is charged as 4 tiles, whatever the shape, because Cloudflare does not say how it rounds a 1024x576 picture. The ledger reserves the
// neurons before the model runs and gives them back if it fails (ledger.js imageReserve / imageRelease).

const STANDARD = '@cf/black-forest-labs/flux-2-klein-4b';
const BEST = 'google/nano-banana-2.1';
// Switched off 2026-10-19: Nano Banana needs paid AI Gateway credits the account does not have, so every picture is made by the standard (free) model.
// Flip to true (and add credits) to bring the "best quality" option back.
const BEST_ENABLED = false;
const STANDARD_NEURONS = 104.2; // 4 output tiles x 26.05
const MAX_BYTES = 6 * 1024 * 1024;

// width/height are multiples of 16 (what FLUX wants); ar is Nano Banana's name for the same shape
export const SHAPES = {
  square: { w: 1024, h: 1024, ar: '1:1' },
  wide: { w: 1024, h: 576, ar: '16:9' },
  tall: { w: 576, h: 1024, ar: '9:16' },
  landscape: { w: 1024, h: 768, ar: '4:3' },
  portrait: { w: 768, h: 1024, ar: '3:4' },
};

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' took too long')), ms))]);
function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function mimeOf(b64) {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

async function runStandard(env, prompt, shape) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', String(shape.w));
  form.append('height', String(shape.h));
  const packed = new Response(form);
  const out = await withTimeout(env.AI.run(STANDARD, { multipart: { body: packed.body, contentType: packed.headers.get('content-type') } }), 100000, 'the picture model');
  const b64 = out && (out.image || (out.result && out.result.image));
  if (typeof b64 !== 'string' || b64.length < 100) throw new Error('the picture model returned nothing');
  return { data: b64, mime: mimeOf(b64) };
}

async function runBest(env, prompt, shape) {
  const out = await withTimeout(env.AI.run(BEST, { prompt, aspect_ratio: shape.ar, output_format: 'jpg', resolution: '1K' }), 110000, 'the best-quality model');
  const img = out && (out.image || (out.result && out.result.image));
  if (typeof img !== 'string' || !img) throw new Error('the best-quality model returned nothing');
  if (/^https:\/\//.test(img)) {
    const res = await fetch(img, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error('could not fetch the finished picture (' + res.status + ')');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('the picture is too big');
    const b64 = toBase64(buf);
    return { data: b64, mime: (res.headers.get('content-type') || '').startsWith('image/') ? res.headers.get('content-type').split(';')[0] : mimeOf(b64) };
  }
  const b64 = img.replace(/^data:image\/[a-z]+;base64,/, '');
  return { data: b64, mime: mimeOf(b64) };
}

export function imageLimitMessage(r) {
  const when = 'It resets at midnight UTC.';
  if (r.reason === 'signin') return 'Sign in to make pictures.';
  if (r.reason === 'limit') return r.plan === 'plus'
    ? `You've made today's ${r.limit} pictures. ${when}`
    : `You've made today's ${r.limit} free pictures. oeper+ members get more every day. ${when}`;
  if (r.reason === 'busy') return `Picture making is resting: everyone together has used today's share. Try again after midnight UTC.`;
  if (r.reason === 'refused') return r.error || "I can't make that picture.";
  return 'Could not make the picture.';
}

/**
 * Makes one picture for [who] ({email, owner}). ledger = the Ledger stub; guard(prompt) = safety check returning {flagged}.
 * Returns {ok:true, mime, data, w, h, best, wantedBest, used, limit, bestUsed, bestLimit, prompt} or {ok:false, reason, error, ...}.
 */
export async function makeImage(env, ledger, who, args, guard) {
  const prompt = String((args && args.prompt) || '').replace(/\s+/g, ' ').trim().slice(0, 900);
  if (prompt.length < 3) return { ok: false, reason: 'prompt', error: 'Describe the picture first.' };
  if (!who || !who.email) return { ok: false, reason: 'signin', error: imageLimitMessage({ reason: 'signin' }) };
  const shape = SHAPES[args && args.shape] || SHAPES.square;
  try {
    const g = guard ? await guard(prompt) : null;
    if (g && g.flagged) return { ok: false, reason: 'refused', error: "That isn't something I can make a picture of." };
  } catch (err) { console.log('picture prompt check failed, continuing:', err && err.message); }

  let r = await ledger.imageReserve(who.email, BEST_ENABLED && !!(args && args.best), !!who.owner, STANDARD_NEURONS);
  if (!r.ok) return { ...r, error: imageLimitMessage(r) };
  let made = null;
  if (r.best) {
    try { made = await runBest(env, prompt, shape); }
    catch (err) {
      console.log('best picture failed, using the standard model:', err && err.message);
      await ledger.imageRelease(who.email, r);
      r = await ledger.imageReserve(who.email, false, !!who.owner, STANDARD_NEURONS);
      if (!r.ok) return { ...r, error: imageLimitMessage(r) };
    }
  }
  if (!made) {
    try { made = await runStandard(env, prompt, shape); }
    catch (err) {
      console.log('picture failed:', err && err.message);
      await ledger.imageRelease(who.email, r);
      return { ok: false, reason: 'failed', error: 'The picture could not be made right now. Nothing was counted, try again in a moment.' };
    }
  }
  return { ok: true, mime: made.mime, data: made.data, w: shape.w, h: shape.h, best: !!r.best, wantedBest: !!(args && args.best), plan: r.plan, used: r.used, limit: r.limit, bestUsed: r.bestUsed, bestLimit: r.bestLimit, prompt };
}
