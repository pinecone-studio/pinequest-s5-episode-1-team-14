# Calendar availability and booking

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
1–1440 minutes. Overnight bookings are not supported.

Slots follow a duration-sized grid anchored at the requested start, fit fully
inside the window, and exclude past starts. Overlapping, unsorted, all-day and
cross-day busy intervals block any intersecting slot. Adjacent appointments may
touch at their boundaries. The caller must supply verified opening hours; this
module does not infer opening hours from the absence of events.

## Create a booking

Call `createAppointment` only after the customer confirms the service and time.
The caller supplies verified service details, duration and opening hours; there
is no live-call dispatcher or HTTP endpoint yet.

```ts
import { randomUUID } from "node:crypto";
import { createAppointment } from "./googleCalendar.js";

// Generate and retain this ID ONCE per confirmed booking, before the first call.
const requestId = randomUUID();
const booking = await createAppointment({
  requestId,
  customerName: "Бат",
  phone: "+97699112233",
  serviceId: "consultation",
  serviceName: "Зөвлөгөө",
  startTime: "2030-01-15T01:00:00.000Z", // Use the selected availability slot.
  durationMinutes: 30,
});
// booking: { id, calendarEventId, customerName, phone, serviceId, serviceName,
//            startTime, endTime, durationMinutes, status: "confirmed", source: "AI_PHONE_AGENT" }
```

`startTime` must include an RFC3339 offset and align to a whole minute. Phone
numbers are 8 local digits or `+` followed by 8–15 international digits. Names,
service fields and request IDs must be non-empty text of at most 200 characters
without control characters. The appointment must fit within one local date.

The function rechecks the exact interval using `checkAvailability` before
[inserting an event](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).
It returns a booking only after validating a matching, confirmed provider event.
Events are private and busy, with booking metadata in private extended properties.
No attendee invitations are added. Google Calendar stores the event; this module
returns the booking record without adding a separate local database.

Keep the same `requestId` and payload on every retry. Its hash is the event ID,
following Google's [client-generated ID guidance](https://developers.google.com/workspace/calendar/api/guides/create-events).
The function reads existing events before writing, and reads back that same ID
after insert failures, including timeouts and duplicate-ID responses. A changed
payload or cancelled/malformed event is rejected. On any error, do not announce
success or generate a new ID; retry the same request or inspect the calendar.

Writes are serialized within one backend process. FreeBusy and event insertion
are separate operations: other replicas or external Calendar writers can still
book between them. Use a shared booking lock before running multiple replicas;
coordinate external writers separately. This is not a cross-client reservation.

## Configuration

Enable the Google Calendar API for the service-account project, then share the
business calendar with `GOOGLE_CALENDAR_CLIENT_EMAIL`: at least free/busy access
for availability, and **Make changes to events** (`writer`) for booking creation.
Set that email, `GOOGLE_CALENDAR_PRIVATE_KEY`, and the actual
`GOOGLE_CALENDAR_ID` in `backend/.env`. Use the calendar ID, not `primary` for a
human account. PEM newlines can be literal or escaped as `\n`. Never commit keys.
Availability retains the read-only `calendar.events.freebusy` scope. Booking uses
the separate [calendar.events scope](https://developers.google.com/workspace/calendar/api/auth).
Both SDK clients reuse token caches and apply a 10-second timeout per HTTP request.

No calendar credentials are needed for offline tests. Authentication/API failures,
calendar-level errors, missing/malformed busy data and mismatched response windows
raise errors rather than reporting free slots. SDK request errors are sanitized
to avoid exposing tokens. Availability is a snapshot; creating a booking rechecks
it. The unused `bookAppointment` scaffold has been replaced by `createAppointment`.

```bash
npm run test:calendar --workspace=backend
npm run lint
npm run build:backend
```

Tests mock the SDK request boundary and run in CI. A real-calendar smoke check
still requires credentials and a shared test calendar with writer access. Booking
tests cover creation, retries, overlapping/concurrent requests, invalid input and
configuration, provider errors and malformed events. No new dependency is needed.
