// Copied into the solution as __acceptance__/vitest.config.mjs so the
// acceptance run ignores any vitest config the candidate added.
import { dirname } from "node:path";

export default {
  root: dirname(import.meta.dirname),
  test: {
    include: ["__acceptance__/**/*.test.ts"],
  },
};
