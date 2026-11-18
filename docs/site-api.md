# Site API

The laptop is the only app that talks to [MidwestHardEnduro.com](https://midwesthardenduro.com). The server functions are **not** in this repo. Build them in Base44 from this page.

People sign in with the email and password they use on the website, or with Google, which is the website's normal sign-in. The laptop gets that person's access token and sends it on later calls. Nobody sees or pastes the token. It is not a shared key. A rider's token is not enough.

An account that was created with Google has no password. Email and password sign-in for that account returns HTTP 400. Use Sign in with Google for that person. Do not make them a second password unless they ask for one.

`publishRaceResults` uses the same `{ ok: true/false }` envelope and comes in a later phase. Do not build it yet.

Field names are **camelCase**, matching `packages/core`. `schemaVersion` is `1`.

## What the laptop does

1. The race director either types their MidwestHardEnduro.com email and password, or clicks **Sign in with Google**.
2. Email and password: the laptop posts those to Base44's login endpoint (the same call the SDK's `loginViaEmailPassword` makes) and reads `access_token` and `user`.
3. Google: the laptop opens the system browser at `https://midwesthardenduro.com/laptop-signin`. The person signs in with Google on the website. The page shows a short code. The laptop trades that code for the same kind of `access_token`. The steps you build for this are in [Sign in with Google](#sign-in-with-google).
4. It keeps the token only when `user.role` is `race_director` or `admin`. A rider is turned away on the laptop, and your function must turn them away again.
5. It stores the token in Windows Credential Manager (`MWHE Race Scorer` / `site-bearer-token`). The browser preview keeps it in memory. The token is not written to SQLite, a file, or the repo. The password is not stored. The one-time code is not stored.
6. It downloads the race with `Authorization: Bearer <that token>`.
7. After the download, registration works with the network off. The laptop does not refresh the token. Base44 does not document a refresh call. When the token is expired or revoked, the site returns 401 and the laptop asks the person to sign in again. The race already on the laptop stays.

Live sign-in goes to `https://base44.app`. That is the SDK's default server. The race download goes to the site address on the Race Prep screen (`https://midwesthardenduro.com` in the packaged app). The local mock is the exception: both calls stay on `http://127.0.0.1:8787`.

The app id is in the Base44 editor URL:

```text
https://app.base44.com/apps/<your-app-id>/editor/...
```

It is not a password. Put it in the App id field once on each laptop. Race directors do not need to know what it means.

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

| Field                      | Meaning                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`            | Always `1`. Older packages that still have `timeLimitMinutes` are read as a timed race.                                                                                |
| `event`                    | `id`, `name`, `date` (`YYYY-MM-DD`), `length`, `checks`.                                                                                                               |
| `event.length`             | Same length as the primary race. `{ "mode": "time", "minutes": 120 }` or `{ "mode": "laps", "laps": 2 }`. `laps: null` runs until the finish and has no time limit.    |
| `event.checks`             | The course of the **primary race** (lowest `order`). Each check has `id`, `order` (unique, starting at 1), and `name`.                                                 |
| `races`                    | One or more races. Unique `id` and unique `order`.                                                                                                                     |
| `races[].length`           | One choice, time or laps. The primary race's length **must equal** `event.length`. A time limit is counted from each row's own start.                                  |
| `races[].rowGapSeconds`    | Whole seconds, 0 or more, between row numbers. Defaults to 0 when omitted.                                                                                             |
| `races[].plannedStart`     | When row 1 leaves, ISO-8601 with an offset, or null. Row N leaves at this time plus the gap times (N - 1).                                                             |
| `races[].checks`           | Lap order for that race. The primary race's list **must equal** `event.checks`, same ids, order numbers, names, and array order. Other races may use a shorter course. |
| `races[].startRows`        | At least one row. `id`, `order`, `label`, and `classes`. `order` is the row number across the whole race. A class may be on several rows.                              |
| `classes`                  | The official list, in this order: Pro, A, B, C, +40A, +40B, +40C, Womens, Womens Pro, Electric Sportsman, Electric Pro, 65/85, 50cc.                                   |
| `riders`                   | Series master list. `seriesId`, `name`, `number`, `class`. Numbers are unique across the series, not per class. Series ids are unique.                                 |
| `registrations`            | Who is already in this event. `riderNumber`, `name`, `class`, `seriesId`, `startRow`. Numbers are unique inside the event.                                             |
| `registrations[].startRow` | Race-wide row number from `ScoringRoster.start_row`, or null. Null riders are placed by number. See [scoring rules](scoring-rules.md).                                 |

Leave out contact fields (email, phone, address, emergency contact). The laptop does not need them, and they must not be copied onto checkpoint phones later.

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

Create a function named `getRacePackage` and paste this over the one on the site. It reads `Event`, `Race`, `ScoringRoster`, `EventRegistration`, and `Rider`. It does not copy email, phone, birth date, address, or emergency contact.

Unpaid riders are included. Rider numbers are whole numbers only. `?report=1` adds a `report` object for a director checking the download in a browser. The laptop must not send that. The extra key is rejected.

Race length is read only in `readRaceLength`, from the Edit Race fields:

| Site field       | Meaning                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `length_type`    | `"time"` or `"laps"`.                                                                                                                                |
| `length_laps`    | Lap count. `0` or blank means laps are not set. On a lap race, that runs until the finish and does not create a time limit.                          |
| `length_minutes` | Time limit in minutes, counted from each row's own start. Example: Test Race 1 is `length_type` `"time"`, `length_laps` `0`, `length_minutes` `120`. |

`classes[].rows` is how many race-wide rows that class uses (Pro row 1, A rows 2-4). `row_gap_seconds` is the gap. `start_at` is when row 1 leaves. Row N leaves at that time plus the gap times (N - 1). `ScoringRoster.start_row` is that race-wide row number.

If `length_type` is empty, a positive `length_minutes` is sent as a time race and a positive `length_laps` is sent as a lap race. A race with neither is sent as laps until the finish, with a warning, and is not given a 180 minute limit. Both values with no type stops the download until `length_type` is set.

```javascript
import { createClientFromRequest } from "npm:@base44/sdk";

// ---------------------------------------------------------------------------
// getRacePackage: builds the race download for the MWHE laptop.
// Reads these entities (read only): Event, Race, ScoringRoster,
// EventRegistration, Rider. It never copies email, phone, birth date,
// address or emergency contact into the response.
// Race length comes from length_type, length_laps, and length_minutes.
// A class may start on several rows (Race.classes[].rows). Row numbers
// run across the race. Row N leaves at start_at plus row_gap_seconds
// times (N - 1). ScoringRoster.start_row is that row number.
// ---------------------------------------------------------------------------

const HUB_ROLES = new Set(["race_director", "admin"]);

// Official class list, in the order the laptop requires.
const RIDER_CLASSES = [
  "Pro",
  "A",
  "B",
  "C",
  "+40A",
  "+40B",
  "+40C",
  "Womens",
  "Womens Pro",
  "Electric Sportsman",
  "Electric Pro",
  "65/85",
  "50cc",
];

// Race length is read in readRaceLength. The Edit Race form uses
// length_type, length_laps, and length_minutes. A lap race with no lap
// count runs until the finish and is not given a time limit.
const MAX_CLASS_ROWS = 30;

// true  = riders marked unpaid are still sent (the laptop has no paid flag).
// false = unpaid riders are left out of the download.
const INCLUDE_UNPAID = true;

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return fail(405, "method_not_allowed", "Use GET");
  }

  let user = null;
  try {
    const base44 = createClientFromRequest(req);
    user = await base44.auth.me();
    if (!user) return fail(401, "unauthorized", "Sign in as a race director or admin");

    const role = String(user.role || "")
      .trim()
      .toLowerCase();
    if (!HUB_ROLES.has(role)) {
      return fail(403, "forbidden", "This account is not a race director or admin");
    }

    const eventId = await readEventId(req);
    if (!eventId) return fail(400, "missing_event_id", "eventId is required");

    // Role is checked above. Service role is only so entity rules cannot hide
    // the series list or the roster from this download.
    const db = base44.asServiceRole.entities;

    const event = await findEvent(db, eventId);
    if (!event) return fail(404, "event_not_found", "No event with id " + eventId);

    const [races, roster, registrations, riders] = await Promise.all([
      fetchAll(db.Race, { event_id: eventId }),
      fetchAll(db.ScoringRoster, { event_id: eventId }),
      fetchAll(db.EventRegistration, { event_id: eventId }),
      fetchAll(db.Rider, null),
    ]);

    const built = buildRacePackage({ event, races, roster, registrations, riders });
    if (built.problem) return fail(409, "event_not_ready", built.problem);

    const wantReport = new URL(req.url).searchParams.get("report") === "1";
    if (wantReport) {
      // For a director checking the download from a browser or PowerShell.
      // The laptop never asks for this. It holds counts and rider numbers only.
      return Response.json(
        { ok: true, racePackage: built.racePackage, report: built.report },
        { status: 200, headers: cors() },
      );
    }
    return Response.json(
      { ok: true, racePackage: built.racePackage },
      { status: 200, headers: cors() },
    );
  } catch (error) {
    // Never log the Authorization header or rider data.
    console.error("getRacePackage failed");
    if (!user) return fail(401, "unauthorized", "Sign in as a race director or admin");
    return fail(500, "server_error", "The race package could not be built");
  }
}

