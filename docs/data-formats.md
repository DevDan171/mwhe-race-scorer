# Data formats

Every persisted document carries `schemaVersion`. Phase 0 is version `1`. Schemas live in `packages/core` and are the source of truth; this page describes them.

Timestamps are ISO-8601 with an offset and millisecond precision, for example `2026-06-14T14:20:00.000Z`. Dates that are not instants (`event.date`, series event dates) are `YYYY-MM-DD`.

## RacePackage

Downloaded from the site before the race.

- `event`: `id`, `name`, `date`, `timeLimitMinutes`, and `checks`. Each check has `id`, `order`, and `name`. Ids and orders are unique.
- `classes`: the official class list, in canonical order. See `RIDER_CLASSES` in `packages/core/src/classes.ts`.
- `riders`: series master list. `seriesId`, `name`, `number`, `class`. Rider numbers are unique across the series, not just inside a class. Series ids are unique.
- `registrations`: who is in this event. `riderNumber`, `name`, `class`, `seriesId`.

`seriesId` is null for a day-of entry. A day-of number cannot collide with a series rider. A non-null `seriesId` must be the series rider who owns that number.

The registration name and class are what results and the phone use. They may differ from the series record if someone races a different class for the day.

## Phone roster

`PhoneRosterRider` is a strict object: `name`, `number`, `class`. Anything else fails validation, so a series id cannot be copied onto a phone by accident.

`projectPhoneRoster` builds the roster from event registrations only. A series rider who is not entered is left out. `applyRosterDelta` applies laptop updates in order. `version` must be exactly the phone's current version plus one. Skipping versions is rejected. A full resync is not implemented.

## Punch

| Field         | Meaning                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `uuid`        | Identity. Re-syncing the same uuid is one punch.                               |
| `checkId`     | Locked when the station is set up.                                             |
| `deviceId`    | Which phone.                                                                   |
| `riderNumber` | A number that is not on the roster is still valid. Scoring flags it `UNKNOWN`. |
| `timestamp`   | When the punch happened, from the phone's GPS clock.                           |
| `createdAt`   | When the phone recorded the row.                                               |
| `voided`      | Undo. If any synced copy is voided, the punch does not score.                  |

## StartTime

One start per rider, edited on the laptop: `riderNumber`, `startedAt`. If scoring sees more than one, the last one wins and a warning is returned.

## Penalty

Whole seconds, greater than zero. `scope` is `{ "type": "overall" }` or `{ "type": "check", "checkId": "..." }`. `appliedBy` is `race_director` or `admin`. `reason` is required.

## Disqualification

Not inferred. `riderNumber`, `reason`, `appliedBy`, `createdAt`. Scoring sets status `DQ` and leaves the rider out of the order.

## ChangelogEntry

The laptop writes one for every manual add, delete, or change.

- `who`, `when`, `why`
- `entity`: `{ type, id }` where type is `punch`, `start_time`, `penalty`, `registration`, `disqualification`, or `result`
- `action`: `add`, `delete`, or `change`
- `before` and `after`: `before` is null on add, `after` is null on delete

`createChangelogEntry` fills `schemaVersion`.

## ResultsPayload

Published to the site.

- `eventId`
- `version`: the laptop bumps this on every republish. Scoring does not.
- `status`: `provisional`, then `official` after the protest window
- `protestWindowMinutes`: always `30`
- `publishedAt`
- `rows`

Each row:

| Field                                | Meaning                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `number`, `class`            | From the registration. Unknown numbers use the name `UNKNOWN` and `class: null`.                                                                     |
| `unknown`                            | True when the number was not registered.                                                                                                             |
| `checks`                             | Distinct in-limit checks.                                                                                                                            |
| `elapsedSeconds`                     | Last in-limit punch minus start. Null when there is no scored punch.                                                                                 |
| `penaltySeconds`                     | All penalties.                                                                                                                                       |
| `overallPenaltySeconds`              | Overall-scoped penalties only.                                                                                                                       |
| `totalTimeSeconds`                   | Elapsed plus penalties. Null when elapsed is null.                                                                                                   |
| `checkResults`                       | One row per punched course check, in course order. Cumulative and segment seconds, `overLimit`, `countsForScore`, and check-scoped `penaltySeconds`. |
| `positionInClass`, `positionOverall` | Null for DQ and for an unknown number's class position.                                                                                              |
| `status`                             | `finished`, `DNF`, or `DQ`.                                                                                                                          |

DNF and DNS are the same status. See [scoring rules](scoring-rules.md).

## Sync messages

`SyncMessage` is a discriminated union on `type`.

### `push_punches`

Station to laptop. `deviceId`, `eventId`, `sentAt`, and the full punches.

### `roster_delta`

Laptop to station. `version`, `baseVersion`, `upserts` (phone roster riders), `removals` (rider numbers). A number cannot be both upserted and removed. Upsert numbers are unique, and so are removals.

### `qr_checkpoint_export`

For a check that is out of range. The frame carries `eventId`, `checkId`, `deviceId`, `exportedAt`, `part`, `parts`, and compact punches (`uuid`, `riderNumber`, `timestamp`, `createdAt`, `voided`). `checkId` and `deviceId` are not repeated on every punch because the station is locked to one check.

`part` must be between 1 and `parts`. Phase 0 defines the frame. Splitting a large capture across several QR codes, and stitching those frames back together, is later work. `importQrCheckpointExport` turns one frame into full punches.
