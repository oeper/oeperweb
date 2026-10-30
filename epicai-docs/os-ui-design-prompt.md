# Prompt: design and build an OS shell in the oeper.dev / epic AI visual style

Copy everything below the line into a new session.

---

You are going to design and build the user interface of an operating system's desktop shell (and its mobile/tablet variants) so that it looks and feels exactly like the oeper.dev ecosystem: the oeper.dev website, the epic AI apps (Android, desktop, web), the One office suite, Epicenter (the app store) and the Searver server app. These all share one design language, described below. Reproduce it faithfully, and extend it to OS concepts (launcher, windows, task switcher, notification shade, quick settings, lock screen, settings app, file manager, app store, assistant) without inventing a different look.

Ask me before you start only if something below contradicts itself; otherwise decide, build, and show me.

## 1. Character of the design

- **Material 3 at heart, calm and rounded.** Large radii, soft surfaces, no hard borders, no heavy shadows, no gradients except the soft glass backgrounds and the epic AI app icon.
- **Everything is themed through CSS-style semantic tokens**, never hard-coded colours. Any component must work in every theme, light or dark, flat or glass.
- **Everything moves, gently.** Nothing just pops into existence (see section 6). Motion is fast (150 to 420 ms), uses one easing curve, and only animates opacity and transform for movement.
- **Quiet typography.** One family (Google Sans), lowercase UI labels ("search oeper.dev…", "make private", "my apps"), sentence case for titles, no all-caps shouting.
- **AI is a first-class citizen, not a button hidden in a menu.** The assistant is reachable from anywhere (floating pill, keyboard shortcut, system gesture), sees the current screen only when asked, and can operate the UI on the user's behalf with visible, interruptible actions.

## 2. Design tokens (the whole system)

Use these exact semantic names for every theme (they are what the existing code uses):

```
--md-sys-color-background            page / desktop base colour
--md-sys-color-background-rgb        same colour as "r, g, b" (for rgba() frosted bars)
--md-sys-color-surface               cards, sheets, windows, menus
--md-sys-color-surface-variant       secondary surfaces: thumbnails, avatars, input fills, track backgrounds
--md-sys-color-primary               accent (buttons, links, selection, switches on)
--md-sys-color-on-primary            text/icon on the accent
--md-sys-color-secondary-container   selected nav item, active chip, tonal buttons
--md-sys-color-on-secondary-container
--md-sys-color-on-surface            main text
--md-sys-color-on-surface-variant    muted text, secondary icons
--md-sys-color-outline               borders that must be visible
--md-sys-color-outline-rgb           same as triplet
--md-sys-color-outline-variant       dividers
--md-sys-color-error / --md-sys-color-success
--md-sys-state-hover                 translucent hover overlay (theme aware)
--md-sys-color-hover-surface         solid/translucent hover background for rows and cards
--oe-glass-blur                      e.g. "blur(10px) saturate(1.15)" in glass themes, "none" otherwise
```

Rule: hover and pressed states always use `--md-sys-state-hover` / `--md-sys-color-hover-surface`, never a hard-coded white/black overlay (it inverts on light themes).

### Default themes (give the OS at least these; the website ships ~28)

| theme | background | surface | primary | on-surface | notes |
|---|---|---|---|---|---|
| **dark** (default) | `#111318` | `#1a1c22` | `#a8c7fa` | `#e2e2e6` | variant `#2f353d`, outline `#43474e`, hover surface `#21242c`, secondary container `#33485d`, muted text `#c4c7c5`, error `#ffb4ab`, success `#a6d9a8` |
| **light** | `#f9f9fc` | `#ffffff` | `#3a5a9b` | `#1a1c1e` | variant `#e3e6ee`, outline `#74777f`, hover surface `#eceef2`, secondary container `#d7e3f8`, muted `#44474e`, error `#ba1a1a`, success `#2e7d32` |
| **dark glass** | `#161616` | `rgba(38,38,38,0.55)` | `#f0f0f0` | `#f0f0f0` | variant `rgba(50,50,50,0.4)`, outline `rgba(255,255,255,0.14)`, hover `rgba(255,255,255,0.08)`, muted `#b5b5b5`, blur `blur(10px) saturate(1.15)`; background image = three soft radial highlights (white 9% at 15% 20%, white 5% at 85% 15%, black 30% at 50% 90%) |
| **light glass** | `#f2f2f2` | `rgba(255,255,255,0.55)` | `#1c1f26` | `#1c1f26` | outline `rgba(28,28,28,0.18)`, muted `#5f5f5f`, same blurred-blob background with white highlights |

