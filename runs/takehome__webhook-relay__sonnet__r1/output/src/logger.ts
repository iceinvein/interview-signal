export type Fields = Record<string, unknown>;

export interface Logger {
  info(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
}

/** One JSON object per line on stdout. */
export const jsonLogger: Logger = {
  info: (msg, fields) => write("info", msg, fields),
  error: (msg, fields) => write("error", msg, fields),
};

export const silentLogger: Logger = { info() {}, error() {} };

function write(level: string, msg: string, fields: Fields = {}): void {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
}
