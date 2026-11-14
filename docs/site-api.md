# Site API

The laptop is the only app that talks to [MidwestHardEnduro.com](https://midwesthardenduro.com). Phase 1 needs one function: `getRacePackage`. The server functions are **not** in this repo. Build them in Base44 from this spec.

This follows the same shape as the DirtHub ingest the series already uses: JSON to `https://<site>/functions/<name>`, and a response envelope that starts with `ok`.

|         | DirtHub ingest                                           | MWHE getRacePackage                                                                   |
| ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Call    | `POST https://dirthub.org/functions/ingestScrapedEvents` | `GET https://midwesthardenduro.com/functions/getRacePackage?eventId=...`              |
| Body    | JSON wrapper                                             | No body. The event id is a query parameter.                                           |
| Success | `{ "ok": true, ... }`                                    | `{ "ok": true, "racePackage": { ... } }`                                              |
| Failure | `{ "ok": false, ... }`                                   | `{ "ok": false, "error": "...", "message": "..." }`                                   |
| Auth    | One shared key                                           | `Authorization: Bearer <token>` from a race_director or admin sign-in. No shared key. |

`publishRaceResults` is the same envelope style and is specified in a later phase. Do not build it yet.

Field names are **camelCase**, matching `packages/core`. They are not the snake_case names in the old illustrative results sample.

`schemaVersion` is `1`.

## Request

```http
GET /functions/getRacePackage?eventId=gnaw-bone-2026 HTTP/1.1
Host: midwesthardenduro.com
Accept: application/json
Authorization: Bearer <race_director-or-admin-token>
```

| Piece         | Rule                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| Method        | `GET` only.                                                                             |
| Path          | `/functions/getRacePackage`                                                             |
| `eventId`     | Required query parameter. The event's id on the site.                                   |
| Authorization | Required. `Bearer` plus the signed-in user's token.                                     |
| Shared key    | Do not accept `apiKey`, `key`, or a shared header. Ignore those if a client sends them. |

The token is whatever Base44 issues for a signed-in user (session token or access token). The laptop does not mint it. See [Sign-in](#sign-in).

## Authorization

Resolve the bearer token to a Base44 user. Allow the call only when that user's role is `race_director` or `admin`. Anyone else gets `403`, including a valid token for a rider or a public visitor.

Missing, blank, or unknown tokens get `401`. Do not include the token in logs or in the response body.

## Success, 200

```json
{
  "ok": true,
  "racePackage": {}
}
```

`racePackage` is a `RacePackage` from `packages/core/src/schemas/race-package.ts`. Extra keys are rejected by the laptop. A complete valid package is in [`examples/getRacePackage.response.json`](examples/getRacePackage.response.json). That file is the sample the local mock serves, and the schema tests parse it.

### `racePackage` fields

| Field                      | Meaning                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`            | Always `1`.                                                                                                                                                            |
| `event`                    | `id`, `name`, `date` (`YYYY-MM-DD`), `timeLimitMinutes`, `checks`.                                                                                                     |
| `event.checks`             | The course of the **primary race** (lowest `order`). Each check has `id`, `order` (unique, starting at 1), and `name`.                                                 |
| `races`                    | One or more races. Unique `id` and unique `order`.                                                                                                                     |
| `races[].timeLimitMinutes` | Whole minutes, at least 1. The primary race's limit **must equal** `event.timeLimitMinutes`.                                                                           |
| `races[].laps`             | How many times that race's check list is ridden.                                                                                                                       |
| `races[].checks`           | Lap order for that race. The primary race's list **must equal** `event.checks`, same ids, order numbers, names, and array order. Other races may use a shorter course. |
| `races[].startRows`        | At least one row. `id`, `order`, `label`, and `classes`. A class appears on at most one row in a race.                                                                 |
| `classes`                  | The official list, in this order: Pro, A, B, C, +40A, +40B, +40C, Womens, Womens Pro, Electric Sportsman, Electric Pro, 65/85, 50cc.                                   |
| `riders`                   | Series master list. `seriesId`, `name`, `number`, `class`. Numbers are unique across the series, not per class. Series ids are unique.                                 |
| `registrations`            | Who is already in this event. `riderNumber`, `name`, `class`, `seriesId`. Numbers are unique inside the event.                                                         |

Leave out contact fields (email, phone, address, emergency contact). The laptop does not need them, and they must not be copied onto checkpoint phones later.

`seriesId` is `null` only for a day-of entry that is not on the series list. A non-null `seriesId` must be the series rider who owns that number. A day-of number cannot collide with a series rider. The laptop's own day-of sign-ups are **not** in this download; they are created offline and pushed later.

The registration `name` and `class` are what results use that day. They may differ from the series record when someone races a different class.

## Errors

Always return JSON, including on failure. `error` is a stable code. `message` is a short sentence a race director can read.

| HTTP | `error`            | When                                                                |
| ---- | ------------------ | ------------------------------------------------------------------- |
| 400  | `missing_event_id` | `eventId` is missing or blank.                                      |
| 401  | `unauthorized`     | No bearer token, or the token does not match a user.                |
| 403  | `forbidden`        | The user is signed in but is not `race_director` or `admin`.        |
| 404  | `event_not_found`  | No event with that id.                                              |
| 500  | `server_error`     | Unexpected failure. Do not leak stack traces or rider contact data. |

```json
{
  "ok": false,
  "error": "forbidden",
  "message": "This account is not a race director or admin"
}
```

## CORS

The Windows app calls the site with the Tauri HTTP client, which does not need CORS. The browser preview does. Respond to `OPTIONS` and `GET` with:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Authorization, Accept, Content-Type
Access-Control-Allow-Methods: GET, OPTIONS
Cache-Control: no-store
```

## Sign-in

The laptop stores the bearer token in Windows Credential Manager (`MWHE Race Scorer` / `site-bearer-token`) through the `keyring` crate. It is not written to the repo, to SQLite, or to a plain file. The browser preview keeps it in memory for the tab only.

### What the laptop does today

The director signs in on the site, copies their personal bearer token, and pastes it into Race Prep. The laptop sends that token as `Authorization: Bearer`.

Device-code sign-in is declared on the `SignInMethod` type and **is not implemented**. `completeSignIn({ kind: "device_code" })` throws `device_code_unavailable`.

### Open question for Base44

How a race director obtains that bearer token is not documented yet. Pick one and tell us which:

1. A "copy API token" control on the site for `race_director` and `admin` users, or
2. A device-code / token-exchange endpoint the laptop can call without pasting.

Until that exists, token paste is the sign-in path. Also unset: token lifetime and refresh. A `401` sends the director back to Race Prep to paste a new token. The laptop does not refresh tokens on its own.

## Local mock

`pnpm mock:site` serves this contract on `http://127.0.0.1:8787` for event id `gnaw-bone-2026`.

The mock accepts any non-empty bearer token so you can paste one while developing. The token `forbidden`, or any token that starts with `deny:`, returns `403`. There is no shared key in the app or the mock. Do not copy the mock's "accept any token" behavior onto the real site.