Others to include as accent variants (each is just a different token set over the same components): violet, ocean, sepia, sunset, amber, tundra, red, sage, pistachio, cherry, boreal, coastline, copper, grayscale, dune. The user picks a theme in Settings; the choice is applied before first paint (no flash) and synced across devices. Glass themes make every surface translucent and apply `backdrop-filter: var(--oe-glass-blur)`.

### Shape, spacing, type

- **Font:** Google Sans (400/500/600/700), fallback Roboto Flex / system sans. Icons: Material Symbols Rounded.
- **Radii:** cards and list rows 20px; sheets/menus/popovers 14 to 16px; inner items 9 to 12px; inputs and search pills 20px (fully pill-shaped on mobile); buttons are pills; avatars and round icon buttons 50%; small tiles/thumbnails 12px; chips 999px.
- **Spacing:** 4/8/12/16/24 scale. Cards: padding 14 to 18px, gap 12px between rows, 16px gutters on phone.
- **Sizes:** body 14 to 15px, secondary 13px, meta 11 to 12px, page titles 22px/500. Top bar height about 64px.
- **Shadows:** only on floating layers (menus, popovers, FABs): `0 8px 24px rgba(0,0,0,0.4)`. Flat surfaces have none.
- **Selection / focus:** no blue browser outlines on buttons and links; inputs show a calm border/tint change; keyboard focus uses a soft ring only where unavoidable.

## 3. Global layout patterns

- **Top bar (frosted):** left logo + page title; centre a search pill (placeholder "search oeper.dev…  ( / )", opens a dropdown with recent searches, quick links, arrow-key navigation, "did you mean", "see all results"); right: create "+" button (opens a drawer), notifications bell with a small red count badge and a dropdown list (36px avatars, unread dot in primary), and a round profile button that opens a profile menu. Background is `rgba(var(--md-sys-color-background-rgb), 0.8)` with blur. Shortcuts: `/` or Ctrl/Cmd+K focuses search.
- **Mobile:** the top bar shrinks, search becomes an icon, and a **bottom nav bar** takes over (5 destinations, selected item in a secondary-container pill).
- **Pages are stacks of rounded cards** on the background colour; lists are cards with a 52px thumbnail/icon box on the left, name + muted meta in the middle, and a "more" (three dots) button on the right that opens a small popover menu (icons + lowercase labels, dangerous items in the error colour). The row with an open menu must rise above its neighbours.
- **Footer:** quiet row of small links (docs, privacy, terms…).
- **Floating epic AI pill:** bottom-right pill labelled "epic AI" with the face logo; opens a small card (question box, "include this page / selected text" checkbox, ask / open epic AI). Never on full-screen content (video, games, chat).
- **Dialogs/sheets:** surface colour, 20px radius, 24px padding, dim backdrop (`rgba(0,0,0,0.6)`), open with a scale/fade; bottom sheets on mobile.
- **Toasts:** small pill at the bottom, fade up, auto-dismiss.
- **Tags:** tiny rounded labels next to meta text, e.g. `private` (lock icon) and `public link`; badges like the gold "+" after a member's name (paid plan).

## 4. The brand mark (epic AI)

The logo is a **face**, never a sparkle: SVG viewBox `0 0 381 486`: two rounded vertical bars (80 wide, 300 tall, at x=2 and x=297, fully rounded ends) as eyes, plus a stroked smile `M40 421C140 454.333 240 454.333 340 421` (stroke width 80, round caps). It uses `currentColor`. The app icon is that face on a vertical gradient from `#DCDCDC` to `#767676`. Use the mark for the assistant everywhere in the OS: launcher button, floating pill, notifications, lock-screen widget, voice listening state.

## 5. The AI chat surface (use this as the OS assistant UI)

- Empty state: a big friendly greeting, then suggestion chips that rise in one after another.
- Messages: flat answers (no bubble) for the assistant, tinted pill bubble for the user; actions under each answer (thumbs up/down, share, copy, read aloud, try again, save as document).
- Composer: a pill at the bottom with attach, mic, send; grows with text.
- Streaming: the answer appears as it is written; the view follows the bottom unless the reader scrolls up; never re-render while the user is touching the screen.
- Rich blocks: code blocks with copy, tables squeezed to width, Mermaid diagrams and charts drawn client-side, pictures from the web as small rounded thumbnails with a source link.
- Memory is a visible, editable markdown file the user owns, with a switch "let epic AI learn about me".
- Limits are shown calmly in a usage page (meter + plan), never as an error wall.

