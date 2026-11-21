# Releases

Tags are semantic versions: `vMAJOR.MINOR.PATCH`, with an optional prerelease (`v0.2.0-rc.1`). Pushing a `v*` tag runs `.github/workflows/release.yml`.

`schemaVersion` in `@mwhe/core` is not the git tag. Bump `schemaVersion` when a stored document changes in a breaking way. Until 1.0, a breaking schema change should also bump the minor tag. After 1.0 it should bump the major tag.

The laptop and the station packages are `0.4.0` together. A phone is not allowed to go live unless that version matches the laptop it pairs with. The release version is still the git tag. The Windows workflow writes the tag into the installer at build time. The Android workflow writes the tag into the APK the same way. Do not tag until both packages are the version you mean to ship.

How to install the exe, and how to set updater keys or Azure signing, is in [install-windows.md](install-windows.md) and [RELEASING.md](RELEASING.md).

## What the workflow builds

It installs, builds the laptop and station Vite bundles, builds the Windows NSIS installer, and attaches:

- the installer whose name ends in `_x64-setup.exe`
- `mwhe-laptop-web-<tag>.tar.gz`
- `mwhe-station-web-<tag>.tar.gz`
- `NATIVE_BUILDS.txt`
- `mwhe-station-<version>.apk`, or `mwhe-station-<version>-debug.apk` when the Android keystore secrets are not set
- `latest.json` and a `.sig` file, only when the updater private key is set and `plugins.updater.pubkey` is the matching public key. `latest.json` points at the Windows installer only.
- `station-update.json` next to a signed `mwhe-station-<version>.apk`. It carries `version`, `url`, and `sha256`. A debug APK does not publish it. Phones use it to update. The Windows updater does not.

`apps/laptop/src-tauri` wires the window, `tauri-plugin-sql`, `tauri-plugin-http`, the updater, and credential commands backed by the `keyring` crate with the `windows-native` feature. Rust 1.90 is required. The Windows workflow installs it. Ubuntu CI does not compile the shell.

`pnpm --filter @mwhe/laptop build` only typechecks and builds the web bundle. Registration, number checks, roster versions, changelog writes, and the mock-site download are covered by Vitest without Rust.

The installer is unsigned until the Azure Artifact Signing secrets in [RELEASING.md](RELEASING.md) are all set.

## Android APK

`apps/station` is the Capacitor app (`com.midwesthardenduro.station`). The Android project is `apps/station/android`. The oldest phone is Android 8, API 26. Pull requests upload `mwhe-station-android`. A version tag attaches the APK to the same GitHub Release as the Windows installer. The file name uses hyphens.

The release keystore is optional. When `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` are all set, the tag build is a signed release APK. When any of them is missing, the build is a debug APK named `mwhe-station-<version>-debug.apk` and the job stays green. How to create the keystore is in [RELEASING.md](RELEASING.md).

The station target is Android only. An iOS project is out of scope.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: install, lint, format, typecheck, Vitest, the web builds, and `cargo test` for the sync server. `.github/workflows/laptop-windows.yml` builds the NSIS installer on every pull request and uploads it as an artifact. `.github/workflows/station-android.yml` builds the APK on every pull request and uploads it as `mwhe-station-android`. Ubuntu CI still does not compile the Tauri window.
