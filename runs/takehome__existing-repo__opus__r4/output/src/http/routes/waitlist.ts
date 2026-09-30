import { andThen } from "../../result.ts";
import type { Services } from "../../services/index.ts";
import { asObject, requireString } from "../parse.ts";
import { respond } from "../respond.ts";
import type { Router } from "../router.ts";
import { waitlistPlaceView, waitlistRowView } from "../views.ts";

export function waitlistRoutes(router: Router, services: Services): void {
  router.add("POST", "/sessions/:sessionId/waitlist", ({ sessionId }, body) => {
    const result = andThen(asObject(body), (fields) =>
      andThen(requireString(fields, "memberId"), (memberId) => services.waitlist.join(sessionId!, memberId)),
    );
    return respond(result, 201, waitlistPlaceView);
  });

  router.add("GET", "/sessions/:sessionId/waitlist", ({ sessionId }) =>
    respond(services.waitlist.listForSession(sessionId!), 200, (rows) => ({
      waitlist: rows.map(waitlistRowView),
    })),
  );

  router.add("DELETE", "/sessions/:sessionId/waitlist/:memberId", ({ sessionId, memberId }) =>
    respond(services.waitlist.leave(sessionId!, memberId!), 204, () => undefined),
  );
}
