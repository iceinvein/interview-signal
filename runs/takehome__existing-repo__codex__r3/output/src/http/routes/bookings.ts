import { andThen } from "../../result.ts";
import type { Services } from "../../services/index.ts";
import { asObject, requireString } from "../parse.ts";
import { respond } from "../respond.ts";
import type { Router } from "../router.ts";
import { bookingView } from "../views.ts";

export function bookingRoutes(router: Router, services: Services): void {
  router.add("POST", "/sessions/:sessionId/bookings", ({ sessionId }, body) => {
    const result = andThen(asObject(body), (fields) =>
      andThen(requireString(fields, "memberId"), (memberId) => services.bookings.book(sessionId!, memberId)),
    );
    return respond(result, 201, bookingView);
  });

  router.add("DELETE", "/bookings/:bookingId", ({ bookingId }) =>
    respond(services.bookings.cancel(bookingId!), 200, bookingView),
  );
}
