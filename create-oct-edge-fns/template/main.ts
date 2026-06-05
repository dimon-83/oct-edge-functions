import { HttpServer } from "@oct-edge-fns/core";
import { createAuthMiddlewares, corsMiddlewares, loggingMiddlewares } from "@oct-edge-fns/core";

const PORT = parseInt(Deno.env.get("PORT") ?? "{{PORT_DEV}}");
const DENO_ENV = Deno.env.get("DENO_ENV") ?? "development";
const MCP_ENABLED = DENO_ENV === "development" || DENO_ENV === "dev";
const FUNCTIONS_DIR = Deno.env.get("FUNCTIONS_DIR") ?? "./functions";

const plugins = [
  ...loggingMiddlewares,
  ...corsMiddlewares,
  ...createAuthMiddlewares(),
];

const server = new HttpServer({
  port: PORT,
  functionsDir: FUNCTIONS_DIR,
  plugins,
  mcpEnabled: MCP_ENABLED,
});

await server.start();
