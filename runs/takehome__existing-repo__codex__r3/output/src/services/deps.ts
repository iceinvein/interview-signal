import type { Clock } from "../clock.ts";
import type { IdGenerator } from "../ids.ts";
import type { Repositories } from "../repositories/types.ts";

export interface ServiceDeps {
  readonly repos: Repositories;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}
