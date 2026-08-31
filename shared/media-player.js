// A themed custom video player: its own control bar (play/pause, a
// scrubber with a buffered-range indicator, volume, playback speed,
// fullscreen, picture-in-picture), keyboard shortcuts, auto-hiding
// controls during playback, and double-tap/click skip zones — instead
// of the browser's native <video controls>.
//
// Worth being upfront about what this does and doesn't do: nothing
// served to a browser as a plain, unauthenticated file URL can truly be
// made undownloadable — anyone who opens devtools' network tab (or just
// views the page source) can find the raw video URL regardless of what
// the player on top of it does. Real "can't download this" requires
// DRM (Widevine/FairPlay via Encrypted Media Extensions) with a license
// server, which is a different order of infrastructure entirely and not
// something a self-hosted setup like this one can reasonably run. What
// THIS does is remove the casual download paths: no native download
// button (Chrome puts one in its own control bar), no right-click "Save
// video as…", no <video controls> at all. Deterrence, not a guarantee.
//
// Whenever this file's exports/CSS change, bump the `?v=N` on every
// `from './shared/media-player.js?v=N'` import across the site (grep for it).

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SEEK_SECONDS = 5;
const SKIP_SECONDS = 10;
const VOLUME_STORAGE_KEY = 'oePlayerVolume';

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function storedVolume() {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY));
    return isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  } catch { return 1; }
}

