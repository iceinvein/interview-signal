# Contributing

These rules are what reviewers check. If one gets in the way of what you are
building, raise it in the pull request rather than working around it.

## Layers

```
src/http/          routes, body parsing, response views
src/services/      business rules; the only layer that decides anything
src/repositories/  storage behind interfaces (types.ts), in-memory for now
src/domain/        types and pure functions, no I/O
```

- Routes call services. Routes never import a repository.
- Services receive `ServiceDeps` (`repos`, `clock`, `ids`) and never import
  from `src/http`.
- Repositories store and fetch. They contain no business rules and never
  return a `Result`: a missing row is `undefined`, and the service decides
  whether that is an error.
- New storage means a new interface in `src/repositories/types.ts`, an
  in-memory implementation in `src/repositories/memory/`, and a line in
  `createMemoryRepositories()`. Keep the interface narrow enough that a SQL
  implementation is obvious.
- `src/app.ts` is the only place concrete implementations are chosen.

## Errors

- Expected failures are values: services return `Result<T>` from
  `src/result.ts`, built with `ok()` and `err()`. Do not throw for anything a
  caller could cause (bad input, unknown ids, rule violations).
- `throw` is for bugs only, such as updating a row that does not exist.
- Every failure is an `AppError` from `src/errors.ts`. A new rule violation is
  a new `ConflictCode`; add it to the union rather than reusing a code that
  means something else.
- `src/http/respond.ts` is the only place an `AppError` becomes a status
  code. Routes finish with `respond(result, status, view)`.

## Invariants

- A session never has more confirmed bookings than its capacity. Every
  confirmed booking is created through `BookingService`, which applies all
  the booking rules (started, already booked, full, overlapping). Do not
  insert confirmed bookings from anywhere else.
- Cancelled bookings are kept, never deleted; they are the audit trail.
- Services read time from `clock.now()` and make ids with `ids(prefix)`.
  Never call `Date.now()`, `new Date()` or `randomUUID()` in a service.

## Member data

Member contact details (currently email) are returned only by the
`/members` routes, through `memberView`. Every other response that mentions a
member uses `MemberSummary` (`id` and `name`) through `memberSummaryView`.

This is a commitment in the studios' privacy notice to their members, not a
style preference: session-level endpoints are used by front-desk tablets and
instructor apps, which must not hold members' contact details. Changing it
needs sign-off from the data protection lead, so raise it before writing it.

## Tests

- `npm test` must pass and `npm run typecheck` must be clean.
- Rules are tested at the service level in `test/services/`, using
  `makeWorld()` from `test/fixtures.ts`. Seed state with `world.seedMember()`,
  `world.seedSession()`, `world.seedBooking()` and `world.fill()`, passing
  only the fields the test is about. Do not construct repositories or
  services by hand in a test.
- Assert results with `expectOk(result)` and
  `expectErr(result, kind, code?)`, not by poking at `result.ok`.
- Each route gets an HTTP test in `test/http/` through `makeTestApp()` and
  `request(method, path, body)`, covering the wiring: success status and
  shape, and one representative error. Rule edge cases belong in the
  service tests.
- The clock is pinned at `FIXED_NOW`; express times with `minutesFromNow()`
  and move time with `world.clock.advanceMinutes()`.
- Name tests for the behaviour: `it("rejects a booking when the session is
  full")`. One behaviour per test.
- If the fixtures do not cover what you need, extend `test/fixtures.ts`.
