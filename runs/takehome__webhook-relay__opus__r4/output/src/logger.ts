export type LogFields = Record<string, unknown>;

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

/** One JSON object per line on stdout, which is what most log shippers want. */
export function jsonLogger(write: (line: string) => void = (l) => process.stdout.write(l + "\n")): Logger {
  const log = (level: string) => (msg: string, fields: LogFields = {}) =>
    write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
  return { info: log("info"), warn: log("warn"), error: log("error") };
}

/**
 * Destination URLs are often capabilities themselves (Slack/Zapier-style URLs
 * with a token in the path or query), so only the origin is ever logged.
 */
export function redactUrl(url: URL): string {
  return url.origin;
}
