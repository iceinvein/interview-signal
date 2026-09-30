import { all, andThen } from "../../result.ts";
import type { Services } from "../../services/index.ts";
import { asObject, requireInteger, requireString, requireTimestamp } from "../parse.ts";
import { respond } from "../respond.ts";
import type { Router } from "../router.ts";
import { scheduledSessionView, sessionBookingView, sessionView } from "../views.ts";

export function sessionRoutes(router: Router, services: Services): void {
  router.add("POST", "/sessions", (_params, body) => {
    const result = andThen(asObject(body), (fields) => {
      const strings = all([requireString(fields, "title"), requireString(fields, "instructor")]);
      const numbers = all([requireInteger(fields, "durationMinutes"), requireInteger(fields, "capacity")]);
      const startsAt = requireTimestamp(fields, "startsAt");
      return andThen(strings, ([title, instructor]) =>
        andThen(numbers, ([durationMinutes, capacity]) =>
          andThen(startsAt, (start) =>
            services.sessions.schedule({
              title: title!,
              instructor: instructor!,
              startsAt: start,
              durationMinutes: durationMinutes!,
              capacity: capacity!,
            }),
          ),
        ),
      );
    });
    return respond(result, 201, scheduledSessionView);
  });

  router.add("GET", "/sessions", () => ({
    status: 200,
    body: { sessions: services.sessions.listUpcoming().map(sessionView) },
  }));

  router.add("GET", "/sessions/:sessionId", ({ sessionId }) =>
    respond(services.sessions.get(sessionId!), 200, sessionView),
  );

  router.add("PATCH", "/sessions/:sessionId", ({ sessionId }, body) => {
    const result = andThen(asObject(body), (fields) =>
      andThen(requireInteger(fields, "capacity"), (capacity) =>
        services.sessions.changeCapacity(sessionId!, capacity),
      ),
    );
    return respond(result, 200, sessionView);
  });

  // Kept here rather than in bookings.ts because the URL is session-scoped.
  router.add("GET", "/sessions/:sessionId/bookings", ({ sessionId }) =>
    respond(services.bookings.listForSession(sessionId!), 200, (rows) => ({
      bookings: rows.map(sessionBookingView),
    })),
  );
}
