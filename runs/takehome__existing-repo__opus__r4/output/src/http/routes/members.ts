import { andThen } from "../../result.ts";
import type { Services } from "../../services/index.ts";
import { asObject, requireString } from "../parse.ts";
import { respond } from "../respond.ts";
import type { Router } from "../router.ts";
import { memberBookingView, memberView } from "../views.ts";

export function memberRoutes(router: Router, services: Services): void {
  router.add("POST", "/members", (_params, body) => {
    const result = andThen(asObject(body), (fields) =>
      andThen(requireString(fields, "name"), (name) =>
        andThen(requireString(fields, "email"), (email) => services.members.register({ name, email })),
      ),
    );
    return respond(result, 201, memberView);
  });

  router.add("GET", "/members/:memberId", ({ memberId }) =>
    respond(services.members.get(memberId!), 200, memberView),
  );

  router.add("GET", "/members/:memberId/bookings", ({ memberId }) =>
    respond(services.bookings.listForMember(memberId!), 200, (rows) => ({
      bookings: rows.map(memberBookingView),
    })),
  );
}
