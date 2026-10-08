# Calendar availability

`checkAvailability` queries Google's [FreeBusy API](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
for the configured business calendar. It never writes events or confirms bookings.

```ts
import "dotenv/config";
import { checkAvailability } from "./googleCalendar.js";

const result = await checkAvailability({
  date: "2030-01-15",
  timeRange: { start: "09:00", end: "18:00" },
  durationMinutes: 30,
});
// result.timeZone === "Asia/Ulaanbaatar"
// result.slots: [{ startTime: "...Z", endTime: "...Z" }, ...]
```

Times in the input are local `Asia/Ulaanbaatar` clock times. Native IANA timezone
data converts them to instants, independent of the server's timezone. Output
slots use UTC ISO timestamps plus the named business timezone. Invalid dates,
nonexistent/ambiguous local times, reversed/overnight windows and non-integer
durations are rejected. Use `HH:mm` from `00:00` through `23:59`; durations are
1–1440 minutes. Overnight bookings are not supported in this PR.

Slots follow a duration-sized grid anchored at the requested start, fit fully
inside the window, and exclude past starts. Overlapping, unsorted, all-day and
cross-day busy intervals block any intersecting slot. Adjacent appointments may
touch at their boundaries. The caller must supply verified opening hours; this
module does not infer opening hours from the absence of events.

## Configuration

Enable the Google Calendar API for the service-account project, then share the
business calendar with `GOOGLE_CALENDAR_CLIENT_EMAIL` with at least free/busy
access. Set that email, `GOOGLE_CALENDAR_PRIVATE_KEY`, and the actual
`GOOGLE_CALENDAR_ID` in `backend/.env`. Use the calendar ID, not `primary` for a
human account. PEM newlines can be literal or escaped as `\n`. Never commit keys.
The SDK uses the narrow [calendar.events.freebusy scope](https://developers.google.com/workspace/calendar/api/auth),
reuses its token cache, and applies a 10-second timeout per HTTP request.

No calendar credentials are needed for offline tests. Authentication/API failures,
calendar-level errors, missing/malformed busy data and mismatched response windows
raise errors rather than reporting free slots. SDK request errors are sanitized
to avoid exposing tokens. Availability is a snapshot; the booking PR must recheck
conflicts before creating an event. `bookAppointment` remains a separate stub.

```bash
npm run test:calendar --workspace=backend
npm run lint
npm run build:backend
```

Tests mock the SDK request boundary and run in CI. A real-calendar smoke check
still requires credentials and a shared calendar. The existing transitive
`google-auth-library` version is declared directly; no new SDK is introduced.
