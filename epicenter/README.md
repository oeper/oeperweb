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
