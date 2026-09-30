import type { Repositories } from "../types.ts";
import { createMemoryBookingRepository } from "./bookingRepository.ts";
import { createMemoryMemberRepository } from "./memberRepository.ts";
import { createMemorySessionRepository } from "./sessionRepository.ts";
import { createMemoryWaitlistRepository } from "./waitlistRepository.ts";

export function createMemoryRepositories(): Repositories {
  return {
    members: createMemoryMemberRepository(),
    sessions: createMemorySessionRepository(),
    bookings: createMemoryBookingRepository(),
    waitlist: createMemoryWaitlistRepository(),
  };
}