// container: an element to render the player into (its own innerHTML is
// replaced). src: the video URL. opts: { poster, autoplay }.
// Returns { video } — the underlying <video> element, for callers that
// need direct access (e.g. to bind analytics or a "views++" listener).
export function mountVideoPlayer(container, src, opts = {}) {
  injectStyles();
  container.classList.add('oe-player');
  container.innerHTML = `
    <video class="oe-player-video" ${opts.poster ? `poster="${opts.poster}"` : ''} playsinline></video>
    <div class="oe-player-spinner"><span class="oe-loading-indicator"></span></div>
    <div class="oe-player-skip-flash oe-player-skip-flash-left"><span class="material-symbols-rounded">replay_10</span></div>
    <div class="oe-player-skip-flash oe-player-skip-flash-right"><span class="material-symbols-rounded">forward_10</span></div>
    <div class="oe-player-big-play"><span class="material-symbols-rounded">play_arrow</span></div>
    <div class="oe-player-controls">
      <div class="oe-player-progress-row" data-progress>
        <div class="oe-player-progress-track">
          <div class="oe-player-progress-buffered" data-buffered></div>
          <div class="oe-player-progress-played" data-played></div>
          <div class="oe-player-progress-thumb" data-thumb></div>
        </div>
      </div>
      <div class="oe-player-controls-row">
        <button type="button" class="oe-player-btn" data-play title="play/pause (space)"><span class="material-symbols-rounded">play_arrow</span></button>
        <button type="button" class="oe-player-btn" data-mute title="mute (m)"><span class="material-symbols-rounded">volume_up</span></button>
        <input type="range" class="oe-player-volume" data-volume min="0" max="1" step="0.01">
        <span class="oe-player-time" data-time>0:00 / 0:00</span>
        <div class="oe-player-spacer"></div>
        <button type="button" class="oe-player-btn oe-player-speed-btn" data-speed title="playback speed">1x</button>
        <button type="button" class="oe-player-btn" data-pip title="picture in picture"><span class="material-symbols-rounded">picture_in_picture_alt</span></button>
        <button type="button" class="oe-player-btn" data-fullscreen title="fullscreen (f)"><span class="material-symbols-rounded">fullscreen</span></button>
      </div>
    </div>
  `;
  container.tabIndex = 0;

  const video = container.querySelector('.oe-player-video');
  video.src = src;
  video.controlsList = 'nodownload noremoteplayback';
  video.oncontextmenu = e => e.preventDefault();
  video.volume = storedVolume();
  if (opts.autoplay) video.autoplay = true;

  const spinner = container.querySelector('.oe-player-spinner');
  const bigPlay = container.querySelector('.oe-player-big-play');
  const playBtn = container.querySelector('[data-play]');
  const muteBtn = container.querySelector('[data-mute]');
  const volumeSlider = container.querySelector('[data-volume]');
  const timeEl = container.querySelector('[data-time]');
  const speedBtn = container.querySelector('[data-speed]');
  const pipBtn = container.querySelector('[data-pip]');
  const fsBtn = container.querySelector('[data-fullscreen]');
  const progressRow = container.querySelector('[data-progress]');
  const bufferedEl = container.querySelector('[data-buffered]');
  const playedEl = container.querySelector('[data-played]');
  const thumbEl = container.querySelector('[data-thumb]');
  const flashLeft = container.querySelector('.oe-player-skip-flash-left');
  const flashRight = container.querySelector('.oe-player-skip-flash-right');

  volumeSlider.value = video.volume;
  let speedIdx = SPEEDS.indexOf(1);

  const playIcon = () => container.querySelector('[data-play] .material-symbols-rounded');
  const muteIcon = () => container.querySelector('[data-mute] .material-symbols-rounded');

  function setPlayIcon() {
    playIcon().textContent = video.paused ? 'play_arrow' : 'pause';
    bigPlay.classList.toggle('show', video.paused && !video.ended);
  }
  function setMuteIcon() {
    muteIcon().textContent = video.muted || video.volume === 0 ? 'volume_off' : (video.volume < 0.5 ? 'volume_down' : 'volume_up');
  }
  function updateProgress() {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    playedEl.style.width = pct + '%';
    thumbEl.style.left = pct + '%';
    timeEl.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    if (video.buffered.length) {
      const end = video.buffered.end(video.buffered.length - 1);
      bufferedEl.style.width = Math.min(100, (end / video.duration) * 100) + '%';
    }
  }
  function seekToClientX(clientX) {
    const rect = progressRow.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (video.duration) video.currentTime = frac * video.duration;
  }
  function flashSkip(el) {
    el.classList.remove('show');
    void el.offsetWidth; // restart the animation if it's still fading from a rapid double-tap
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 500);
  }

  // ── Play/pause ──
  const togglePlay = () => { if (video.paused) video.play().catch(() => {}); else video.pause(); };
  playBtn.addEventListener('click', togglePlay);
  video.addEventListener('play', setPlayIcon);
  video.addEventListener('pause', setPlayIcon);
  video.addEventListener('ended', setPlayIcon);

  // ── Loading state ──
  video.addEventListener('waiting', () => spinner.classList.add('show'));
  video.addEventListener('playing', () => spinner.classList.remove('show'));
  video.addEventListener('canplay', () => spinner.classList.remove('show'));

  // ── Progress ──
  video.addEventListener('timeupdate', updateProgress);
  video.addEventListener('loadedmetadata', updateProgress);
  video.addEventListener('progress', updateProgress);
  let scrubbing = false;
  progressRow.addEventListener('pointerdown', e => { scrubbing = true; seekToClientX(e.clientX); });
  window.addEventListener('pointermove', e => { if (scrubbing) seekToClientX(e.clientX); });
  window.addEventListener('pointerup', () => { scrubbing = false; });

  // ── Volume ──
  volumeSlider.addEventListener('input', () => {
    video.volume = parseFloat(volumeSlider.value);
    video.muted = false;
    setMuteIcon();
    try { localStorage.setItem(VOLUME_STORAGE_KEY, String(video.volume)); } catch {}
  });
  muteBtn.addEventListener('click', () => { video.muted = !video.muted; setMuteIcon(); });
  video.addEventListener('volumechange', setMuteIcon);

  // ── Speed ──
  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    video.playbackRate = SPEEDS[speedIdx];
    speedBtn.textContent = SPEEDS[speedIdx] + 'x';
  });

  // ── Fullscreen / PiP ──
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement === container) document.exitFullscreen();
    else container.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.querySelector('.material-symbols-rounded').textContent = document.fullscreenElement === container ? 'fullscreen_exit' : 'fullscreen';
  });
  if (!document.pictureInPictureEnabled) pipBtn.style.display = 'none';
  pipBtn.addEventListener('click', () => {
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else video.requestPictureInPicture?.().catch(() => {});
  });

  // ── Click-to-toggle / double-click-to-skip ──
  container.addEventListener('click', e => {
    if (e.target.closest('.oe-player-controls')) return;
    togglePlay();
  });
  container.addEventListener('dblclick', e => {
    if (e.target.closest('.oe-player-controls')) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const isLeft = (e.clientX - rect.left) < rect.width / 2;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + (isLeft ? -SKIP_SECONDS : SKIP_SECONDS)));
    flashSkip(isLeft ? flashLeft : flashRight);
  });

  // ── Keyboard shortcuts (only while this player has focus) ──
  container.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    switch (e.key.toLowerCase()) {
      case ' ': case 'k': e.preventDefault(); togglePlay(); break;
      case 'arrowleft': video.currentTime = Math.max(0, video.currentTime - SEEK_SECONDS); break;
      case 'arrowright': video.currentTime = Math.min(video.duration || Infinity, video.currentTime + SEEK_SECONDS); break;
      case 'arrowup': e.preventDefault(); video.volume = Math.min(1, video.volume + 0.05); volumeSlider.value = video.volume; video.muted = false; break;
      case 'arrowdown': e.preventDefault(); video.volume = Math.max(0, video.volume - 0.05); volumeSlider.value = video.volume; video.muted = false; break;
      case 'f': fsBtn.click(); break;
      case 'm': muteBtn.click(); break;
    }
  });

  // ── Auto-hide controls during playback ──
  let hideTimer = null;
  function showControls() {
    container.classList.add('show-controls');
    clearTimeout(hideTimer);
    if (!video.paused) hideTimer = setTimeout(() => container.classList.remove('show-controls'), 2500);
  }
  container.addEventListener('mousemove', showControls);
  container.addEventListener('pointerdown', showControls);
  video.addEventListener('play', showControls);
  video.addEventListener('pause', () => { container.classList.add('show-controls'); clearTimeout(hideTimer); });
  showControls();

  setPlayIcon();
  setMuteIcon();
  return { video };
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oe-player {
      position: relative; width: 100%; background: #000; border-radius: 16px; overflow: hidden;
      outline: none; -webkit-user-select: none; user-select: none;
    }
    .oe-player-video { width: 100%; height: 100%; display: block; max-height: inherit; }
    .oe-player-spinner {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity 0.15s;
    }
    .oe-player-spinner.show { opacity: 1; }
    .oe-player-big-play {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) scale(0.8);
      width: 64px; height: 64px; border-radius: 50%; background: rgba(0,0,0,0.55);
      color: #fff; display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity 0.15s, transform 0.15s;
    }
    .oe-player-big-play.show { opacity: 1; transform: translate(-50%,-50%) scale(1); }
    .oe-player-big-play .material-symbols-rounded { font-size: 34px; }
    .oe-player-skip-flash {
      position: absolute; top: 50%; transform: translateY(-50%); width: 35%; height: 60%;
      display: flex; align-items: center; justify-content: center; color: #fff;
      opacity: 0; pointer-events: none; background: radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%);
      transition: opacity 0.2s;
    }
    .oe-player-skip-flash.show { opacity: 1; }
    .oe-player-skip-flash-left { left: 0; }
    .oe-player-skip-flash-right { right: 0; }
    .oe-player-skip-flash .material-symbols-rounded { font-size: 40px; }
    .oe-player-controls {
      position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 10px 6px;
      background: linear-gradient(to top, rgba(0,0,0,0.75), transparent);
      opacity: 0; transform: translateY(6px); transition: opacity 0.2s, transform 0.2s; pointer-events: none;
    }
    .oe-player.show-controls .oe-player-controls, .oe-player:focus-within .oe-player-controls { opacity: 1; transform: translateY(0); pointer-events: auto; }
    .oe-player-progress-row { padding: 4px 2px 8px; cursor: pointer; }
    .oe-player-progress-track { position: relative; height: 4px; border-radius: 100px; background: rgba(255,255,255,0.25); }
    .oe-player-progress-buffered, .oe-player-progress-played { position: absolute; top: 0; left: 0; height: 100%; border-radius: 100px; }
    .oe-player-progress-buffered { background: rgba(255,255,255,0.35); width: 0%; }
    .oe-player-progress-played { background: var(--md-sys-color-primary, #a8c7fa); width: 0%; }
    .oe-player-progress-thumb {
      position: absolute; top: 50%; left: 0%; width: 12px; height: 12px; border-radius: 50%;
      background: var(--md-sys-color-primary, #a8c7fa); transform: translate(-50%,-50%);
    }
    .oe-player-controls-row { display: flex; align-items: center; gap: 4px; }
    .oe-player-btn {
      width: 32px; height: 32px; border-radius: 50%; border: none; background: none; color: #fff;
      display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
    }
    .oe-player-btn:hover { background: rgba(255,255,255,0.15); }
    .oe-player-speed-btn { width: auto; padding: 0 8px; font-size: 12px; font-weight: 500; font-family: inherit; }
    .oe-player-volume { width: 60px; accent-color: var(--md-sys-color-primary, #a8c7fa); }
    .oe-player-time { font-size: 12px; color: #fff; white-space: nowrap; margin-left: 4px; font-variant-numeric: tabular-nums; }
    .oe-player-spacer { flex: 1; }
    @media (max-width: 480px) { .oe-player-volume { display: none; } }
  `;
  document.head.appendChild(style);
}
