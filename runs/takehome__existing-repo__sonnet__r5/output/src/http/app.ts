import type { Services } from "../services/index.ts";
import { createRouter } from "./router.ts";
import { bookingRoutes } from "./routes/bookings.ts";
import { memberRoutes } from "./routes/members.ts";
import { sessionRoutes } from "./routes/sessions.ts";
import type { HttpRequest, HttpResponse } from "./types.ts";

export interface HttpApp {
  handle(request: HttpRequest): HttpResponse;
}

export function createHttpApp(services: Services): HttpApp {
  const router = createRouter();
  memberRoutes(router, services);
  sessionRoutes(router, services);
  bookingRoutes(router, services);
  return { handle: (request) => router.handle(request) };
}
