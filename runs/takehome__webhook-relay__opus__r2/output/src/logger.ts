export type LogFields = Record<string, string | number | boolean | undefined>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

/** JSON lines on stdout. Callers must never pass webhook bodies or headers in here. */
export function jsonLogger(write: (line: string) => void = (l) => process.stdout.write(l)): Logger {
  const log = (level: string) => (event: string, fields: LogFields = {}) => {
    write(JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }) + "\n");
  };
  return { info: log("info"), warn: log("warn"), error: log("error") };
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