## 6. Motion rules (important)

- Easing: `cubic-bezier(0.2, 0, 0, 1)`. Durations: hover/press 160 ms, popovers 150 to 200 ms, blocks entering 320 to 420 ms, backdrop fades 200 ms.
- Every interactive element eases its colour, shadow and opacity changes; buttons press in to `scale(0.97)`.
- Content blocks (cards, sections, headings, tables) **rise 14px while fading in** as they scroll into view, staggered 45 ms (cap about 360 ms); a grid animates card by card. Newly added list rows rise in too. Images fade in when loaded.
- Menus and dialogs open with a small translate + scale (6 to 8px, 0.97 to 1). `<details>` content slides down. Navigation between screens cross-fades (View Transitions API on the web).
- Typing: empty search boxes **type example searches** into their placeholder one letter at a time ("try “chess”", "try “qr code”"), pausing while focused. Streaming text appears incrementally.
- Animate only opacity and transform; cap the number of animated blocks per screen; remove the animation class when it ends (a running animation creates a stacking context that can hide dropdown menus behind later cards).
- Respect `prefers-reduced-motion` and keep a user switch to turn motion off completely.

## 7. The OS shell, in this language

Build these as the same components, using only the tokens above:

1. **Desktop / home screen**: background colour (or soft glass blobs in glass themes), widgets as 20px-radius cards (clock, weather, epic AI card with greeting, storage meter, recent files).
2. **Launcher / app grid**: rounded icon tiles (12px radius) with lowercase labels, search pill on top that searches apps, files, settings and the web through one API (typo tolerant, ranked, typed results: page, doc, app, file, person).
3. **Windows**: 20px-radius surface cards with a slim title bar (icon, title, window buttons as round icon buttons), snap/tile layout, subtle shadow only while dragging; focused window has a slightly stronger outline.
4. **Task switcher**: horizontal row of scaled window cards; swipe/flick away to close with a fade-and-rise exit.
5. **Notification shade + quick settings**: a sheet that slides from the top; quick-setting tiles are 20px-radius pills (secondary container when on); notification cards group by app, swipe to dismiss; the epic AI card sits on top with a "what did I miss?" summary.
6. **Lock screen**: large clock, one line of muted text, the face mark as the assistant entry; unlock cross-fades into the home screen.
7. **Settings app**: left list of sections with icons (themes first: a grid of colour swatches with the name under each; sync, files, epic AI, privacy, motion, language, keyboard); toggles are Material 3 switches in primary.
8. **File manager**: exactly the website's files page: list or tile view, folder chips, private/public tags, bulk-action bar that sticks to the top when something is selected, a three-dots menu on every row, a quota bar (6px track).
9. **App store (Epicenter)**: catalog cards with icon, name, version, star rating, download count and an "updated N days ago" badge; app dialog with screenshots, SHA-256 and "verify" hints, install/update/open button; an Updates tab with "update all"; community apps wait in a review queue.
10. **Office suite (One)**: ribbon-style toolbar per app (word, sheet, slide, draw, PDF, translate...) with the same tokens; the epic AI assistant sits in a side panel inside every app.
11. **Assistant everywhere**: hold-power / assistant gesture / Ctrl+Space opens the quick-entry box; "look at my screen" is an explicit action (screenshot sent once, never stored); when the assistant operates the UI it shows a small floating pill with its current step, a Pause/Continue button and a Stop button, highlights the target it is about to tap, and asks before anything risky (payments, deleting, sending). Banking, wallet and password screens are never read or operated.
12. **Privacy by default**: new files are private (links expire), sign-in is required for anything shared, and every feature that sends data off the device says where it goes in plain language next to its switch.

## 8. Deliverables

Start with: (a) a token file implementing section 2 with theme switching and flash-free boot, (b) a component kit (buttons, chips, switches, cards, list rows with kebab menus, dialogs, sheets, toasts, search pill with dropdown, bottom nav, top bar), (c) the motion layer from section 6, then (d) the shell screens in the order of section 7, each runnable and screenshot-tested in dark, light and one glass theme at phone, tablet and desktop widths. Keep the code dependency-free (plain HTML/CSS/JS or the framework I name), and tell me honestly what you could not verify.
