import { buildApp } from "./app.ts";
import { createNodeServer } from "./http/server.ts";

const port = Number(process.env.PORT ?? 3000);
createNodeServer(buildApp()).listen(port, () => {
  console.log(`studio-bookings listening on :${port}`);
});
