# MWHE Race Scorer

Offline race-day scoring for the Midwest Hard Enduro series. A Windows laptop is the hub, Android phones sit at the checkpoints, and official results go to [MidwestHardEnduro.com](https://MidwestHardEnduro.com).

Phase 2 adds the Android check phones and their sync with the laptop. The laptop is still the hub: download a race package, register riders offline, then pair a phone to each check.

## Layout

| Path            | What it is                                                              |
| --------------- | ----------------------------------------------------------------------- |
| `packages/core` | Zod schemas, scoring, registration, the site client, and the mock site. |
| `apps/laptop`   | Tauri 2 + React hub. SQLite, sign-in, race prep, and registration.      |
| `apps/station`  | Capacitor + React checkpoint phone for Android.                         |
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

The laptop signs in with a MidwestHardEnduro.com email and password, or with Google. It does not ask anyone to paste a token, an app id, or an event id. The packaged app uses `https://midwesthardenduro.com` and Base44 app id `6aa2c672e73573140bed9035`. The Windows app stores that person's token in Credential Manager. The browser preview keeps it in memory for the tab. An account created with Google has no password; use **Sign in with Google** for that person. Google sign-in finishes by itself. **Trouble signing in? Enter a code instead** is the fallback.

`pnpm dev:laptop` starts on the mock site at `http://127.0.0.1:8787`. Run `pnpm mock:site`, open Settings (or the sign-in card's developer section), choose **Use the mock site**, and sign in as `rd@example.com` / `race-day-local`. That account is a race director. `rider@example.com` with the same password is rejected. `google-rd@example.com` has no password: the email form returns an error, and **Sign in with Google** accepts it. The event list includes Scoring Test Event and Gnaw Bone. Import one, then use Race setup, Registration, and Rider lookup. The password is only for this mock. It is not a MidwestHardEnduro.com password.

`pnpm dev:station` opens the phone UI at `http://localhost:1421`. `pnpm dev:laptop` also listens for that phone at `http://127.0.0.1:1420`. The Windows app listens on port 8788 on the travel-router network. Pair a phone from **Stations**. The Timber Ridge demo roster is not a real result.

## Docs

- [Architecture](docs/architecture.md)
- [Data formats](docs/data-formats.md)
- [Site API](docs/site-api.md) (what to build in Base44)
- [Scoring rules](docs/scoring-rules.md)
- [Releases](docs/release.md)
- [Install on Windows](docs/install-windows.md)
- [Cutting a release](docs/RELEASING.md)
- [Station setup and race day](docs/station-guide.md)
- [Troubleshooting](docs/troubleshooting.md)

## Phase 2 status

Done: the laptop hub from Phase 1, plus checkpoint phones. A phone locks to one check, saves punches on the device, and syncs them to the laptop over the travel router. Out of range, the phone and the laptop exchange QR codes. Rider contact fields stay on the laptop.

The Windows installer and the Android APK are built on pull requests and published from the same version tag. Install steps for Windows are in [docs/install-windows.md](docs/install-windows.md). Race-day steps for the phones are in [docs/station-guide.md](docs/station-guide.md). Cutting a release, updater keys, the Android keystore, and Azure signing are in [docs/RELEASING.md](docs/RELEASING.md). Ubuntu CI typechecks and builds the web bundles and tests the sync server. It does not compile the Tauri window. Paste the files in [docs/base44/](docs/base44/) into Base44. `laptopExchangeCode` is unchanged. The live site sign-in has not been tried against MidwestHardEnduro.com yet. The mock covers the same calls.
