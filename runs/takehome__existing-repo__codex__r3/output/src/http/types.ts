export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export interface HttpRequest {
  readonly method: Method;
  readonly path: string;
  readonly body?: unknown;
}

export interface HttpResponse {
  readonly status: number;
  readonly body?: unknown;
}

export type Params = Readonly<Record<string, string>>;

export type Handler = (params: Params, body: unknown) => HttpResponse;
