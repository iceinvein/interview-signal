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
| POST | `/sessions/:sessionId/waitlist` | 201 `{ sessionId, memberId, position, joinedAt }` | `{ memberId }`; full sessions only |
| DELETE | `/sessions/:sessionId/waitlist/:memberId` | 204 | Those behind move up |
| GET | `/sessions/:sessionId/waitlist` | 200 `{ waitlist }` | Queue order; each with `position`, `memberId`, `joinedAt`, `name` |
| DELETE | `/bookings/:bookingId` | 200 booking | Cancels; the booking is kept with `status: "cancelled"`. The front of the waitlist, if any, is booked into the freed place |

Errors are `{ "error": { "code": string, "message": string } }` with status
400 (`validation`, plus `field`), 404 (`not_found`) or 409 (a conflict code
such as `session_full`, `already_booked`, `session_started`, `session_not_full`, `already_waitlisted`,
`overlapping_booking`).

Timestamps are ISO 8601 and must carry an offset.

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything.
