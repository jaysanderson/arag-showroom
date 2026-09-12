/** Entrypoint: load env, build the showroom, listen, shut down cleanly. */
import { loadDotEnv, log, readEnv } from "../vendor/arag-platform/src/index.ts";
import { createShowroom } from "./server.ts";

loadDotEnv();
const env = readEnv();
log.level = env.logLevel;
const showroom = await createShowroom(env);
await showroom.app.listen();
log.info("showroom.started", {
  name: showroom.name,
  version: showroom.version,
  port: env.port,
  products: showroom.catalogue.list().length,
  users: showroom.users.count,
});
const shutdown = async () => {
  log.info("showroom.stopping");
  await showroom.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