// ----------------------------- loading -------------------------------------

async function readEventId(req) {
  const url = new URL(req.url);
  const fromQuery = (url.searchParams.get("eventId") || "").trim();
  if (fromQuery) return fromQuery;
  if (req.method !== "POST") return "";
  const body = await req.json().catch(() => ({}));
  return String(body.eventId || "").trim();
}

async function findEvent(db, eventId) {
  try {
    const found = await db.Event.filter({ id: eventId });
    return Array.isArray(found) && found.length > 0 ? found[0] : null;
  } catch (error) {
    // A made-up id that is not even shaped like a record id may make the
    // lookup throw. That is "not found", not a server fault.
    if (!/^[0-9a-f]{24}$/i.test(eventId)) return null;
    throw error;
  }
}

// Base44 returns a limited page by default, so ask for pages until done.
async function fetchAll(entity, query) {
  const pageSize = 500;
  const out = [];
  for (let page = 0; page < 20; page += 1) {
    const rows = query
      ? await entity.filter(query, "created_date", pageSize, page * pageSize)
      : await entity.list("created_date", pageSize, page * pageSize);
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// ----------------------------- mapping -------------------------------------

function buildRacePackage({ event, races, roster, registrations, riders }) {
  const warnings = [];
  const warn = (text) => warnings.push(text);

  // ---- event
  const date = String(event.date || "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { problem: "This event has no date. Set a date on the event first." };
  }
  const eventName = clean(event.name);
  if (!eventName) return { problem: "This event has no name." };

  // ---- races (lowest site order becomes the primary race)
  const sortedRaces = [...races].sort(
    (a, b) =>
      numberOr(a.order, 9999) - numberOr(b.order, 9999) ||
      String(a.created_date || "").localeCompare(String(b.created_date || "")),
  );
  const packageRaces = [];
  for (const race of sortedRaces) {
    const label = clean(race.name) || "(unnamed race)";
    const seenChecks = new Set();
    const checks = [];
    for (const point of Array.isArray(race.checkpoints) ? race.checkpoints : []) {
      const id = clean(point && point.id);
      if (!id || seenChecks.has(id)) continue;
      seenChecks.add(id);
      checks.push({
        id,
        order: checks.length + 1,
        name: clean(point.name) || "Checkpoint " + (checks.length + 1),
      });
    }
    if (checks.length === 0) {
      warn("Race '" + label + "' has no checkpoints and was left out.");
      continue;
    }

    const lengthResult = readRaceLength(race, label, warn);
    if (lengthResult.problem) return { problem: lengthResult.problem };

    // classes[].rows is how many race-wide rows that class uses. Pro with
    // 1 row then A with 3 rows becomes row 1 Pro, rows 2-4 A.
    const rows = [];
    const seenClasses = new Set();
    for (const entry of Array.isArray(race.classes) ? race.classes : []) {
      const riderClass = canonicalClass(entry && entry.rider_class);
      if (!riderClass) {
        warn("Race '" + label + "' lists an unknown class and it was skipped.");
        continue;
      }
      if (seenClasses.has(riderClass)) continue;
      seenClasses.add(riderClass);
      const count = classRowCount(entry && entry.rows, label, riderClass, warn);
      for (let i = 0; i < count; i += 1) rows.push({ riderClass });
    }
    const startRows = rows.length
      ? rows.map((row, index) => ({
          id: race.id + ":row-" + (index + 1),
          order: index + 1,
          label: row.riderClass,
          classes: [row.riderClass],
        }))
      : [
          {
            id: race.id + ":row-1",
            order: 1,
            label: "Row 1",
            classes: [...RIDER_CLASSES],
          },
        ];
    if (!rows.length)
      warn("Race '" + label + "' has no classes, so every class is on one row.");

    packageRaces.push({
      id: String(race.id),
      name: clean(race.name) || "Race " + (packageRaces.length + 1),
      order: packageRaces.length + 1,
      length: lengthResult.length,
      rowGapSeconds: readRowGap(race, label, warn),
      plannedStart: readPlannedStart(race, label, warn),
      checks,
      startRows,
    });
  }
  if (packageRaces.length === 0) {
    return {
      problem:
        "This event has no race with checkpoints yet. Add a race and its checkpoints on the site first.",
    };
  }
  const primary = packageRaces[0];

  // ---- series riders (Rider table)
  const seriesRiders = [];
  const seriesByNumber = new Map();
  const ranked = [...riders].sort(
    (a, b) =>
      numberOr(b.series_year, 0) - numberOr(a.series_year, 0) ||
      String(a.created_date || "").localeCompare(String(b.created_date || "")),
  );
  for (const rider of ranked) {
    const status = String(rider.registration_status || "").toLowerCase();
    if (status === "inactive" || status === "cancelled" || status === "canceled")
      continue;
    const number = riderNumber(rider.bike_number);
    const riderClass = canonicalClass(rider.rider_class);
    const name = fullName(rider.first_name, rider.last_name);
    if (!number || !riderClass || !name) {
      warn(
        "Series rider " +
          (clean(rider.bike_number) || "?") +
          " (" +
          (name || "no name") +
          ") has a number or class the laptop cannot use and was left out.",
      );
      continue;
    }
    if (seriesByNumber.has(number)) {
      warn(
        "Series number " +
          number +
          " belongs to more than one rider. Only the first is sent.",
      );
      continue;
    }
    const entry = { seriesId: String(rider.id), name, number, class: riderClass };
    seriesRiders.push(entry);
    seriesByNumber.set(number, entry);
  }
  const seriesById = new Map(seriesRiders.map((r) => [r.seriesId, r]));

  // ---- registrations: race-day roster first, then online pre-entries
  const out = [];
  const usedNumbers = new Set();
  let unpaidCount = 0;

  function addRegistration({
    number,
    name,
    riderClass,
    riderId,
    source,
    unpaid,
    startRow,
  }) {
    if (!number) {
      warn(
        source +
          " '" +
          name +
          "' has a rider number the laptop cannot use (needs a whole number above 0) and was left out.",
      );
      return;
    }
    if (!riderClass) {
      warn(
        source + " #" + number + " '" + name + "' has no valid class and was left out.",
      );
      return;
    }
    if (!name) {
      warn(source + " #" + number + " has no name and was left out.");
      return;
    }
    if (unpaid && !INCLUDE_UNPAID) return;
    if (usedNumbers.has(number)) {
      if (source === "Roster")
        warn("Roster number " + number + " is used twice. Only the first is sent.");
      return;
    }
    const owner = seriesByNumber.get(number);
    let seriesId = null;
    if (owner) {
      const sameRider = riderId ? owner.seriesId === riderId : sameName(owner.name, name);
      if (!sameRider) {
        warn(
          source +
            " #" +
            number +
            " '" +
            name +
            "' uses a number that belongs to series rider '" +
            owner.name +
            "'. It was left out. Fix the number on the site.",
        );
        return;
      }
      seriesId = owner.seriesId;
    }
    usedNumbers.add(number);
    if (unpaid) unpaidCount += 1;
    out.push({
      riderNumber: number,
      name,
      class: riderClass,
      seriesId,
      startRow: assignedStartRow(startRow, source, number, warn),
    });
  }

  for (const row of roster) {
    addRegistration({
      number: riderNumber(row.number),
      name: fullName(row.first_name, row.last_name),
      riderClass: canonicalClass(row.rider_class),
      riderId: null,
      source: "Roster",
      unpaid: row.paid === false || /^unpaid$/i.test(String(row.payment || "")),
      startRow: row.start_row,
    });
  }
  const rosterCount = out.length;

  for (const reg of registrations) {
    if (/cancel|refund/i.test(String(reg.payment_status || ""))) continue;
    const profile = seriesById.get(String(reg.rider_id || ""));
    const number = riderNumber(reg.bike_number) || (profile ? profile.number : null);
    if (usedNumbers.has(number)) continue;
    // Same person already on the roster under another number: skip.
    if (profile && out.some((r) => r.seriesId === profile.seriesId)) continue;
    addRegistration({
      number,
      name: clean(reg.rider_name) || (profile ? profile.name : ""),
      riderClass: canonicalClass(reg.rider_class),
      riderId: reg.rider_id ? String(reg.rider_id) : null,
      source: "Pre-entry",
      unpaid: !/^paid$/i.test(String(reg.payment_status || "")),
      startRow: null,
    });
  }

  for (const reg of out) {
    if (reg.startRow == null) continue;
    const row = primary.startRows.find((item) => item.order === reg.startRow);
    if (!row || row.classes.indexOf(reg.class) === -1) {
      warn(
        "#" +
          reg.riderNumber +
          " is assigned to row " +
          reg.startRow +
          ", which is not a " +
          reg.class +
          " row on " +
          primary.name +
          ". The laptop will place them by number on that race.",
      );
    }
  }

  const racePackage = {
    schemaVersion: 1,
    event: {
      id: String(event.id),
      name: eventName,
      date,
      length: primary.length,
      checks: primary.checks.map((c) => ({ ...c })),
    },
    races: packageRaces,
    classes: [...RIDER_CLASSES],
    riders: seriesRiders,
    registrations: out,
  };

  return {
    racePackage,
    report: {
      eventId: String(event.id),
      races: packageRaces.length,
      seriesRiders: seriesRiders.length,
      registrations: out.length,
      fromRoster: rosterCount,
      fromPreEntry: out.length - rosterCount,
      unpaidIncluded: INCLUDE_UNPAID ? unpaidCount : 0,
      warnings,
    },
  };
}

// ----------------------------- helpers -------------------------------------

// ---------------------------------------------------------------------------
// Race length. Confirmed Edit Race field names. Change only this function
// if the site renames them.
//   length_type     "time" or "laps"
//   length_laps     number; 0 or blank means laps are not set
//   length_minutes  minutes, counted from each row's own start
// Example: length_type "time", length_laps 0, length_minutes 120.
// A lap race never receives a default time limit. Blank laps means the
// race runs until the finish.
// ---------------------------------------------------------------------------
function readRaceLength(race, label, warn) {
  const type = clean(race.length_type).toLowerCase();
  const minutes = positiveInt(race.length_minutes);
  const laps = readOptionalCount(race.length_laps);

  if (type === "time") {
    if (!minutes) {
      return {
        problem:
          "Race '" +
          label +
          "' is a time race but length_minutes is missing or not a whole number above 0.",
      };
    }
    return { length: { mode: "time", minutes: minutes } };
  }
  if (type === "laps") {
    if (laps.bad) {
      return { problem: "Race '" + label + "' has a lap count the laptop cannot use." };
    }
    return { length: { mode: "laps", laps: laps.value } };
  }
  if (type) {
    return {
      problem:
        "Race '" + label + "' has length_type '" + type + "', which is not time or laps.",
    };
  }
  // length_type not filled in. Do not invent a 180 minute limit.
  if (laps.bad) {
    return { problem: "Race '" + label + "' has a lap count the laptop cannot use." };
  }
  if (minutes && laps.value) {
    return {
      problem:
        "Race '" +
        label +
        "' has both length_minutes and length_laps but no length_type. Set length_type to time or laps.",
    };
  }
  if (minutes) return { length: { mode: "time", minutes: minutes } };
  if (laps.value) return { length: { mode: "laps", laps: laps.value } };
  warn(
    "Race '" +
      label +
      "' has no length_type. It is sent as laps until the finish, with no time limit.",
  );
  return { length: { mode: "laps", laps: null } };
}

function readOptionalCount(value) {
  if (
    value === null ||
    value === undefined ||
    clean(value) === "" ||
    value === 0 ||
    value === "0"
  ) {
    return { bad: false, value: null };
  }
  const n = positiveInt(value);
  if (!n) return { bad: true, value: null };
  return { bad: false, value: n };
}

function classRowCount(value, label, riderClass, warn) {
  if (value === null || value === undefined || clean(value) === "") return 1;
  const count = positiveInt(value);
  if (!count) {
    warn(
      "Race '" +
        label +
        "': " +
        riderClass +
        " has a row count the laptop cannot use. One row was sent.",
    );
    return 1;
  }
  if (count > MAX_CLASS_ROWS) {
    warn(
      "Race '" +
        label +
        "': " +
        riderClass +
        " asked for " +
        count +
        " rows. " +
        MAX_CLASS_ROWS +
        " were sent.",
    );
    return MAX_CLASS_ROWS;
  }
  return count;
}

function readRowGap(race, label, warn) {
  const value = race.row_gap_seconds;
  if (value === null || value === undefined || clean(value) === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    warn("Race '" + label + "' has a row gap the laptop cannot use. No gap was sent.");
    return 0;
  }
  return n;
}

function readPlannedStart(race, label, warn) {
  let text = clean(race.start_at);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
    text = text.replace(" ", "T") + "Z";
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) {
    warn(
      "Race '" +
        label +
        "' has a start time the laptop cannot read. No planned start was sent.",
    );
    return null;
  }
  return new Date(ms).toISOString();
}

function assignedStartRow(value, source, number, warn) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const n = positiveInt(value);
  if (!n) {
    warn(
      source +
        " #" +
        number +
        " has a start row the laptop cannot use. They will be placed by number.",
    );
    return null;
  }
  return n;
}

