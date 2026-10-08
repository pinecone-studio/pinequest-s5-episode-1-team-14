# Dashboard shell

`/` redirects to `/dashboard`. The `(workspace)` route group shares the sidebar,
header and content frame. Navigation labels are Mongolian. Future
Knowledge, Analytics, Demo and Settings sections are visibly disabled
until their own feature PRs add working routes.

The overview currently shows empty metrics/activity and unknown connection
states. It does not read backend data or imply that an integration is online.
Keep actual data loading, authentication and remaining feature pages in separate PRs.

Styles use plain CSS and local system fonts; no UI/font dependencies or external
asset requests are added. Small screens use a native `details` menu, while a
skip link, focus indicators and active-page semantics support keyboard users.

From the repository root:

```bash
npm run lint
npm run build:pwa
npm run start --workspace=pwa -- --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100`. Check desktop and 320px mobile layouts; Tab/Enter
the skip link, open/close the mobile menu, and follow the connections anchor.
Disabled future sections must not navigate to missing pages.

An optional assertion-based browser check uses an installed Chrome and temporary
Playwright Core tooling, without adding it to this project's dependency graph.
PowerShell (in another terminal while the production server is running):

```powershell
$browserCheckDir = Join-Path $env:TEMP 'codex-pr11-browser-check'
npm.cmd install --prefix $browserCheckDir --no-package-lock --ignore-scripts --no-audit --no-fund playwright-core@1.64.0
$env:NODE_PATH = Join-Path $browserCheckDir 'node_modules'
node pwa/scripts/check-dashboard.cjs
```

`DASHBOARD_URL` optionally selects a different local server. The check verifies
redirects, keyboard focus, menu behavior, five viewport widths and runtime
errors. It also refreshes the review screenshots in `pwa/docs/`. This optional
browser check is separate from the existing CI lint/build checks.

![Desktop dashboard](docs/dashboard-desktop.png)
![Mobile dashboard](docs/dashboard-mobile.png)

## Calls

`/calls` shows the six call-history fields, phone/ID search, combined status
filtering and expandable end-time/booking details. Times use `Asia/Ulaanbaatar`
regardless of the browser's timezone. Durations are minutes:seconds; active calls
have no final duration. The table scrolls horizontally on narrow screens and is
keyboard focusable. Unknown phone/intent values have explicit labels.

The backend has storage but no call-list HTTP API or authentication yet. The
default view therefore shows a connection-pending empty state. To preview the UI,
set `NEXT_PUBLIC_USE_MOCK_API=true` in `pwa/.env.local` (see `.env.example`) and
restart development or rebuild production. The badge and notice identify every
preview as synthetic. Six centralized fixtures live in `lib/calls.ts`; their
phone numbers, IDs and bookings are invented. No backend files are read or exposed.
Both the service and component reuse the backend `CallSession` via type-only imports.
Replace the service with the reviewed authenticated API in the integration PR;
there is no live refresh, transcript, recording or booking modification here.

Using the same temporary browser tooling and running server described above:

```powershell
# Match the setting used to build the running app: true for demo, false otherwise.
$env:EXPECT_MOCK_CALLS = 'true'
node pwa/scripts/check-calls.cjs
```

Run the check against both builds (`NEXT_PUBLIC_USE_MOCK_API=true` and `false`).
It verifies navigation, all statuses, search/filter reset, unknown values,
keyboard details/scrolling, Ulaanbaatar day boundaries, five widths, the empty
state and browser runtime errors. Demo mode refreshes these review screenshots:

![Desktop calls](docs/calls-desktop.png)
![Mobile calls](docs/calls-mobile.png)

## Bookings

`/bookings` lists customers, phone numbers, services, start times, durations,
statuses and sources. Search by customer, formatted phone, service or booking ID,
and combine the search with a day filter in `Asia/Ulaanbaatar`. All dates use the
same formatter as Calls. Results are ordered by appointment start, earliest first.
Expand a row for booking/service IDs, the Calendar event ID and the end time.

`lib/bookings.ts` reuses the backend `Booking` type through a type-only import.
The current contract supports only `confirmed` and `AI_PHONE_AGENT`; the UI does
not invent cancellation or completion states. The page reuses the Calls table,
filter and responsive styles without adding a UI dependency.

The same `NEXT_PUBLIC_USE_MOCK_API=true` flag enables six explicitly labelled,
synthetic bookings; otherwise the page shows a connection-pending empty state.
These fixtures are not real Calendar events. There is no booking-list API or
authentication yet, so no backend data or credentials are loaded into the page.
Live listing and create/edit/cancel actions belong to a separate integration PR.

With the temporary browser tooling and running app from the instructions above:

```powershell
$env:EXPECT_MOCK_BOOKINGS = 'true' # Match the build's mock flag; also check false.
node pwa/scripts/check-bookings.cjs
```

The browser check covers sorting, search, combined local-day filtering across UTC
midnight, reset/empty results, keyboard details/scrolling, mobile navigation and
five viewport widths. Run the Calls check too when changing the shared formatter.

![Desktop bookings](docs/bookings-desktop.png)
![Mobile bookings](docs/bookings-mobile.png)
