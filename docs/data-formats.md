# Data formats

Every persisted document carries `schemaVersion`. Phase 0 is version `1`. Schemas live in `packages/core` and are the source of truth; this page describes them.

Timestamps are ISO-8601 with an offset and millisecond precision, for example `2026-06-14T14:20:00.000Z`. Dates that are not instants (`event.date`, series event dates) are `YYYY-MM-DD`.

## RacePackage

Downloaded from the site before the race.

`schemaVersion` stays `1`. `length`, the row gap, the planned start, and a rider's start row were added without a version bump because an older package that still has `timeLimitMinutes` (and the old `laps` field) still parses. Those packages are read as a timed race. The old lap count on them is not treated as a lap race, because scoring only ever used the time limit.

- `event`: `id`, `name`, `date`, `length`, and `checks`. Each check has `id`, `order`, and `name`. Ids and orders are unique. `length` and `checks` are the primary race's course (the race with the lowest `order`). The scoring engine still reads them from `event`.
- `length`: one choice. `{ "mode": "time", "minutes": 120 }` or `{ "mode": "laps", "laps": 2 }`. `laps: null` means the race runs until the finish and has no time limit. A timed race counts the minutes from each row's own start.
- `races`: one or more races. Each has `id`, `name`, `order`, `length`, `rowGapSeconds`, `plannedStart`, `checks`, and `startRows`. The primary race's checks and length must match `event`.
- `rowGapSeconds`: whole seconds, 0 or more. Row N leaves at `plannedStart` plus the gap times (N - 1).
- `plannedStart`: when row 1 leaves, or null. ISO-8601 with an offset.
- `startRows`: at least one row. `id`, `order`, `label`, and `classes`. `order` is the row number across the whole race, starting at 1. A class may be on more than one row (A on rows 2, 3, and 4). The same class is not listed twice on one row.
- `classes`: the official class list, in canonical order. See `RIDER_CLASSES` in `packages/core/src/classes.ts`.
- `riders`: series master list. `seriesId`, `name`, `number`, `class`. Rider numbers are unique across the series, not just inside a class. Series ids are unique.
- `registrations`: who is in this event. `riderNumber`, `name`, `class`, `seriesId`, `registeredAt`, `assignedRows`. `registeredAt` is when they signed up, or null. `assignedRows` is `{ raceId, row }` for each race that assigned a start row. A start row is per race. An empty list means the laptop places them by registration time. See [scoring rules](scoring-rules.md).

`seriesId` is null for a day-of entry. A day-of number cannot collide with a series rider. A non-null `seriesId` must be the series rider who owns that number.

The registration name and class are what results and the phone use. They may differ from the series record if someone races a different class for the day.

Optional fields, omitted by older packages so `schemaVersion` stays `1`:

- `updatedAt` on the event, each race, each series rider, and each registration. ISO-8601. It is the site's `updated_date`. Re-import keeps the laptop's copy when that record was edited locally after this time.
- Contact fields on series riders and registrations: `dateOfBirth`, `phone`, `email`, `emergencyContactName`, `emergencyContactPhone`, `emergencyContactRelation`, `safetyAcknowledged`, `safetyAcknowledgedAt`.
- `enteredRaceIds` on a registration. Omitted means every race that has a row for the rider's class.
- `payment` on a registration, `paid` or `unpaid`.

A rider can only be placed on a row whose `classes` include their class. Removing a row moves those riders to unassigned and renumbers the remaining rows from 1. Row N still leaves at `plannedStart` plus `rowGapSeconds` times (N − 1).

The laptop strips the contact fields before it writes the race file and stores them in a separate AES-256-GCM payload. On Windows the key is in Credential Manager (`MWHE Race Scorer` / `rider-private-key`). The browser preview keeps that key in IndexedDB because it has no Credential Manager. Results, the phone roster, exports, and changelog text do not include the contact values.

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

One start per rider, edited on the laptop: `riderNumber`, `startedAt`. If scoring sees more than one, the last one wins and a warning is returned. When the laptop has not entered one, scoring uses the rider's row clock. A row clock exists only when the race has a planned start.

## Penalty

Whole seconds, greater than zero. `scope` is `{ "type": "overall" }` or `{ "type": "check", "checkId": "..." }`. `appliedBy` is `race_director` or `admin`. `reason` is required.

## Disqualification

Not inferred. `riderNumber`, `reason`, `appliedBy`, `createdAt`. Scoring sets status `DQ` and leaves the rider out of the order.

## ChangelogEntry

The laptop writes one for every manual add, delete, or change.

- `who`, `when`, `why`
- `entity`: `{ type, id }` where type is `punch`, `start_time`, `penalty`, `registration`, `disqualification`, `result`, or `race`
- `action`: `add`, `delete`, or `change`
- `before` and `after`: `before` is null on add, `after` is null on delete

`createChangelogEntry` fills `schemaVersion`.

Race setup changes use entity type `race` and the race id. Registration changes use entity type `registration`. `before` / `after` are the changed fields (`number`, `class`, `length`, row gap, planned start, checks, or start rows). They do not include phone, email, birth date, emergency contact, or the safety acknowledgement. Adding a rider does not ask for a typed reason. The entry still has who and when, and `why` is filled by the app (`Added at registration`, `Re-import from the site`, and so on).

## Race day state

The laptop stores a `RaceDayState` after a download. It is not sent to the site as-is.

- `downloadedAt`: when this snapshot was saved.
- `rosterVersion`: starts at `1`. Registration adds, number changes, and class changes increment it. Race setup does not.
- `snapshot`: the package the site returned, unchanged.
- `race`: the working package. Edits land here.
- `dayOfRegistrations`: riders registered on the laptop that day. Each one is also on `race.riders` and `race.registrations`. This is the list a later publish will push. Site-supplied registrations are not copied into it.
- `changelog`: `ChangelogEntry` rows, in order.
- `rosterDeltas`: `roster_delta` messages from version 1 through `rosterVersion`. Version 1, base 0, is the full event roster. Later deltas are adds and updates. `rosterChangesSince(state, phoneVersion)` returns the deltas a phone still needs. Apply them with `applyRosterDelta`, in order, starting from a version `0` roster.

A new rider is written to the series list and the event roster in one step, then appended to `dayOfRegistrations`. The laptop blocks any number already on the series list, including riders who are not in this event. Changing a number updates the series rider and the registration. Changing a class updates the registration (what the phone and the results use) and leaves the series class as downloaded. Retired numbers are not reserved; that is the open parallel-event decision.

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
