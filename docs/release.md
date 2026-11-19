# Releases

Tags are semantic versions: `vMAJOR.MINOR.PATCH`, with an optional prerelease (`v0.2.0-rc.1`). Pushing a `v*` tag runs `.github/workflows/release.yml`.

`schemaVersion` in `@mwhe/core` is not the git tag. Bump `schemaVersion` when a stored document changes in a breaking way. Until 1.0, a breaking schema change should also bump the minor tag. After 1.0 it should bump the major tag.

Package versions in this repo are `0.1.0` during Phase 0. The release version is the git tag, not those fields. The Windows workflow writes the tag into the installer at build time.

How to install the exe, and how to set updater keys or Azure signing, is in [install-windows.md](install-windows.md) and [RELEASING.md](RELEASING.md).

## What the workflow builds

It installs, builds the laptop and station Vite bundles, builds the Windows NSIS installer, and attaches:

- the installer whose name ends in `_x64-setup.exe`
- `mwhe-laptop-web-<tag>.tar.gz`
- `mwhe-station-web-<tag>.tar.gz`
- `NATIVE_BUILDS.txt`
- `latest.json` and a `.sig` file, only when the updater private key is set and `plugins.updater.pubkey` is the matching public key

`apps/laptop/src-tauri` wires the window, `tauri-plugin-sql`, `tauri-plugin-http`, the updater, and credential commands backed by the `keyring` crate. Rust 1.90 is required. The Windows workflow installs it. Ubuntu CI does not compile the shell.

`pnpm --filter @mwhe/laptop build` only typechecks and builds the web bundle. Registration, number checks, roster versions, changelog writes, and the mock-site download are covered by Vitest without Rust.

The installer is unsigned until the Azure Artifact Signing secrets in [RELEASING.md](RELEASING.md) are all set.

## What is stubbed

### Android APK

`apps/station` has Capacitor config (`com.midwesthardenduro.station`, `webDir: dist`) and depends on `@capacitor/core`. There is no `android/` project.

Still missing:

- `pnpm exec cap add android` inside `apps/station`
- an Android SDK and Gradle
- a release keystore
- a workflow job that runs `assembleRelease`

The station target is Android only. An iOS project is out of scope.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: install, lint, format, typecheck, Vitest, and the web builds. `.github/workflows/laptop-windows.yml` builds the NSIS installer on every pull request and uploads it as an artifact.
