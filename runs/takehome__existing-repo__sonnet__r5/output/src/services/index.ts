import { createBookingService, type BookingService } from "./bookingService.ts";
import type { ServiceDeps } from "./deps.ts";
import { createMemberService, type MemberService } from "./memberService.ts";
import { createWaitlistService, type WaitlistService } from "./waitlistService.ts";
import { createSessionService, type SessionService } from "./sessionService.ts";

export interface Services {
  readonly members: MemberService;
  readonly sessions: SessionService;
  readonly bookings: BookingService;
  readonly waitlist: WaitlistService;
}

export function createServices(deps: ServiceDeps): Services {
  return {
    members: createMemberService(deps),
    sessions: createSessionService(deps),
    bookings: createBookingService(deps),
    waitlist: createWaitlistService(deps),
  };
}
