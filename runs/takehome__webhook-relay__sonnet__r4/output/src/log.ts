export type Logger = (event: string, fields?: Record<string, unknown>) => void;

/** One JSON object per line on stdout. */
export const jsonLogger: Logger = (event, fields) => {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
};
