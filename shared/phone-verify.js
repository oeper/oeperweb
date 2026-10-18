// Phone verification for oeper+ (Firebase phone sign-in linked to the signed-in account).
// A phone number can belong to one account only (Firebase refuses a second link), and the worker checks the `phone_number` claim in the ID token
// before oeper+ can be redeemed. The number itself is never stored by oeper.dev: it lives in Firebase Auth.
import { auth, getCurrentUser } from './account.js?v=43';
import { RecaptchaVerifier, linkWithPhoneNumber } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export const hasVerifiedPhone = () => !!(auth.currentUser && auth.currentUser.phoneNumber);

const MESSAGES = {
  'auth/invalid-phone-number': 'That number does not look right. Start with + and your country code, like +60 12 345 6789.',
  'auth/missing-phone-number': 'Enter your phone number.',
  'auth/too-many-requests': 'Too many tries. Wait a while and try again.',
  'auth/quota-exceeded': 'Too many codes were sent today. Try again later.',
  'auth/credential-already-in-use': 'That number is already used by another oeper.dev account.',
  'auth/account-exists-with-different-credential': 'That number is already used by another oeper.dev account.',
  'auth/provider-already-linked': 'Your account already has a verified phone number.',
  'auth/invalid-verification-code': 'That code is not right. Check the message and try again.',
  'auth/code-expired': 'That code expired. Send a new one.',
  'auth/captcha-check-failed': 'The robot check failed. Reload the page and try again.',
  'auth/operation-not-allowed': 'Phone verification is not switched on for oeper.dev yet.',
  'auth/billing-not-enabled': 'Phone verification is not switched on for oeper.dev yet.',
  'auth/unauthorized-domain': 'Phone verification does not work on this address.',
  'auth/network-request-failed': 'Could not reach the server. Check your connection.',
};
const explain = e => MESSAGES[e && e.code] || ('Could not verify: ' + ((e && e.message) || 'unknown error'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

let recaptcha = null;

/**
 * Opens the verification dialog. Resolves true once the account has a verified phone (token refreshed so the worker sees it), false if cancelled.
 * [reason]: one line shown at the top, e.g. why it is needed.
 */
export function verifyPhone(reason) {
  return new Promise(resolve => {
    if (!getCurrentUser() || !auth.currentUser) { resolve(false); return; }
    if (hasVerifiedPhone()) { resolve(true); return; }
    const scrim = document.createElement('div');
    scrim.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(var(--md-sys-color-background-rgb,0,0,0),.55);font-family:var(--oe-font-override,\'Google Sans\',\'Roboto Flex\',sans-serif)';
    scrim.innerHTML = `
      <style>
        .pv-box{background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);border-radius:28px;padding:24px;width:min(420px,100%);backdrop-filter:var(--oe-glass-blur,none);-webkit-backdrop-filter:var(--oe-glass-blur,none);box-shadow:0 8px 32px rgba(0,0,0,.3)}
        .pv-box h2{font-size:22px;font-weight:500;margin:0 0 6px}
        .pv-box p{font-size:14px;line-height:1.5;color:var(--md-sys-color-on-surface-variant);margin:0 0 14px}
        .pv-box input{width:100%;box-sizing:border-box;background:var(--md-sys-color-surface-variant);color:var(--md-sys-color-on-surface);border:1px solid var(--md-sys-color-outline);border-radius:14px;padding:12px 14px;font:inherit;font-size:16px;letter-spacing:.5px}
        .pv-box input:focus{outline:none;border-color:var(--md-sys-color-primary)}
        .pv-row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
        .pv-btn{border:none;border-radius:100px;padding:10px 20px;font:inherit;font-size:14px;font-weight:500;cursor:pointer;background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}
        .pv-btn.main{background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
        .pv-btn[disabled]{opacity:.5;cursor:default}
        .pv-msg{min-height:18px;font-size:13px;margin-top:10px;color:var(--md-sys-color-error)}
        .pv-msg.ok{color:var(--md-sys-color-success)}
      </style>
      <div class="pv-box" role="dialog" aria-modal="true" aria-labelledby="pvT">
        <h2 id="pvT">verify your phone number</h2>
        <p>${esc(reason || 'oeper+ is only for accounts with a verified phone number. This keeps one person from making many accounts.')} We send one text message. The number stays with Firebase Auth; oeper.dev does not keep it, and one number works for one account.</p>
        <div id="pvStep1"><input id="pvPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+60 12 345 6789"></div>
        <div id="pvStep2" hidden><input id="pvCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code"></div>
        <div class="pv-msg" id="pvMsg"></div>
        <div id="pvCaptcha"></div>
        <div class="pv-row"><button class="pv-btn" id="pvCancel">cancel</button><button class="pv-btn main" id="pvGo">send code</button></div>
      </div>`;
    document.body.appendChild(scrim);
    const $ = id => scrim.querySelector('#' + id);
    const msg = (t, ok) => { $('pvMsg').textContent = t || ''; $('pvMsg').className = 'pv-msg' + (ok ? ' ok' : ''); };
    const done = v => { scrim.remove(); resolve(v); };
    let confirmation = null;
    $('pvCancel').addEventListener('click', () => done(false));
    scrim.addEventListener('mousedown', e => { if (e.target === scrim) done(false); });
    $('pvPhone').focus();

    const send = async () => {
      const phone = $('pvPhone').value.replace(/[\s()-]/g, '');
      if (!/^\+[1-9]\d{6,14}$/.test(phone)) return msg(MESSAGES['auth/invalid-phone-number']);
      $('pvGo').disabled = true; msg('Sending…', true);
      try {
        if (!recaptcha) recaptcha = new RecaptchaVerifier(auth, $('pvCaptcha'), { size: 'invisible' });
        confirmation = await linkWithPhoneNumber(auth.currentUser, phone, recaptcha);
        $('pvStep1').hidden = true; $('pvStep2').hidden = false; $('pvGo').textContent = 'verify'; $('pvCode').focus();
        msg('Code sent. It can take a minute.', true);
      } catch (e) {
        msg(explain(e));
        try { recaptcha && recaptcha.clear(); } catch { /* already gone */ }
        recaptcha = null;
      } finally { $('pvGo').disabled = false; }
    };
    const confirmCode = async () => {
      const code = $('pvCode').value.replace(/\D/g, '');
      if (code.length !== 6) return msg('Enter the 6-digit code.');
      $('pvGo').disabled = true; msg('Checking…', true);
      try {
        await confirmation.confirm(code);
        await auth.currentUser.getIdToken(true); // the worker reads the phone from the token
        msg('Verified.', true);
        setTimeout(() => done(true), 600);
      } catch (e) { msg(explain(e)); $('pvGo').disabled = false; }
    };
    $('pvGo').addEventListener('click', () => (confirmation ? confirmCode() : send()));
    scrim.addEventListener('keydown', e => { if (e.key === 'Enter') $('pvGo').click(); if (e.key === 'Escape') done(false); });
  });
}
