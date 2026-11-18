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

On Windows, if `corepack enable` fails with `EPERM`, install pnpm itself:

```bash
npm install -g pnpm
```

If PowerShell refuses to run scripts, allow them for your user and open a new terminal:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

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
pnpm mock:site     # http://127.0.0.1:8787
```

The laptop signs in with a MidwestHardEnduro.com email and password, or with Google. It does not ask anyone to paste a token. The Windows app stores that person's token in Credential Manager. The browser preview keeps it in memory for the tab. An account created with Google has no password; use **Sign in with Google** for that person.

Until `getRacePackage` exists on the live site, use the mock. `pnpm dev:laptop` starts Race Prep on `http://127.0.0.1:8787`. Run `pnpm mock:site`, choose **Fill in the mock site**, and sign in as `rd@example.com` / `race-day-local`. That account is a race director. `rider@example.com` with the same password is rejected. `google-rd@example.com` has no password: the email form returns an error, and **Sign in with Google** accepts it. Download event `gnaw-bone-2026`. The password is only for this mock. It is not a MidwestHardEnduro.com password.

The station app still renders the Timber Ridge demo roster. That fixture is not a real result.

## Docs

- [Architecture](docs/architecture.md)
- [Data formats](docs/data-formats.md)
- [Site API](docs/site-api.md) (what to build in Base44)
- [Scoring rules](docs/scoring-rules.md)
- [Releases](docs/release.md)

## Phase 1 status

Done: email sign-in and a mock Google sign-in against the mock site, race package download, SQLite race prep, offline registration with series-wide number checks, roster versions and deltas, and a changelog.

Not done, and called out in [docs/release.md](docs/release.md): the Windows installer and the Android APK. CI typechecks and builds the web bundles. It does not compile the Tauri shell. Base44 still has to implement `getRacePackage` from [docs/site-api.md](docs/site-api.md). The live site sign-in has not been tried against MidwestHardEnduro.com yet. The mock covers the same calls.
