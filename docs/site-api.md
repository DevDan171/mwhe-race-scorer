# Site API

The laptop is the only app that talks to [MidwestHardEnduro.com](https://midwesthardenduro.com). The server functions are **not** in this repo. Build them in Base44 from the files in [`docs/base44/`](base44/). Each file is one function or page and nothing else. Paste the file over the function or page of the same name.

| File                                                    | What it does and why                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`listEvents.js`](base44/listEvents.js)                 | New. After sign-in the laptop lists every event, past and upcoming, so nobody types an event id. Only `race_director` and `admin`. Counts races and registrations. No rider contact fields.                                                                          |
| [`getRacePackage.js`](base44/getRacePackage.js)         | Updated. Same download as before, plus contact and emergency fields from the Rider table, and `updatedAt` on each record so a re-import can tell which copy is newer. A roster row with a bad number now gets one warning and is skipped, instead of `Roster #null`. |
| [`uploadSeriesRiders.js`](base44/uploadSeriesRiders.js) | New. Riders added on the laptop with "Add to series" are created on the Rider table the next time the laptop is online. Only `race_director` and `admin`. The safety acknowledgement time is required.                                                               |
| [`laptopSignInCode.js`](base44/laptopSignInCode.js)     | Updated. The one-time code now lasts 10 minutes (`600` seconds) instead of 2, so Google sign-in can finish and hand the code back without anyone typing it. Everything else is the same.                                                                             |
| [`laptop-signin.jsx`](base44/laptop-signin.jsx)         | Updated. When the director is signed in, the page mints the code and redirects to the laptop immediately. It no longer waits for a Continue click. The code is a small fallback line. The token is still never put on the redirect.                                  |

`laptopExchangeCode` did not change. Keep the function that is already on the site. It still exchanges `{ code, state }` for `{ ok, access_token, user }` once, and it still refuses a mismatched state.

People sign in with the email and password they use on the website, or with Google, which is the website's normal sign-in. The laptop gets that person's access token and sends it on later calls. Nobody sees or pastes the token. It is not a shared key. A rider's token is not enough.

An account that was created with Google has no password. Email and password sign-in for that account returns HTTP 400. Use Sign in with Google for that person. Do not make them a second password unless they ask for one.

`publishRaceResults` uses the same `{ ok: true/false }` envelope and comes in a later phase. Do not build it yet.

Field names are **camelCase**, matching `packages/core`. `schemaVersion` is `1`.

## What the laptop does

