import { systemClock, type Clock } from "./clock.ts";
import { createHttpApp, type HttpApp } from "./http/app.ts";
import { randomIds, type IdGenerator } from "./ids.ts";
import { createMemoryRepositories } from "./repositories/memory/index.ts";
import type { Repositories } from "./repositories/types.ts";
import { createServices, type Services } from "./services/index.ts";

export interface AppOptions {
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly repos?: Repositories;
}

export interface App extends HttpApp {
  readonly services: Services;
  readonly repos: Repositories;
}

// Composition root: the only place concrete repositories are chosen.
export function buildApp(options: AppOptions = {}): App {
  const repos = options.repos ?? createMemoryRepositories();
  const services = createServices({
    repos,
    clock: options.clock ?? systemClock,
    ids: options.ids ?? randomIds,
  });
  const http = createHttpApp(services);
  return { ...http, services, repos };
}
