import { createBookingService, type BookingService } from "./bookingService.ts";
import type { ServiceDeps } from "./deps.ts";
import { createMemberService, type MemberService } from "./memberService.ts";
import { createSessionService, type SessionService } from "./sessionService.ts";
import { createWaitlistService, type WaitlistService } from "./waitlistService.ts";

export interface Services {
  readonly members: MemberService;
  readonly sessions: SessionService;
  readonly bookings: BookingService;
  readonly waitlist: WaitlistService;
}

export function createServices(deps: ServiceDeps): Services {
  const bookings = createBookingService(deps);
  return {
    members: createMemberService(deps),
    sessions: createSessionService(deps, bookings),
    bookings,
    waitlist: createWaitlistService(deps),
  };
}
