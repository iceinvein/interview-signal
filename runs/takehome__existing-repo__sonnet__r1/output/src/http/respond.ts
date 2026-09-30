import type { AppError } from "../errors.ts";
import type { Result } from "../result.ts";
import type { HttpResponse } from "./types.ts";

// The single place an AppError becomes an HTTP status.
export function errorResponse(error: AppError): HttpResponse {
  switch (error.kind) {
    case "validation":
      return { status: 400, body: { error: { code: "validation", field: error.field, message: error.message } } };
    case "not_found":
      return {
        status: 404,
        body: { error: { code: "not_found", message: `${error.entity} ${error.id} does not exist` } },
      };
    case "conflict":
      return { status: 409, body: { error: { code: error.code, message: error.message } } };
  }
}

export function respond<T>(result: Result<T>, status: number, view: (value: T) => unknown): HttpResponse {
  return result.ok ? { status, body: view(result.value) } : errorResponse(result.error);
}
