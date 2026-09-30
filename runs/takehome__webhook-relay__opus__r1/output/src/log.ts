export type LogFields = Record<string, unknown>;
export type Logger = (level: 'info' | 'warn' | 'error', msg: string, fields?: LogFields) => void;

/** One JSON object per line on stdout. */
export const jsonLogger: Logger = (level, msg, fields = {}) => {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })}\n`);
};

export const silentLogger: Logger = () => {};
