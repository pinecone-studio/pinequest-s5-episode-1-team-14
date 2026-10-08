# Dashboard shell

`/` redirects to `/dashboard`. The `(workspace)` route group shares the sidebar,
header and content frame. Navigation labels are Mongolian. Future Calls,
Bookings, Knowledge, Analytics, Demo and Settings sections are visibly disabled
until their own feature PRs add working routes.

The overview currently shows empty metrics/activity and unknown connection
states. It does not read backend data or imply that an integration is online.
Keep actual data loading, authentication and feature pages in separate PRs.

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
