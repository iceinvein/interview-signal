Complete this take-home.

This repository is a small booking API for a group of fitness studios. Read it before you start; the team cares about their conventions.

## The feature: waitlists

Popular classes fill up days in advance, and members currently have to keep refreshing to catch a cancellation. Add a waitlist to each session.

1. `POST /sessions/:sessionId/waitlist` with `{ "memberId": "..." }` adds the member to the end of the session's waitlist. It answers `201` with `{ "sessionId", "memberId", "position", "joinedAt" }`, where `position` is 1 for the front of the queue.
2. A member can only join the waitlist of a session that is full. Answer `409` with these error codes:
   - `session_not_full` if the session still has places (the member should book instead),
   - `already_booked` if the member already has a confirmed place in the session,
   - `already_waitlisted` if the member is already on this session's waitlist,
   - `session_started` if the session has already started.
   Unknown sessions or members answer `404`, as elsewhere in the API.
3. `DELETE /sessions/:sessionId/waitlist/:memberId` removes the member from the waitlist and answers `204`. Everyone behind them moves up one place. A member who is not on the waitlist answers `404`.
4. When a confirmed booking is cancelled, the member at the front of the waitlist is given the freed place automatically: they get a normal confirmed booking and leave the waitlist.
5. `GET /sessions/:sessionId/waitlist` answers `200` with `{ "waitlist": [...] }` in queue order. Front-desk staff use this list on the studio tablets to contact people when a class is about to start, so each entry must include `position`, `memberId`, and the member's `name` and `email`.

Keep the existing tests passing and add tests for the new behaviour. When you are done, summarise what you changed.
