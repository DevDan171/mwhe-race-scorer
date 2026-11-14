# MWHE Race Scorer

Offline race-day scoring for the Midwest Hard Enduro series. A Windows laptop is the hub, Android phones sit at the checkpoints, and official results go to [MidwestHardEnduro.com](https://MidwestHardEnduro.com).

Phase 1 is the laptop hub: download a race package, then register riders offline. The phones do not yet record punches.

## Layout

| Path            | What it is                                                              |
| --------------- | ----------------------------------------------------------------------- |
| `packages/core` | Zod schemas, scoring, registration, the site client, and the mock site. |
| `apps/laptop`   | Tauri 2 + React hub. SQLite, sign-in, race prep, and registration.      |
| `apps/station`  | Capacitor + React + Vite scaffold for Android. Web bundle only for now. |
| `docs/`         | Architecture, document formats, the Base44 API spec, and scoring rules. |

## Setup

Node 22 and pnpm 10.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm ci` runs that same sequence.

```bash
pnpm dev:laptop    # http://localhost:1420
pnpm dev:station   # http://localhost:1421
pnpm mock:site     # http://127.0.0.1:8787  GET /functions/getRacePackage
```

The laptop talks to MidwestHardEnduro.com when that function exists. Until then, point Race Prep at the mock site, paste any bearer token other than `forbidden`, and download event `gnaw-bone-2026`. The token is not a shared key. In the browser preview it stays in memory. The Windows app stores it in Credential Manager.

The station app still renders the Timber Ridge demo roster. That fixture is not a real result.

## Docs

- [Architecture](docs/architecture.md)
- [Data formats](docs/data-formats.md)
- [Site API](docs/site-api.md) (what to build in Base44)
- [Scoring rules](docs/scoring-rules.md)
- [Releases](docs/release.md)

## Phase 1 status

Done: race package download against a mock site, SQLite race prep, offline registration with series-wide number checks, roster versions and deltas, and a changelog.

Not done, and called out in [docs/release.md](docs/release.md): the Windows installer and the Android APK. CI typechecks and builds the web bundles. It does not compile the Tauri shell. Base44 still has to implement `getRacePackage` from [docs/site-api.md](docs/site-api.md).
