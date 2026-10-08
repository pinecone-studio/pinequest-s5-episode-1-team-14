# Call session storage

`CallSessionStore` persists call metadata in ignored `backend/data/calls.json`,
using the same validated JSON-array and temporary-file replacement approach as
the knowledge store. No credentials or new dependencies are required.

```ts
import { CallSessionStore } from "./store.js";

const calls = new CallSessionStore();
calls.start({
  id: "provider-call-id", // Stable across callbacks/retries for this call.
  callerPhone: "+97699112233", // null for withheld/unavailable caller ID.
  startedAt: "2030-01-15T01:00:00.000Z", // Retain the original event timestamp.
});
calls.update("provider-call-id", { intent: "BOOK_APPOINTMENT" });
// Only after createAppointment() returns a verified booking:
// calls.update("provider-call-id", { bookingId: booking.id });
calls.finish("provider-call-id", {
  status: "completed", // Or "failed" / "handed_off".
  endedAt: "2030-01-15T01:01:30.000Z",
});
const history = calls.list(); // Newest start first; IDs break ties.
const call = calls.get("provider-call-id"); // undefined when absent.
```

Records contain `id`, `callerPhone`, `startedAt`, `endedAt`, `duration`, `intent`,
`status`, `bookingId` and `bookingCreated`. Timestamps use canonical UTC ISO
strings (`.000Z` included). Duration is elapsed **whole seconds**, rounded down
when finishing; active calls have duration `0` and `endedAt: null`. An unknown
intent is `null`; supported classifications are exported as `CALL_INTENTS`.
Phone values are 8 local digits, `+` followed by 8–15 international digits, or
`null`. IDs are non-empty, unpadded text of at most 200 characters, without controls.

Repeated starts with the same ID/phone/start time return the existing record,
including its terminal status. Repeated finishes with the same status/end time
do not rewrite the file. Conflicting start metadata or terminal results fail;
a finished call cannot reopen. Missing sessions cannot be updated or finished.
Intent and booking metadata may arrive after completion. `bookingCreated` is
derived from the booking link; a recorded link cannot be replaced or cleared.
The caller must supply the ID from a successful booking tool result.

Only ENOENT (an absent file) means an empty store. Malformed records, duplicate
IDs and I/O failures propagate without silently resetting existing data. Records
are re-read for every operation, so separate store instances in one process see
the latest changes. Returned objects can be modified without changing the file.

This supports one small-business backend process, one booking link per call and
a small history. Use transactional storage before multiple processes/replicas or
large histories. Mount `backend/data` on persistent storage; an ephemeral disk
does not retain calls across redeploys. Active records survive restarts as active;
reconcile their outcomes with the provider rather than inventing completion.
Call files include phone numbers: keep them server-side with restricted access.

Telephony/AI lifecycle modules are still stubs. This PR provides the storage API;
wiring real callbacks, authenticated HTTP read endpoints, transcripts/audio,
retention and dashboard pages remain separate work.

```bash
npm run test:calls --workspace=backend
npm run test:knowledge --workspace=backend
```

Offline tests cover lifecycle/reopening, repeat callbacks, duration, booking links,
invalid/corrupt data and failed writes. Both stores use the shared file helper;
the existing knowledge regression tests verify that extraction too.
