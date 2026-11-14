# Releases

Tags are semantic versions: `vMAJOR.MINOR.PATCH`, with an optional prerelease (`v0.2.0-rc.1`). Pushing a `v*` tag runs `.github/workflows/release.yml`.

`schemaVersion` in `@mwhe/core` is not the git tag. Bump `schemaVersion` when a stored document changes in a breaking way. Until 1.0, a breaking schema change should also bump the minor tag. After 1.0 it should bump the major tag.

Package versions in this repo are `0.1.0` during Phase 0. The release version is the git tag, not those fields.

## What the workflow builds

It installs, builds the laptop and station Vite bundles, and attaches:

- `mwhe-laptop-web-<tag>.tar.gz`
- `mwhe-station-web-<tag>.tar.gz`
- `NATIVE_BUILDS.txt`, which states that the installers were not produced

## What is stubbed

### Windows installer

`apps/laptop/src-tauri` is a Tauri 2 scaffold (`Cargo.toml`, `tauri.conf.json`, a window, a default capability). CI does not install Rust and does not run `tauri build`.

Still missing before an NSIS installer can be attached to a release:

- a Windows runner with the Rust toolchain and the Tauri CLI
- icons at the paths in `apps/laptop/src-tauri/tauri.conf.json` (`icons/32x32.png`, `icons/128x128.png`, `icons/icon.ico`)
- NSIS
- a code-signing certificate

`pnpm --filter @mwhe/laptop build` only typechecks and builds the web bundle. That is what CI runs.

### Android APK

`apps/station` has Capacitor config (`com.midwesthardenduro.station`, `webDir: dist`) and depends on `@capacitor/core`. There is no `android/` project.

Still missing:

- `pnpm exec cap add android` inside `apps/station`
- an Android SDK and Gradle
- a release keystore
- a workflow job that runs `assembleRelease`

The station target is Android only. An iOS project is out of scope.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: install, lint, format, typecheck, Vitest, and the web builds.
