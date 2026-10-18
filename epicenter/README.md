# Epicenter catalog format (version 1)

Epicenter (oeper.dev/epicenter and the Epicenter Android app) reads **catalogs**: one JSON file listing apps. `index.json` here is
oeper.dev's own; the community catalog comes from `GET https://oeper-ai.oeper.workers.dev/api/epicenter/catalog` (apps people submitted
and an owner approved); anyone can host another catalog (any https URL that returns this format, with CORS enabled for the website) and
add it as a source in Epicenter. A GitHub repo can also be a source (`github:owner/repo`): its newest release becomes one app and each
release file is sorted by its extension.

```json
{
  "epicenter": 1,
  "name": "Source name",
  "apps": [{
    "id": "com.example.app",
    "package": "com.example.app",
    "name": "App",
    "summary": "one line, max 140",
    "description": "longer text, max 4000",
    "icon": "https://example.com/icon.png",
    "screenshots": ["https://example.com/shot.png"],
    "categories": ["tools"],
    "homepage": "https://example.com",
    "source": "https://github.com/example/app",
    "author": "name", "license": "MIT",
    "version": "1.2.3", "versionCode": 123, "notes": "what is new",
    "assets": [{
      "platform": "android",
      "format": "apk",
      "url": "https://example.com/app.apk",
      "sha256": "64 hex characters",
      "size": 12345678, "arch": "arm64-v8a", "minSdk": 26, "label": "shown on the button",
      "manifest": "https://example.com/update.json"
    }]
  }]
}
```

- `id`: unique; for Android apps use the package name. `package` is needed for Android assets (installed version and updates are found by it).
- `platform`: android, ios, windows, macos, linux, web.
- `sha256` is optional but strongly advised: the Android app refuses a download that does not match it.
- `manifest` (optional): a small JSON `{versionCode, versionName, size, sha256, notes}` that overrides the version, size and checksum of the file
  (for "latest" links, such as the one `./gradlew publishUpdate` refreshes for epic AI).

Formats: Android `apk` `apks` `xapk` `apkm` (split bundles install too) · iOS `ipa` `altstore` (an AltStore / SideStore source) `testflight` `appstore` ·
Windows `exe` `msi` `msix` `appx` `portable` · macOS `dmg` `pkg` `app.zip` · Linux `deb` `rpm` `appimage` `flatpak` `snap` `tar.gz` ·
any platform: `pwa` (an installable web app) `link` / `store` (a store page) `zip` `other`.

Categories: ai, games, tools, productivity, media, social, developer, education, utilities, other.

What installs where: the Android app installs the Android formats (Android asks the person to confirm each install). Everything else is
shown for the visitor's own platform with a download link. Nothing is ever installed silently, and apps from sources other than oeper.dev are
marked as unreviewed.

## Updates

- Every app has one current release (`version`, `versionCode`, `notes`). The Android app compares `versionCode` with the installed one (or `version` when there is no code) and offers the update; nothing installs without Android asking the person.
- **Rolling links + `manifest`** is how a publisher releases without touching the catalog: keep the download link stable (for GitHub: `https://github.com/owner/repo/releases/latest/download/App.apk`) and put an `update.json` (`{versionCode, versionName, size, sha256, notes}`) next to it. Epicenter reads the manifest every time the page/app opens; for community apps the worker also follows it by itself every 6 hours (version, notes, size and checksum only, never a link) and the publisher can press "check for new versions" in "my apps". A new version without a checksum in the manifest drops the old checksum so a good download is never refused.
- Changing a link, name or anything else in a community entry means resubmitting it (the old entry stays live until an owner approves the change).
- `GET /api/epicenter/manifest?url=` (worker) returns a manifest's cleaned fields; the website uses it because GitHub sends no CORS headers.

## Publishing from a script (publish keys)

Make a key in oeper.dev/epicenter > my apps > publish keys (shown once; only a hash is stored; up to 5; revoke any time). Then:

```
PUT https://oeper-ai.oeper.workers.dev/api/epicenter/publish
Authorization: Bearer epk_...
Content-Type: application/json

{ "app": { "id": "com.example.app", "version": "1.2", "versionCode": 12, "notes": "what is new" } }
```

- A key only reaches apps its owner has. For an app you already have, only the fields you send change (`assets` replaces the whole list), so the line above is a complete release. A new app needs the full entry (id, name, summary, assets...).
- The same checks as the form apply. Owners go live at once; everyone else waits for approval like a submission (`status: "pending"`).
- Errors come back as `{ "error": "..." }` with 400 (bad entry) or 401 (missing/unknown key).
