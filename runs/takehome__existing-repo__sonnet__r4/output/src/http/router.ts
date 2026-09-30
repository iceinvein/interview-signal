import type { Handler, HttpRequest, HttpResponse, Method, Params } from "./types.ts";

interface Route {
  readonly method: Method;
  readonly segments: readonly string[];
  readonly handler: Handler;
}

export interface Router {
  add(method: Method, pattern: string, handler: Handler): void;
  handle(request: HttpRequest): HttpResponse;
}

export function createRouter(): Router {
  const routes: Route[] = [];

  return {
    add(method, pattern, handler) {
      routes.push({ method, segments: split(pattern), handler });
    },

    handle(request) {
      const segments = split(request.path);
      let pathMatched = false;
      for (const route of routes) {
        const params = match(route.segments, segments);
        if (!params) continue;
        pathMatched = true;
        if (route.method === request.method) return route.handler(params, request.body);
      }
      if (pathMatched) {
        return { status: 405, body: { error: { code: "method_not_allowed", message: `${request.method} is not supported here` } } };
      }
      return { status: 404, body: { error: { code: "route_not_found", message: `no route for ${request.path}` } } };
    },
  };
}

function split(path: string): string[] {
  return path.split("?")[0]!.split("/").filter((segment) => segment.length > 0);
}

function match(pattern: readonly string[], actual: readonly string[]): Params | undefined {
  if (pattern.length !== actual.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, part] of pattern.entries()) {
    const value = actual[index]!;
    if (part.startsWith(":")) {
      params[part.slice(1)] = decodeURIComponent(value);
    } else if (part !== value) {
      return undefined;
    }
  }
  return params;
}