1. The race director either types their MidwestHardEnduro.com email and password, or clicks **Sign in with Google**. There is no app id to type and no event id to type.
2. Email and password: the laptop posts those to Base44's login endpoint (the same call the SDK's `loginViaEmailPassword` makes) and reads `access_token` and `user`. The packaged app sends app id `6aa2c672e73573140bed9035`.
3. Google: the laptop opens the system browser at `https://midwesthardenduro.com/laptop-signin`. The person signs in with Google on the website. The page redirects the browser to a short-lived `http://127.0.0.1` address with the one-time code and the state. The laptop trades that code for the same kind of `access_token`. The token is not on that address. Typing the code is only the "Trouble signing in?" fallback. The steps you build for this are in [Sign in with Google](#sign-in-with-google).
4. It keeps the token only when `user.role` is `race_director` or `admin`. A rider is turned away on the laptop, and your function must turn them away again.
5. It stores the token in Windows Credential Manager (`MWHE Race Scorer` / `site-bearer-token`). The browser preview keeps it in memory. The token is not written to SQLite, a file, or the repo. The password is not stored. The one-time code is not stored.
6. It downloads the race with `Authorization: Bearer <that token>`.
7. After the download, registration works with the network off. The laptop does not refresh the token. Base44 does not document a refresh call. When the token is expired or revoked, the site returns 401 and the laptop asks the person to sign in again. The race already on the laptop stays.

Live sign-in goes to `https://base44.app`. That is the SDK's default server. The race download goes to the site address on the Race Prep screen (`https://midwesthardenduro.com` in the packaged app). The local mock is the exception: both calls stay on `http://127.0.0.1:8787`.

The packaged app sends app id `6aa2c672e73573140bed9035` and talks to `https://midwesthardenduro.com`. That id is in the Base44 editor URL and is not a password. The laptop does not show a field for it. A dev preview can point at the mock site instead.

## Where this comes from

These are the pages this design follows. Checked 14 November 2026.

- [External apps and `loginViaEmailPassword`](https://docs.base44.com/developers/references/sdk/getting-started/client) — an outside app creates a client with the app id and signs a user in with email and password. The client then sends that user's token.
- [`auth` module](https://docs.base44.com/developers/references/sdk/docs/interfaces/auth) — login returns `access_token` (a JWT) and `user`. `user.role` is a string. `loginViaEmailPassword` is the documented call. `redirectToLogin` is a browser redirect and throws outside a browser.
- [Auth skill notes](https://docs.base44.com/developers/skills/base44-sdk/references/auth) — "Token expiration and refresh not exposed in API." A 401 means the token is dead. Send the person to sign in again. There is no refresh method on the auth module.
- [SDK `auth.ts`](https://github.com/base44/javascript-sdk/blob/main/packages/sdk/src/modules/auth.ts) — email login is `POST /api/apps/<appId>/auth/login` with `{ email, password }`. `me()` is `GET /api/apps/<appId>/entities/User/me`. `loginWithProvider("google", fromUrl)` sends the browser to `{appBaseUrl}/api/apps/auth/login?app_id=...&from_url=...`. Inside an iframe, the popup handler sets `access_token` on the query string of `fromUrl`. Checked 18 November 2026.
- [SDK `auth-utils.ts`](https://github.com/base44/javascript-sdk/blob/main/packages/sdk/src/utils/auth-utils.ts) — after a redirect login, the client reads the query parameter `access_token`, stores it, and removes it from the address bar. Checked 18 November 2026.
- [Managing login and registration](https://docs.base44.com/Setting-up-your-app/Managing-login-and-registration) — Google sign-in is on by default with Base44's own Google client. A custom Google client, if you ever make one, uses the redirect `https://app.base44.com/api/apps/auth/callback`. That address is Google's return to Base44. It is not the laptop.
- [SDK `client.ts`](https://github.com/base44/javascript-sdk/blob/main/packages/sdk/src/client.ts) — `serverUrl` defaults to `https://base44.app`. Every request sends `X-App-Id`. `createClientFromRequest` reads `Authorization: Bearer <user token>` as the user, and `Base44-Service-Authorization` as the service role. The platform adds the service header when it runs your function. The laptop never sends a service token.
- [`createClientFromRequest`](https://docs.base44.com/developers/references/sdk/docs/functions/createClientFromRequest) — use this at the top of a function, then `base44.auth.me()`.
- [Backend functions](https://docs.base44.com/developers/backend/resources/backend-functions/overview) — a function is `https://<your-app-domain>/functions/<name>`. The docs say a raw HTTP call (a webhook with no user token) has no signed-in user. The laptop does send the user's token. Confirm with the curl below that `auth.me()` sees that user. If it does not, tell us before building the rest of the package.
- [Who can access the app](https://docs.base44.com/Setting-up-your-app/Managing-access) — built-in roles are Admin and User. You can create more roles.
- [User schema](https://docs.base44.com/developers/backend/resources/entities/user-schema) — this page says `role` is `admin` or `user`. The access page and the SDK say an app can define its own role strings. See the check below.

Google sign-in stays on the website. The laptop does not send the browser to Base44 with `from_url` set to `http://127.0.0.1` or to a custom scheme such as `mwhe://`.

Base44 documents `fromUrl` as a path on the app (`/dashboard`, or the current page). The SDK then expects `access_token` on that URL. In 2025 Imperva showed that an unrestricted `from_url` handed the token to whatever host the link named, and Base44 fixed it by checking the return address ([their write-up](https://www.imperva.com/blog/critical-flaws-in-base44-exposed-sensitive-data-and-allowed-account-takeovers/)). There is no documented way to register `127.0.0.1` or a desktop URL scheme as an allowed return address. A deep link (`tauri-plugin-deep-link`) would need that, and the token would also land in an operating-system URL. The laptop does not do that.

One public note, [kodebase's porter](https://kodebase.us/tools/base44-frontend-porter), says a ported app on an arbitrary localhost port was redirected back after Google sign-in. That conflicts with the Imperva fix. It was not checked against MidwestHardEnduro.com. The laptop does not depend on it.

The page you add calls `loginWithProvider("google", "/laptop-signin")`, which is the documented same-site return. The access token stays in that browser. The page asks a function for a one-time code. The laptop sends the code back to the site over HTTPS and receives the token in the response body. The code is bound to a random `state` the laptop created for that attempt. The token is not put on the loopback URL, and it is not logged.

## Check this before the big function

### 1. Roles

In the app dashboard, App Users, each person has a role.

- Race directors: role exactly `race_director`.
- You, and anyone else who should also download a race: role `admin`. The laptop already allows `admin`, lowercase.
- Riders and everyone else: role `user`. They can use the website. They cannot download a race package.

Create the `race_director` role (the access page says extra roles are allowed; ask the AI chat for a role named `race_director` if the dashboard has no button). Then open one director and one rider and confirm the role string. The function compares `user.role` from `auth.me()`, lowercased, to `race_director` and `admin`.

If Base44 will not save anything but `admin` and `user`, give directors `admin` and leave riders as `user`. Tell us. Do not invent a shared password.

### 2. Email and password, and Google

Leave email and password login on. The laptop still has that form.

Leave Google sign-in on. It is the default. Do not create a custom Google client for the laptop, and do not add `127.0.0.1` to a Google Cloud redirect list. Google already returns to Base44. The laptop never talks to Google itself.

Dan's own account was created with Google, so it has no password. `POST /api/apps/<appId>/auth/login` for that account returned HTTP 400. The response body was not saved. The laptop treats HTTP 400 from that call as "this account has no password" and tells the person to use Sign in with Google. A password shorter than 8 characters can also be a 400 on Base44. The sentence on the laptop is the same either way.

### 3. Prove the token arrives

Deploy this function first. Name it `laptopWhoAmI`. It returns the signed-in person and nothing else. Delete it later if you want. The laptop does not call it.

```javascript
import { createClientFromRequest } from "npm:@base44/sdk";

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json(
        { ok: false, error: "unauthorized", message: "Sign in again" },
        { status: 401, headers: cors() },
      );
    }
    return Response.json(
      {
        ok: true,
        email: user.email,
        role: user.role,
        name: user.full_name,
      },
      { headers: cors() },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: "unauthorized", message: "Sign in again" },
      { status: 401, headers: cors() },
    );
  }
}

function cors() {
  return {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type, X-App-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
```

From your own machine, with your real app id, email, and password:

```bash
curl -s -D - -X POST "https://base44.app/api/apps/YOUR_APP_ID/auth/login" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "X-App-Id: YOUR_APP_ID" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

A good login is HTTP 200 and a JSON body with `access_token` and `user`. `user.role` should be `race_director` or `admin`. A wrong password is HTTP 401. An unverified email is HTTP 403. Do not paste the token into chat or into the laptop.

If that POST 404s, try the same path on the website host:

```text
POST https://midwesthardenduro.com/api/apps/YOUR_APP_ID/auth/login
```

The laptop uses `https://base44.app` for live sign-in. If only the website host works, tell us and we will point it there.

Then, with the `access_token` from that response:

```bash
curl -s -D - "https://midwesthardenduro.com/functions/laptopWhoAmI" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

You want `{ "ok": true, "email": "...", "role": "race_director" }` (or `admin`). If `auth.me()` is empty, the gateway did not pass the token through. Stop and tell us. Do not fall back to a shared key.

Repeat the login as a rider. `laptopWhoAmI` may return `role: "user"`. `getRacePackage` must return 403 for that same token.

## getRacePackage

The laptop calls:

```http
GET /functions/getRacePackage?eventId=gnaw-bone-2026 HTTP/1.1
Host: midwesthardenduro.com
Accept: application/json
Authorization: Bearer <that user's access_token>
```

| Piece         | Rule                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------- |
| Method        | `GET`. The sample function also accepts `POST` with `{ "eventId": "..." }` so curl is easy. |
| Path          | `/functions/getRacePackage`                                                                 |
| `eventId`     | Required. The event's id on the site.                                                       |
| Authorization | Required. `Bearer` plus the signed-in user's access token.                                  |
| App id header | Not required on this call. The platform adds `Base44-App-Id` when it runs the function.     |
| Shared key    | Do not accept `apiKey`, `key`, or any shared header. Ignore them if a client sends them.    |

### Authorization

```javascript
const base44 = createClientFromRequest(req);
const user = await base44.auth.me();
```

Allow the call only when `user.role`, lowercased and trimmed, is `race_director` or `admin`. Anyone else gets 403, including a real token for a rider.

No header, a blank token, a token `auth.me()` does not recognize, or a thrown client with no user: 401. Do not put the token in logs or in the response.

Check the role **before** `base44.asServiceRole`. Service role skips entity rules. It is only for reading the series list after you already know the caller is a director or an admin. The platform provides it inside the function. There is no service-role secret to paste into the laptop.

### Success, 200

```json
{
  "ok": true,
  "racePackage": {}
}
```

`racePackage` is a `RacePackage` from `packages/core/src/schemas/race-package.ts`. Extra keys are rejected by the laptop. A complete valid package is in [`examples/getRacePackage.response.json`](examples/getRacePackage.response.json). That file is the sample the local mock serves, and the schema tests parse it.

### `racePackage` fields

| Field                          | Meaning                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                | Always `1`. Older packages that still have `timeLimitMinutes` are read as a timed race.                                                                                |
| `event`                        | `id`, `name`, `date` (`YYYY-MM-DD`), `length`, `checks`.                                                                                                               |
| `event.length`                 | Same length as the primary race. `{ "mode": "time", "minutes": 120 }` or `{ "mode": "laps", "laps": 2 }`. `laps: null` runs until the finish and has no time limit.    |
| `event.checks`                 | The course of the **primary race** (lowest `order`). Each check has `id`, `order` (unique, starting at 1), and `name`.                                                 |
| `races`                        | One or more races. Unique `id` and unique `order`.                                                                                                                     |
| `races[].length`               | One choice, time or laps. The primary race's length **must equal** `event.length`. A time limit is counted from each row's own start.                                  |
| `races[].rowGapSeconds`        | Whole seconds, 0 or more, between row numbers. Defaults to 0 when omitted.                                                                                             |
| `races[].plannedStart`         | When row 1 leaves, ISO-8601 with an offset, or null. Row N leaves at this time plus the gap times (N - 1).                                                             |
| `races[].checks`               | Lap order for that race. The primary race's list **must equal** `event.checks`, same ids, order numbers, names, and array order. Other races may use a shorter course. |
| `races[].startRows`            | At least one row. `id`, `order`, `label`, and `classes`. `order` is the row number across the whole race. A class may be on several rows.                              |
| `classes`                      | The official list, in this order: Pro, A, B, C, +40A, +40B, +40C, Womens, Womens Pro, Electric Sportsman, Electric Pro, 65/85, 50cc.                                   |
| `riders`                       | Series master list. `seriesId`, `name`, `number`, `class`. Numbers are unique across the series, not per class. Series ids are unique.                                 |
| `registrations`                | Who is already in this event. `riderNumber`, `name`, `class`, `seriesId`, `registeredAt`, `assignedRows`. Numbers are unique inside the event.                         |
| `registrations[].registeredAt` | When they signed up, ISO-8601 with an offset, or null. The laptop lines up riders with no start row by this time. See [scoring rules](scoring-rules.md).               |
| `registrations[].assignedRows` | `{ raceId, row }` for each race that assigned a start row. A start row is per race. Empty when none was assigned.                                                      |

Include these contact fields on each series rider and on each registration, copied from the linked Rider row. ScoringRoster has none of them. When a roster rider's number and name do not match a series Rider, leave the fields off and add one warning that the rider has no emergency contact.

| Site field                   | Package field                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `date_of_birth`              | `dateOfBirth` (`YYYY-MM-DD` or omitted)                                                      |
| `phone`                      | `phone`                                                                                      |
| `email`                      | `email`                                                                                      |
| `emergency_contact_name`     | `emergencyContactName`                                                                       |
| `emergency_contact_phone`    | `emergencyContactPhone`                                                                      |
| `emergency_contact_relation` | `emergencyContactRelation`                                                                   |
| `safety_acknowledged`        | `safetyAcknowledged` (boolean) and `safetyAcknowledgedAt` when the site value is a timestamp |

Also send `updatedAt` (ISO-8601) from each record's `updated_date` on the event, each race, each series rider, and each registration. The laptop compares that with the last time someone edited that record on the laptop. The newer one wins. Race-day registrations entered on the laptop are never removed or overwritten.

The laptop stores the contact fields encrypted and does not copy them onto checkpoint phones, into results, or into the changelog.

`seriesId` is `null` only for a day-of entry that is not on the series list. A non-null `seriesId` must be the series rider who owns that number. A day-of number cannot collide with a series rider. The laptop's own day-of sign-ups are **not** in this download. They are created offline and pushed later.

The registration `name` and `class` are what results use that day. They may differ from the series record when someone races a different class.

### Errors

Always return JSON, including on failure. `error` is a stable code. `message` is a short sentence a race director can read.

| HTTP | `error`              | When                                                                                              |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------- |
| 400  | `missing_event_id`   | `eventId` is missing or blank.                                                                    |
| 401  | `unauthorized`       | No bearer token, or the token does not match a user.                                              |
| 403  | `forbidden`          | The user is signed in but is not `race_director` or `admin`.                                      |
| 404  | `event_not_found`    | No event with that id.                                                                            |
| 405  | `method_not_allowed` | Not GET or POST.                                                                                  |
| 409  | `event_not_ready`    | The event has no name or date, no race with checkpoints, or a race length the laptop cannot read. |
| 500  | `server_error`       | Unexpected failure. Do not leak stack traces or rider contact data.                               |

```json
{
  "ok": false,
  "error": "forbidden",
  "message": "This account is not a race director or admin"
}
```

### Function to paste

Create a function named `getRacePackage` and paste [`docs/base44/getRacePackage.js`](base44/getRacePackage.js) over the one on the site. It reads `Event`, `Race`, `ScoringRoster`, `EventRegistration`, and `Rider`. It copies birth date, phone, email, emergency contact, and the safety acknowledgement from Rider. It does not copy a street address.

Unpaid riders are included. Rider numbers are whole numbers only. `?report=1` adds a `report` object for a director checking the download in a browser. The laptop must not send that. The extra key is rejected.

Race length is read only in `readRaceLength`, from the Edit Race fields:

| Site field       | Meaning                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `length_type`    | `"time"` or `"laps"`.                                                                                                                                |
| `length_laps`    | Lap count. `0` or blank means laps are not set. On a lap race, that runs until the finish and does not create a time limit.                          |
| `length_minutes` | Time limit in minutes, counted from each row's own start. Example: Test Race 1 is `length_type` `"time"`, `length_laps` `0`, `length_minutes` `120`. |

`classes[].rows` is how many race-wide rows that class uses (Pro row 1, A rows 2-4). `row_gap_seconds` is the gap. `start_at` is when row 1 leaves. Row N leaves at that time plus the gap times (N - 1).

A start row is per race. The shape to add on `ScoringRoster` (and on `EventRegistration` when a pre-entry has one) is `start_rows: [{ "race_id": "<Race id>", "row": 4 }]`. `race_id` is that Race record's id. `row` is the race-wide row number on that race. Today's `ScoringRoster.start_row` is one number for the whole event. The function uses it only when that rider's class is on exactly one race. Otherwise it is left off and the laptop lines them up by registration time.

`registeredAt` is `created_date` on the ScoringRoster or EventRegistration row that was sent. When both exist for the same rider, the earlier one is sent. Riders with no assigned row line up by that time, earliest first. The same time, or a missing time, breaks by the lower rider number. A missing time sorts after every known time.

If `length_type` is empty, a positive `length_minutes` is sent as a time race and a positive `length_laps` is sent as a lap race. A race with neither is sent as laps until the finish, with a warning, and is not given a 180 minute limit. Both values with no type stops the download until `length_type` is set.

Paste [`docs/base44/getRacePackage.js`](base44/getRacePackage.js) over the `getRacePackage` function. It is the live function plus contact fields, `updatedAt`, and the single warning for a bad roster number.

````

After pasting, download an event from the laptop while signed in as a director, then try again as a rider. The rider must get "This account is not a race director or admin" and the laptop must not keep that download.

## Login errors the laptop already understands

These come from Base44's login endpoint, not from a function you write.

| HTTP | What the director sees                                                             |
| ---- | ---------------------------------------------------------------------------------- |
| 400  | This account was created with Google and has no password. Use Sign in with Google. |
| 401  | That email or password is not right.                                               |
| 403  | This email is not verified yet. Finish sign-in on the website, then try again.     |
| 404  | Sign-in was not found on the site.                                                 |
| 429  | Too many sign-in attempts. Wait a minute and try again.                            |

Base44's own docs say passwords must be 8 to 72 characters. There is no documented lifetime for `access_token`, and the auth module has no refresh method. Plan on the director signing in again when a download returns 401. That can happen on the morning of the race if the token died overnight. Download the package before you leave cell service.

## Sign in with Google

Build three things, then stop. Do not add a shared key. Do not log the access token, the `Authorization` header, or the one-time code.

1. An entity named `LaptopSignInTicket`. Nobody using the website can read it.
2. A function named `laptopSignInCode`. The sign-in page calls it after Google sign-in.
3. A function named `laptopExchangeCode`. The laptop calls it. The browser page does not.
4. A page whose public address is exactly `https://midwesthardenduro.com/laptop-signin`.

The laptop opens that page with `?state=<random>&callback=http://127.0.0.1:<port>/callback`. `state` is 43 to 128 characters from `A-Z`, `a-z`, `0-9`, `-`, and `_`. The callback is optional. The Windows app sends it. The browser preview often does not, and the person types the code instead.

The page signs the person in with Google, asks `laptopSignInCode` for a code, shows the code, and may redirect the browser at the loopback address with `code` and `state` only. It also posts `{ source: "mwhe-laptop-signin", code, state }` to `window.opener` when the laptop opened the page. It never puts `access_token` on that redirect or in that message.

The code is eight characters, shown as `ABCD-EFGH`, from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `I`, `O`, `0`, or `1`). It works once, and only with the same `state`, for ten minutes. The laptop then stores the token the same way email sign-in does, and only when the role is `race_director` or `admin`.

Later, the Android phone can use the same page and the same exchange. The only callback this page may open is a loopback `/callback`. Do not add a custom URL scheme unless we change the laptop.

### Paste this into the Base44 AI chat

```text
Add Google sign-in handoff for the MWHE race laptop. Do not invent a shared API key. Do not log Authorization headers, access tokens, or sign-in codes.

1. Create an entity named exactly LaptopSignInTicket with these fields:
   code_hash (text), state (text), access_token (text), expires_at (text),
   used (boolean), user_id (text), email (text), full_name (text), role (text).
   Row-level security: anonymous and signed-in users cannot create, read, update,
   or delete any row, and cannot read any field. No page lists this entity.
   Only a backend function using asServiceRole may touch it.

2. Create a backend function named exactly laptopSignInCode. Replace its body
   with the laptopSignInCode function from the MWHE site API notes. It requires
   the signed-in user's bearer token, allows only roles race_director and admin,
   and returns { ok: true, code, expiresInSeconds }. It does not return the token.

3. Create a backend function named exactly laptopExchangeCode. Replace its body
   with the laptopExchangeCode function from the MWHE site API notes. The laptop
   calls it with { code, state } and no bearer token. On success it returns
   { ok: true, access_token, user } once. It blanks the stored token and deletes
   the row. It does not log the token.

4. Create a page whose public URL path is exactly /laptop-signin. Use the page
   code from the MWHE site API notes. The page calls
   base44.auth.loginWithProvider("google", "/laptop-signin"). It must not call
   loginWithProvider with a 127.0.0.1 URL or a custom scheme.

When you are done, tell me the published URL of the page. It must be
https://midwesthardenduro.com/laptop-signin.
````

If the chat rewrites the functions, paste the code below yourself. The names have to match. The laptop calls `/functions/laptopExchangeCode` and opens `/laptop-signin`.

### laptopSignInCode

Paste [`docs/base44/laptopSignInCode.js`](base44/laptopSignInCode.js) over `laptopSignInCode`. The only change from the live function is the code lifetime: 10 minutes (`TTL_MS = 600000`, `expiresInSeconds: 600`) instead of 2 minutes.

````

Check the role before `asServiceRole`. The token written into `LaptopSignInTicket` is the caller's own bearer token, read from the request. It is not a service token and not a shared key.

`delete()` moves a row to the entity trash. The function blanks `access_token` before that. Trash and version history may still keep the old value. That part is not something this repo could check. After you try a sign-in, open the entity, empty Recently deleted, and turn off history for this entity if the editor has that switch.

### laptopExchangeCode

```javascript
import { createClientFromRequest } from "npm:@base44/sdk";

const STATE_OK = /^[A-Za-z0-9_-]{43,128}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== "POST") {
    return fail(404, "not_found", "This function is a POST");
  }

  try {
    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    const state = String(body.state || "").trim();
    if (!code || !STATE_OK.test(state)) {
      return fail(
        401,
        "unauthorized",
        "That code is not valid. Sign in with Google again",
      );
    }

    const base44 = createClientFromRequest(req);
    const codeHash = await sha256Hex(code);
    const rows = await base44.asServiceRole.entities.LaptopSignInTicket.filter({
      code_hash: codeHash,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || row.used || !sameText(row.code_hash, codeHash)) {
      return fail(
        401,
        "unauthorized",
        "That code is not valid. Sign in with Google again",
      );
    }
    if (Date.parse(row.expires_at || "") <= Date.now()) {
      await blankAndDelete(base44, row);
      return fail(
        401,
        "unauthorized",
        "That code is not valid. Sign in with Google again",
      );
    }
    if (!STATE_OK.test(String(row.state || "")) || !sameText(String(row.state), state)) {
      return fail(
        401,
        "unauthorized",
        "That code is not valid. Sign in with Google again",
      );
    }

    const token = String(row.access_token || "");
    const role = String(row.role || "")
      .trim()
      .toLowerCase();
    if (!token || (role !== "race_director" && role !== "admin")) {
      await blankAndDelete(base44, row);
      return fail(403, "forbidden", "This account is not a race director or admin");
    }

    await base44.asServiceRole.entities.LaptopSignInTicket.update(row.id, {
      access_token: "",
      used: true,
    });
    await base44.asServiceRole.entities.LaptopSignInTicket.delete(row.id);

    return Response.json(
      {
        ok: true,
        access_token: token,
        user: {
          id: String(row.user_id || ""),
          email: String(row.email || ""),
          full_name: row.full_name ? String(row.full_name) : null,
          role,
        },
      },
      { status: 200, headers: cors() },
    );
  } catch (error) {
    console.error("laptopExchangeCode failed");
    return fail(401, "unauthorized", "That code is not valid. Sign in with Google again");
  }
}

function normalizeCode(value) {
  const compact = String(value || "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (compact.length !== 8) return "";
  for (const character of compact) {
    if (!ALPHABET.includes(character)) return "";
  }
  return compact;
}

function sameText(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function blankAndDelete(base44, row) {
  await base44.asServiceRole.entities.LaptopSignInTicket.update(row.id, {
    access_token: "",
    used: true,
  });
  await base44.asServiceRole.entities.LaptopSignInTicket.delete(row.id);
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fail(status, error, message) {
  return Response.json({ ok: false, error, message }, { status, headers: cors() });
}

function cors() {
  return {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type, X-App-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
````

A wrong code, a wrong state, and an expired code all return the same 401 sentence. A wrong state does not use up the code. The laptop still refuses a `user` role if one is returned.

### Page at /laptop-signin

In the page editor, keep whatever import already provides `base44` if `@/api/base44Client` is not the one this app uses. The rest can be pasted.

Paste [`docs/base44/laptop-signin.jsx`](base44/laptop-signin.jsx) over the `/laptop-signin` page. Keep the app's existing `base44` import if `@/api/base44Client` is not the one this app uses.

What changed: once Google has signed the director in, the page asks for the code and redirects to the laptop without a Continue click. The on-screen line is "You can close this window." The code is a smaller fallback ("Trouble signing in?") and it says ten minutes. The redirect still carries only `code` and `state`. `loginWithProvider` is still called with `/laptop-signin` only.

````

`loginWithProvider` is called with `/laptop-signin` only. The state and the callback stay in `sessionStorage` on `midwesthardenduro.com` while Google and Base44 do their redirects. The first lines drop `access_token` from the address bar without copying it onto the page.

### PowerShell test

Try the mock first. In one terminal run `pnpm mock:site`. In another, paste this into PowerShell. It listens on `127.0.0.1`, opens the mock Google page, and prints the email and role. It does not print the token.

For the live site, change `$Site` after the page and both functions are published. Sign in with Google in the browser window. A Google-created account has no password, so do not use the email form for that test.

```powershell
$ErrorActionPreference = "Stop"
$Site = "http://127.0.0.1:8787"
# $Site = "https://midwesthardenduro.com"

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$state = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$callback = "http://127.0.0.1:$port/callback"
$page = "$Site/laptop-signin?state=$([uri]::EscapeDataString($state))&callback=$([uri]::EscapeDataString($callback))"
Write-Host "Open: $page"
Start-Process $page

$deadline = (Get-Date).AddMinutes(3)
$code = $null
while ((Get-Date) -lt $deadline -and -not $code) {
  if (-not $listener.Pending()) { Start-Sleep -Milliseconds 200; continue }
  $client = $listener.AcceptTcpClient()
  $stream = $client.GetStream()
  $buffer = New-Object byte[] 8192
  $read = $stream.Read($buffer, 0, $buffer.Length)
  $text = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
  $target = (($text -split "`r`n")[0] -split " ")[1]
  $html = "<!doctype html><p>You can close this window and return to MWHE Race Scorer.</p>"
  $payload = [System.Text.Encoding]::UTF8.GetBytes($html)
  $head = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($payload.Length)`r`nConnection: close`r`n`r`n")
  $stream.Write($head, 0, $head.Length)
  $stream.Write($payload, 0, $payload.Length)
  $stream.Flush()
  $client.Close()
  if ($target -notlike "/callback*") { continue }
  if ($target -like "*access_token*") { throw "The page sent a token. Stop and tell us." }
  $query = ($target -split "\?", 2)[1]
  $gotState = ""
  $gotCode = ""
  foreach ($pair in ($query -split "&")) {
    $bits = $pair -split "=", 2
    $name = [uri]::UnescapeDataString($bits[0])
    $value = if ($bits.Length -gt 1) { [uri]::UnescapeDataString($bits[1]) } else { "" }
    if ($name -eq "state") { $gotState = $value }
    if ($name -eq "code") { $gotCode = $value }
  }
  if ($gotState -ne $state) { throw "The sign-in page did not match this attempt." }
  $code = $gotCode
}
$listener.Stop()
if (-not $code) { throw "No code arrived. On the mock, click an account. On the live site, finish Google sign-in." }

$exchange = Invoke-RestMethod -Method Post -Uri "$Site/functions/laptopExchangeCode" -ContentType "application/json" -Body (@{ code = $code; state = $state } | ConvertTo-Json)
if (-not $exchange.ok) { throw "Exchange failed: $($exchange.message)" }
Write-Host "Signed in as $($exchange.user.email), role $($exchange.user.role)"
$token = [string]$exchange.access_token
$exchange = $null
try {
  $who = Invoke-RestMethod -Uri "$Site/functions/laptopWhoAmI" -Headers @{ Authorization = "Bearer $token" }
  if ($who.ok) { Write-Host "laptopWhoAmI: $($who.email), role $($who.role)" }
} catch {
  Write-Host "laptopWhoAmI did not answer. The mock site has no such function. The live site should."
}
Remove-Variable token
````

On the mock page, choose **Continue as Dana Google** or **Continue as Dana Director**. Riley Rider is refused and shows no code. Expect a line like `Signed in as google-rd@example.com, role race_director`.

A second check, still without printing a token: email and password for the Google mock account is HTTP 400.

```powershell
curl.exe -s -D - -X POST "http://127.0.0.1:8787/api/apps/mwhe-local/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"google-rd@example.com\",\"password\":\"not-a-password\"}"
```

The status is 400. The body is `{ "message": "This account has no password" }` on the mock. The live body was not saved; the status Dan saw was 400.

### Not verified against the live site

- The JSON body of that HTTP 400. Only the status was seen.
- That `loginWithProvider("google", "/laptop-signin")` returns to that path on this app. The SDK documents a same-site path. It was not run here.
- That `sessionStorage` is still there when Google returns. It should be, because the site origin does not change. It was not run here.
- That `functions.invoke` returns the JSON body directly. The SDK unwraps the axios body. The page also accepts a `{ data: ... }` wrapper.
- How long a deleted `LaptopSignInTicket` stays in trash or version history. Blank the token, delete the row, then empty Recently deleted.
- That the published path is exactly `/laptop-signin`. If the editor picks another path, rename the page until the address bar matches. Do not change the laptop.
- That the site's content-security policy allows the browser to go to `http://127.0.0.1`. If it does not, the code is still on the page and the laptop has a box for it.
- That `logout("/laptop-signin")` comes back to that page.
- How long `access_token` lasts. There is still no refresh call.
- That the browser preview can call `https://midwesthardenduro.com` (CORS). The Windows app is allowed to. Test live Google sign-in from the Windows app or with the PowerShell above.

## CORS

The Windows app uses the Tauri HTTP client, which does not need CORS. The browser preview (`pnpm dev:laptop`) does.

The mock site sends:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Authorization, Accept, Content-Type, X-App-Id
Access-Control-Allow-Methods: GET, POST, OPTIONS
Cache-Control: no-store
```

Your functions should send the same headers, including on errors and on `OPTIONS`. Whether `https://base44.app` allows the browser preview to call login is not something we could check from here. The Windows app is allowed to call `https://base44.app` and `https://midwesthardenduro.com` by the Tauri capability list. Test live sign-in from the Windows app, or with curl, if the browser preview is blocked.

## Local mock

`pnpm mock:site` serves this contract on `http://127.0.0.1:8787`.

| Email                   | Password         | Role            | What happens                                                                     |
| ----------------------- | ---------------- | --------------- | -------------------------------------------------------------------------------- |
| `rd@example.com`        | `race-day-local` | `race_director` | Email sign-in works. `gnaw-bone-2026` downloads.                                 |
| `admin@example.com`     | `race-day-local` | `admin`         | Email sign-in works. The download works.                                         |
| `rider@example.com`     | `race-day-local` | `user`          | The password is right. The laptop refuses it. Google on the mock refuses it too. |
| `google-rd@example.com` | none             | `race_director` | Email sign-in is HTTP 400. Sign in with Google works.                            |

The app id the dev screen fills in is `mwhe-local`. Any non-empty app id works on the mock.

In `pnpm dev:laptop`, the sign-in card has a developer section, **Use the mock site**. It fills the director email and the test password. Sign in, then import an event from the list. A rider sign-in shows the forbidden message and does not store a token. There is no app id field and no event id field.

**Sign in with Google** on that screen opens `http://127.0.0.1:8787/laptop-signin`. The page is not Google. Pick an account. The browser preview asks you to type the code it shows (it also accepts the code automatically when the page can talk back to the tab). The Windows app listens on `127.0.0.1` and can finish without typing. `google-rd@example.com` has no password: the email form shows the Google message, and the Google button signs that director in.

The mock password is not a MidwestHardEnduro.com password. Do not copy the mock's account list onto the real site. The real site must only accept tokens Base44 issued for a real user.

The dev preview keeps the token in memory. Closing the tab signs you out. The Windows app keeps it in Credential Manager until you sign out, or until a download comes back 401 or 403.
