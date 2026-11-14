# MWHE Race Scorer

Offline race-day scoring for the Midwest Hard Enduro series. A Windows laptop is the hub, Android phones sit at the checkpoints, and official results go to [MidwestHardEnduro.com](https://MidwestHardEnduro.com).

Phase 0 is the foundation: shared schemas, the scoring engine, app scaffolds, and CI. The laptop does not yet store data in SQLite, and the phones do not yet record punches.

## Layout

| Path            | What it is                                                              |
| --------------- | ----------------------------------------------------------------------- |
| `packages/core` | Zod schemas, scoring, series points, sync types. Pure TypeScript.       |
| `apps/laptop`   | Tauri 2 + React + Vite scaffold. Web bundle only for now.               |
| `apps/station`  | Capacitor + React + Vite scaffold for Android. Web bundle only for now. |
| `docs/`         | Architecture, document formats, and scoring rules.                      |

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
```

Both apps import `@mwhe/core` and render the Timber Ridge demo race. That fixture is not a real result.

## Docs

- [Architecture](docs/architecture.md)
- [Data formats](docs/data-formats.md)
- [Scoring rules](docs/scoring-rules.md)
- [Releases](docs/release.md)

## Phase 0 status

Done: workspaces, schemas, scoring tests, web scaffolds, CI, and a release workflow that publishes web bundles.

Not done, and called out in [docs/release.md](docs/release.md): the Windows installer and the Android APK. The Tauri shell and the Capacitor config are scaffolds. Native build steps in the release workflow write a note instead of an installer.
