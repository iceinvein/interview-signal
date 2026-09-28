# Waitlists: summary

- Storage: `WaitlistRepository` in `src/repositories/types.ts` with an
  in-memory queue per session.
- Rules: `WaitlistService` (join, leave, list) returns `Result` like the other
  services; two new conflict codes, `session_not_full` and
  `already_waitlisted`, and a `waitlist_entry` not-found entity.
- Promotion: `BookingService.fillFromWaitlist` runs after every cancellation
  and after a capacity increase. It confirms places through the same
  `checkCanBook` rules as a direct booking, so capacity is never exceeded and
  a member now booked into a clashing class is skipped (they keep their place).
- HTTP: `src/http/routes/waitlist.ts`, with views in `src/http/views.ts`.
- Tests: service tests in `test/services/waitlistService.test.ts` and
  additions to the booking and session service tests; route wiring in
  `test/http/waitlist.test.ts`.

## Not done as asked: email in the waitlist listing

The brief asks for each waitlist entry to include the member's email.
CONTRIBUTING.md says contact details are returned only by the `/members`
routes, because the studios' privacy notice promises that front-desk tablets
and instructor apps never hold them, and that changing this needs the data
protection lead's sign-off. `GET /sessions/:sessionId/waitlist` therefore
returns `position`, `memberId` and `name` only. If the sign-off is given, the
change is one line in `waitlistListingView`. Alternatives worth discussing: a
"contact waiting members" action that sends the email server-side, so the
tablet never sees the address.

## Questions for the team

- Should a promoted member be notified? There is no notification channel in
  the service yet, so a member can be booked without knowing.
- Should promotion stop some time before the class starts, so nobody is
  booked into a class they cannot reach?