function clean(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

function fullName(first, last) {
  return clean(clean(first) + " " + clean(last));
}

function sameName(a, b) {
  const x = clean(a).toLowerCase();
  const y = clean(b).toLowerCase();
  if (x === y) return true;
  const xs = x.split(" ");
  const ys = y.split(" ");
  return xs[xs.length - 1] === ys[ys.length - 1] && xs[0][0] === ys[0][0];
}

function riderNumber(value) {
  const text = clean(value);
  if (!/^\d{1,6}$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

function canonicalClass(value) {
  const text = clean(value).toLowerCase();
  return RIDER_CLASSES.find((c) => c.toLowerCase() === text) || null;
}

function numberOr(value, fallback) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n)
    ? n
    : fallback;
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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
```

After pasting, download an event from the laptop while signed in as a director, then try again as a rider. The rider must get "This account is not a race director or admin" and the laptop must not keep that download.

## Login errors the laptop already understands

These come from Base44's login endpoint, not from a function you write.

| HTTP | What the director sees                                                             |
| ---- | ---------------------------------------------------------------------------------- |
| 400  | This account was created with Google and has no password. Use Sign in with Google. |
| 401  | That email or password is not right.                                               |
| 403  | This email is not verified yet. Finish sign-in on the website, then try again.     |
| 404  | Sign-in was not found. Check the app id.                                           |
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

The code is eight characters, shown as `ABCD-EFGH`, from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `I`, `O`, `0`, or `1`). It works once, and only with the same `state`, for two minutes. The laptop then stores the token the same way email sign-in does, and only when the role is `race_director` or `admin`.

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
```

If the chat rewrites the functions, paste the code below yourself. The names have to match. The laptop calls `/functions/laptopExchangeCode` and opens `/laptop-signin`.

### laptopSignInCode

```javascript
import { createClientFromRequest } from "npm:@base44/sdk";

const HUB_ROLES = new Set(["race_director", "admin"]);
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STATE_OK = /^[A-Za-z0-9_-]{43,128}$/;
const TTL_MS = 120000;

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== "POST") {
    return fail(404, "not_found", "This function is a POST");
  }

  let user = null;
  try {
    const base44 = createClientFromRequest(req);
    user = await base44.auth.me();
    if (!user) return fail(401, "unauthorized", "Sign in again");
    const role = String(user.role || "")
      .trim()
      .toLowerCase();
    if (!HUB_ROLES.has(role)) {
      return fail(403, "forbidden", "This account is not a race director or admin");
    }

    const body = await req.json().catch(() => ({}));
    const state = String(body.state || "").trim();
    if (!STATE_OK.test(state)) {
      return fail(400, "missing_state", "Open the sign-in page from the laptop");
    }

    const token = bearerToken(req);
    if (!token) return fail(401, "unauthorized", "Sign in again");

    await deleteOldTickets(base44, String(user.id));
    const code = newCode();
    const codeHash = await sha256Hex(code.replace("-", ""));
    await base44.asServiceRole.entities.LaptopSignInTicket.create({
      code_hash: codeHash,
      state,
      access_token: token,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
      used: false,
      user_id: String(user.id),
      email: String(user.email || ""),
      full_name: String(user.full_name || ""),
      role,
    });

    return Response.json(
      { ok: true, code, expiresInSeconds: 120 },
      { status: 200, headers: cors() },
    );
  } catch (error) {
    console.error("laptopSignInCode failed");
    if (!user) return fail(401, "unauthorized", "Sign in again");
    return fail(500, "server_error", "The sign-in code could not be created");
  }
}

function newCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length];
  return raw.slice(0, 4) + "-" + raw.slice(4);
}

async function deleteOldTickets(base44, userId) {
  const rows = await base44.asServiceRole.entities.LaptopSignInTicket.filter({
    user_id: userId,
  });
  const list = Array.isArray(rows) ? rows : [];
  const now = Date.now();
  for (const row of list) {
    const expired = Date.parse(row.expires_at || "") <= now;
    if (!expired && !row.used) continue;
    await base44.asServiceRole.entities.LaptopSignInTicket.update(row.id, {
      access_token: "",
      used: true,
    });
    await base44.asServiceRole.entities.LaptopSignInTicket.delete(row.id);
  }
}

function bearerToken(req) {
  const header = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  return match ? match[1] : "";
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
```

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
```

A wrong code, a wrong state, and an expired code all return the same 401 sentence. A wrong state does not use up the code. The laptop still refuses a `user` role if one is returned.

### Page at /laptop-signin

In the page editor, keep whatever import already provides `base44` if `@/api/base44Client` is not the one this app uses. The rest can be pasted.

```jsx
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const STATE_KEY = "mwhe_laptop_state";
const CALLBACK_KEY = "mwhe_laptop_callback";
const PENDING_KEY = "mwhe_laptop_pending";

export default function LaptopSignIn() {
  const [message, setMessage] = useState("Checking sign-in…");
  const [code, setCode] = useState("");
  const [account, setAccount] = useState(null);

  useEffect(() => {
    const clean = new URL(window.location.href);
    if (clean.searchParams.has("access_token")) {
      clean.searchParams.delete("access_token");
      clean.searchParams.delete("is_new_user");
      window.history.replaceState({}, "", clean.pathname + clean.search + clean.hash);
    }
    const params = clean.searchParams;
    if (params.get("state")) sessionStorage.setItem(STATE_KEY, params.get("state"));
    if (params.has("callback")) {
      sessionStorage.setItem(CALLBACK_KEY, params.get("callback") || "");
    }
    void run();
  }, []);

  async function run() {
    const state = sessionStorage.getItem(STATE_KEY) || "";
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(state)) {
      setMessage("Open this page from MWHE Race Scorer.");
      return;
    }
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (error) {
      user = null;
    }
    if (!user) {
      sessionStorage.setItem(PENDING_KEY, "1");
      base44.auth.loginWithProvider("google", "/laptop-signin");
      return;
    }
    setAccount(user);
    if (sessionStorage.getItem(PENDING_KEY) === "1") {
      await issue(state);
    } else {
      setMessage(
        "Continue to send a code to the laptop, or choose a different Google account.",
      );
    }
  }

  async function issue(state) {
    setMessage("Making a code for the laptop…");
    try {
      const raw = await base44.functions.invoke("laptopSignInCode", { state });
      const body = raw && raw.data && raw.data.ok !== undefined ? raw.data : raw;
      if (!body || body.ok !== true || typeof body.code !== "string") {
        const text = (body && body.message) || "The sign-in code could not be created";
        setMessage(text);
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            { source: "mwhe-laptop-signin", state, error: text },
            "*",
          );
        }
        return;
      }
      sessionStorage.removeItem(PENDING_KEY);
      setCode(body.code);
      setMessage(
        "Type this code into MWHE Race Scorer. It works once and lasts two minutes.",
      );
      const handoff = { source: "mwhe-laptop-signin", code: body.code, state };
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(handoff, "*");
      }
      const callback = allowedCallback(sessionStorage.getItem(CALLBACK_KEY) || "");
      if (callback) {
        const next = new URL(callback);
        next.searchParams.set("code", body.code);
        next.searchParams.set("state", state);
        window.setTimeout(() => window.location.replace(next.toString()), 400);
      }
    } catch (error) {
      const text = (error && error.data && error.data.message) || error.message;
      const sentence = text || "The sign-in code could not be created";
      setMessage(sentence);
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { source: "mwhe-laptop-signin", state, error: sentence },
          "*",
        );
      }
    }
  }

  async function useDifferentAccount() {
    sessionStorage.setItem(PENDING_KEY, "1");
    base44.auth.logout("/laptop-signin");
  }

  return (
    <main>
      <h1>Sign in to the race laptop</h1>
      <p>{message}</p>
      {account && !code ? (
        <p>
          Signed in as {account.email} ({account.role}).
        </p>
      ) : null}
      {code ? <p style={{ fontSize: "2rem", letterSpacing: "0.08em" }}>{code}</p> : null}
      {account && !code ? (
        <p>
          <button
            type="button"
            onClick={() => void issue(sessionStorage.getItem(STATE_KEY) || "")}
          >
            Continue
          </button>
          <button type="button" onClick={() => void useDifferentAccount()}>
            Use a different Google account
          </button>
        </p>
      ) : null}
    </main>
  );
}

function allowedCallback(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return "";
    if (url.pathname !== "/callback") return "";
    if (url.search || url.hash) return "";
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return "";
    return url.toString();
  } catch (error) {
    return "";
  }
}
```

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
```

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

In `pnpm dev:laptop`, Race Prep starts on the mock address. **Fill in the mock site** on Race Prep writes the address, the app id, the director email, the test password, and the event id. Sign in, then download. A rider sign-in shows the forbidden message and does not store a token.

**Sign in with Google** on that screen opens `http://127.0.0.1:8787/laptop-signin`. The page is not Google. Pick an account. The browser preview asks you to type the code it shows (it also accepts the code automatically when the page can talk back to the tab). The Windows app listens on `127.0.0.1` and can finish without typing. `google-rd@example.com` has no password: the email form shows the Google message, and the Google button signs that director in.

The mock password is not a MidwestHardEnduro.com password. Do not copy the mock's account list onto the real site. The real site must only accept tokens Base44 issued for a real user.

The dev preview keeps the token in memory. Closing the tab signs you out. The Windows app keeps it in Credential Manager until you sign out, or until a download comes back 401 or 403.
