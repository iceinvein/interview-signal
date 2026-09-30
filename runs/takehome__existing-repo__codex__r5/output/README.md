# studio-bookings

Booking API for a small group of fitness studios: members, scheduled class
sessions and bookings. In-memory storage for now; a Postgres implementation of
the repository interfaces is planned.

```sh
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm start         # listens on $PORT, default 3000
```

## API

| Method | Path | Success | Notes |
|---|---|---|---|
| POST | `/members` | 201 member | `{ name, email }` |
| GET | `/members/:memberId` | 200 member | Full record, including email |
| GET | `/members/:memberId/bookings` | 200 `{ bookings }` | Confirmed bookings, by session start |
| POST | `/sessions` | 201 session | `{ title, instructor, startsAt, durationMinutes, capacity }` |
| GET | `/sessions` | 200 `{ sessions }` | Upcoming only, soonest first |
| GET | `/sessions/:sessionId` | 200 session | Includes `spotsLeft` |
| PATCH | `/sessions/:sessionId` | 200 session | `{ capacity }` |
| GET | `/sessions/:sessionId/bookings` | 200 `{ bookings }` | Each with `member: { id, name }` |
| POST | `/sessions/:sessionId/bookings` | 201 booking | `{ memberId }` |
| DELETE | `/bookings/:bookingId` | 200 booking | Cancels; the booking is kept with `status: "cancelled"` |
| POST | `/sessions/:sessionId/waitlist` | 201 waitlist entry | `{ memberId }`; only when full; returns queue position and join time |
| GET | `/sessions/:sessionId/waitlist` | 200 `{ waitlist }` | Queue order, with positions and member details |
| DELETE | `/sessions/:sessionId/waitlist/:memberId` | 204 | Removes a member from the queue |

Errors are `{ "error": { "code": string, "message": string } }` with status
400 (`validation`, plus `field`), 404 (`not_found`) or 409 (a conflict code
such as `session_full`, `already_booked`, `session_started`,
`overlapping_booking`).

Cancelling a confirmed booking gives the freed place to the member at the
front of that session's waitlist. The cancelled booking remains in the audit
trail and the promoted member receives a new confirmed booking.

Timestamps are ISO 8601 and must carry an offset.

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything.
