// Unified "report" flow for every reportable content type on the site
// (post/comment/video/story/note/message/profile) — replaces five
// different, inconsistent reportItem()/reportProfile() implementations
// that had each grown their own positional-argument signature over time,
// and none of which sent the content preview/author info they already
// had sitting right there in scope. One shared function, one options
// object in, one Discord embed on the other end that actually shows a
// moderator something useful without needing to click through.
//
// This file is served with a long browser cache lifetime, so any content
// or behavior change needs its `?v=N` bumped on every
// `from './shared/report.js?v=N'` import across the site (grep for it).

import { getCurrentUser, SERVER_ENDPOINT, getProfile } from './account.js?v=31';
import { oeReport } from './dialog.js?v=4';

let toastStylesInjected = false;
function ensureToastStyles() {
  if (toastStylesInjected) return;
  toastStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oe-report-toast {
      position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(20px);
      background-color: #303034; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border-radius: 16px;
      padding: 14px 24px; font-family: var(--oe-font-override, 'Google Sans', 'Roboto Flex', sans-serif);
      font-size: 14px; color: #e3e2e6; opacity: 0; transition: opacity 0.25s, transform 0.25s;
      pointer-events: none; z-index: 500; max-width: min(90vw, 420px); text-align: center;
    }
    .oe-report-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  `;
  document.head.appendChild(style);
}
// A small toast built into this module rather than relying on whatever
// showToast() the calling page happens to have — every page's own version
// is already visually near-identical, so this just means the report flow
// looks the same everywhere it's used instead of depending on which page
// it was triggered from.
function showReportToast(msg) {
  ensureToastStyles();
  const el = document.createElement('div');
  el.className = 'oe-report-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

// opts:
//   type            — one of the server's known report types (post, comment,
//                      video, story, note, message, profile)
//   subject          — short human-readable description shown in the report
//                      dialog, e.g. "this post", "@handle's profile"
//   postId/commentId/itemId — whatever identifiers make sense for this type,
//                      same meaning as before
//   url              — a link back to the content, if one exists
//   contentPreview   — a text excerpt of the actual content, so a moderator
//                      sees context immediately instead of clicking through
//   contentAuthorEmail — who authored the reported content (may differ from
//                      the reporter) — omit if not known/applicable
// Returns true if a report was actually sent, false if cancelled or blocked
// before ever reaching the dialog (signed out, server not configured).
export async function reportContent(opts) {
  const user = getCurrentUser();
  if (!user) { showReportToast('sign in to report'); return false; }
  if (!SERVER_ENDPOINT) { showReportToast("reporting isn't set up yet"); return false; }

  const result = await oeReport(opts.subject);
  if (!result) return false;

  try {
    const idToken = await user.getIdToken();
    const profile = getProfile(user.email, user.displayName, user.photoURL);
    const res = await fetch(SERVER_ENDPOINT + '/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({
        type: opts.type,
        category: result.category,
        reason: result.reason,
        postId: opts.postId || null,
        commentId: opts.commentId || null,
        itemId: opts.itemId || null,
        url: opts.url || null,
        contentPreview: opts.contentPreview || null,
        contentAuthorEmail: opts.contentAuthorEmail || null,
        reporterName: profile.name,
      }),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    showReportToast('report sent — thank you');
    return true;
  } catch (err) {
    showReportToast('could not send report: ' + err.message);
    return false;
  }
}
