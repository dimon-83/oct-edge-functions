import { HttpServer, startCrons } from "@oct-edge-fns/core";
import type { Middleware } from "@oct-edge-fns/core";

// System-level plugins — edit or replace these to customize cross-cutting behavior
import { authMiddlewares } from "./plugins/auth/index.ts";
import { corsPlugin } from "./plugins/cors/index.ts";
import { loggingPlugin } from "./plugins/logging/index.ts";

const PORT = parseInt(Deno.env.get("PORT") ?? "{{PORT_DEV}}");
const DENO_ENV = Deno.env.get("DENO_ENV") ?? "development";
const MCP_ENABLED = DENO_ENV === "development" || DENO_ENV === "dev";
const FUNCTIONS_DIR = Deno.env.get("FUNCTIONS_DIR") ?? "./functions";
const CRONS_DIR = Deno.env.get("CRONS_DIR") ?? "./crons";

const plugins: Middleware[] = [
  ...loggingPlugin,
  ...corsPlugin,
  ...authMiddlewares,
];

const server = new HttpServer({
  port: PORT,
  functionsDir: FUNCTIONS_DIR,
  plugins,
  mcpEnabled: MCP_ENABLED,
});

await startCrons({ cronsDir: CRONS_DIR });

await server.start();
