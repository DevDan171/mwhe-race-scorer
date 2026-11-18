# Site API

The laptop is the only app that talks to [MidwestHardEnduro.com](https://midwesthardenduro.com). The server functions are **not** in this repo. Build them in Base44 from this page.

People sign in with the same email and password they use on the website. The laptop gets that person's access token and sends it on later calls. Nobody sees or pastes the token. It is not a shared key. A rider's token is not enough.

`publishRaceResults` uses the same `{ ok: true/false }` envelope and comes in a later phase. Do not build it yet.

Field names are **camelCase**, matching `packages/core`. `schemaVersion` is `1`.

## What the laptop does

1. The race director types their MidwestHardEnduro.com email and password.
2. The laptop posts those to Base44's login endpoint (the same call the SDK's `loginViaEmailPassword` makes) and reads `access_token` and `user`.
3. It keeps the token only when `user.role` is `race_director` or `admin`. A rider is turned away on the laptop, and your function must turn them away again.
4. It stores the token in Windows Credential Manager (`MWHE Race Scorer` / `site-bearer-token`). The browser preview keeps it in memory. The token is not written to SQLite, a file, or the repo. The password is not stored at all.
5. It downloads the race with `Authorization: Bearer <that token>`.
6. After the download, registration works with the network off. The laptop does not refresh the token. Base44 does not document a refresh call. When the token is expired or revoked, the site returns 401 and the laptop asks the person to sign in again. The race already on the laptop stays.

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
- [SDK `auth.ts`](https://github.com/base44/javascript-sdk/blob/main/packages/sdk/src/modules/auth.ts) — the HTTP call is `POST /api/apps/<appId>/auth/login` with `{ email, password }`. `me()` is `GET /api/apps/<appId>/entities/User/me`.
- [SDK `client.ts`](https://github.com/base44/javascript-sdk/blob/main/packages/sdk/src/client.ts) — `serverUrl` defaults to `https://base44.app`. Every request sends `X-App-Id`. `createClientFromRequest` reads `Authorization: Bearer <user token>` as the user, and `Base44-Service-Authorization` as the service role. The platform adds the service header when it runs your function. The laptop never sends a service token.
- [`createClientFromRequest`](https://docs.base44.com/developers/references/sdk/docs/functions/createClientFromRequest) — use this at the top of a function, then `base44.auth.me()`.
- [Backend functions](https://docs.base44.com/developers/backend/resources/backend-functions/overview) — a function is `https://<your-app-domain>/functions/<name>`. The docs say a raw HTTP call (a webhook with no user token) has no signed-in user. The laptop does send the user's token. Confirm with the curl below that `auth.me()` sees that user. If it does not, tell us before building the rest of the package.
- [Who can access the app](https://docs.base44.com/Setting-up-your-app/Managing-access) — built-in roles are Admin and User. You can create more roles.
- [User schema](https://docs.base44.com/developers/backend/resources/entities/user-schema) — this page says `role` is `admin` or `user`. The access page and the SDK say an app can define its own role strings. See the check below.

Hosted browser login (`loginWithProvider`, `redirectToLogin`) was not used. It redirects the browser and puts `access_token` on the return URL. Email and password is the call Base44 documents for an external app and a form we control. A Tauri or Capacitor app can make that call. It does not need a custom URL scheme.

## Check this before the big function

### 1. Roles

In the app dashboard, App Users, each person has a role.

- Race directors: role exactly `race_director`.
- You, and anyone else who should also download a race: role `admin`. The laptop already allows `admin`, lowercase.
- Riders and everyone else: role `user`. They can use the website. They cannot download a race package.

Create the `race_director` role (the access page says extra roles are allowed; ask the AI chat for a role named `race_director` if the dashboard has no button). Then open one director and one rider and confirm the role string. The function compares `user.role` from `auth.me()`, lowercased, to `race_director` and `admin`.

If Base44 will not save anything but `admin` and `user`, give directors `admin` and leave riders as `user`. Tell us. Do not invent a shared password.

### 2. Email and password

Email and password login is on by default. Leave it on. The laptop does not use Google or the hosted login page.

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

`seriesId` is `null` only for a day-of entry that is not on the series list. A non-null `seriesId` must be the series rider who owns that number. A day-of number cannot collide with a series rider. The laptop's own day-of sign-ups are **not** in this download. They are created offline and pushed later.

The registration `name` and `class` are what results use that day. They may differ from the series record when someone races a different class.

### Errors

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

### Function to paste

Create a function named `getRacePackage`. Paste this, then replace `loadRacePackage`. Until you do, a real event id returns 404, which is safer than returning an empty package the laptop would reject anyway.

`Event`, `Check`, `Race`, `SeriesRider`, and `Registration` below are placeholders. Rename them to your entities. `filter({ id: eventId })` returns an array. Copy field names from the sample JSON. Do not copy email, phone, address, or emergency contact into the object you return.

```javascript
import { createClientFromRequest } from "npm:@base44/sdk";

const HUB_ROLES = new Set(["race_director", "admin"]);

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return fail(405, "method_not_allowed", "Use GET");
  }

  let user;
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

    // Role is already checked. asServiceRole is only so entity rules cannot
    // hide a series rider from this download.
    const racePackage = await loadRacePackage(base44, eventId);
    if (!racePackage) {
      return fail(404, "event_not_found", "No event with id " + eventId);
    }
    return Response.json({ ok: true, racePackage }, { status: 200, headers: cors() });
  } catch (error) {
    // Do not log req.headers.get("Authorization").
    console.error("getRacePackage failed");
    if (!user) return fail(401, "unauthorized", "Sign in as a race director or admin");
    return fail(500, "server_error", "The race package could not be built");
  }
}

async function readEventId(req) {
  const url = new URL(req.url);
  const fromQuery = (url.searchParams.get("eventId") || "").trim();
  if (fromQuery) return fromQuery;
  if (req.method !== "POST") return "";
  const body = await req.json().catch(() => ({}));
  return String(body.eventId || "").trim();
}

async function loadRacePackage(base44, eventId) {
  // Replace this body. A pasted copy returns null, and the function
  // answers 404, until the mapping is filled in.
  //
  // const events = await base44.asServiceRole.entities.Event.filter({ id: eventId });
  // const event = events[0];
  // if (!event) return null;
  //
  // Return one object shaped like docs/examples/getRacePackage.response.json
  // under the racePackage key. schemaVersion is 1.
  void base44;
  void eventId;
  return null;
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

After `loadRacePackage` returns a real package, download `gnaw-bone-2026` (or whatever the event id is) from the laptop while signed in as a director, then try again as a rider. The rider must get "This account is not a race director or admin" and the laptop must not keep that download.

## Login errors the laptop already understands

These come from Base44's login endpoint, not from a function you write.

| HTTP | What the director sees                                                         |
| ---- | ------------------------------------------------------------------------------ |
| 401  | That email or password is not right.                                           |
| 403  | This email is not verified yet. Finish sign-in on the website, then try again. |
| 404  | Sign-in was not found. Check the app id.                                       |
| 429  | Too many sign-in attempts. Wait a minute and try again.                        |

Base44's own docs say passwords must be 8 to 72 characters. There is no documented lifetime for `access_token`, and the auth module has no refresh method. Plan on the director signing in again when a download returns 401. That can happen on the morning of the race if the token died overnight. Download the package before you leave cell service.

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

| Email               | Password         | Role            | What happens                                  |
| ------------------- | ---------------- | --------------- | --------------------------------------------- |
| `rd@example.com`    | `race-day-local` | `race_director` | Sign-in works. `gnaw-bone-2026` downloads.    |
| `admin@example.com` | `race-day-local` | `admin`         | Sign-in works. The download works.            |
| `rider@example.com` | `race-day-local` | `user`          | The password is right. The laptop refuses it. |

The app id the dev screen fills in is `mwhe-local`. Any non-empty app id works on the mock.

In `pnpm dev:laptop`, Race Prep starts on the mock address. **Fill in the mock site** on Race Prep writes the address, the app id, the director email, the test password, and the event id. Sign in, then download. A rider sign-in shows the forbidden message and does not store a token.

The mock password is not a MidwestHardEnduro.com password. Do not copy the mock's account list onto the real site. The real site must only accept tokens Base44 issued for a real user.

The dev preview keeps the token in memory. Closing the tab signs you out. The Windows app keeps it in Credential Manager until you sign out, or until a download comes back 401 or 403.
