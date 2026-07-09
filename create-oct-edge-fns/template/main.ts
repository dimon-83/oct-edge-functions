import { HttpServer, registerTask, startCrons } from "@oct-edge-fns/core";
import type { Middleware } from "@oct-edge-fns/core";
import {
  authMiddlewares,
  corsPlugin,
  loggingPlugin,
  rateLimitPlugin,
} from "@oct-edge-fns/core/plugins";
import helloWorldCron from "./crons/hello-world.ts";

const PORT = parseInt(Deno.env.get("PORT") ?? "18080");
const DENO_ENV = Deno.env.get("DENO_ENV") ?? "development";
const MCP_ENABLED = DENO_ENV === "development" || DENO_ENV === "dev";
const FUNCTIONS_DIR = Deno.env.get("FUNCTIONS_DIR") ?? "./functions";

const plugins: Middleware[] = [
  ...loggingPlugin,
  ...corsPlugin,
  ...rateLimitPlugin,
  ...authMiddlewares,
];

const server = new HttpServer({
  port: PORT,
  functionsDir: FUNCTIONS_DIR,
  plugins,
  mcpEnabled: MCP_ENABLED,
});

registerTask(helloWorldCron);
await startCrons();

await server.start();
