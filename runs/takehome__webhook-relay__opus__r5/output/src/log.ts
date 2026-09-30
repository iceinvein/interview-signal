export type Logger = (event: string, fields: Record<string, unknown>) => void;

/** One JSON object per line on stdout. */
export const jsonLogger: Logger = (event, fields) => {
  process.stdout.write(JSON.stringify({ time: new Date().toISOString(), event, ...fields }) + "\n");
};
