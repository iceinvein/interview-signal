export type LogFields = Record<string, string | number | boolean | undefined>;

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

/** One JSON object per line on stdout, ready for any log shipper. */
export function jsonLogger(write: (line: string) => void = (l) => process.stdout.write(l + "\n")): Logger {
  const log = (level: string) => (msg: string, fields: LogFields = {}) =>
    write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
  return { info: log("info"), warn: log("warn"), error: log("error") };
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
