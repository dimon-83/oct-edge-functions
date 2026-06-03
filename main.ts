import { corsMiddlewares, HttpServer, loggingMiddlewares } from "./lib/mod.ts";
import { authMiddlewares } from "./plugins/auth/index.ts";

const PORT = parseInt(Deno.env.get("PORT") ?? "8080");
const DENO_ENV = Deno.env.get("DENO_ENV") ?? "development";
const MCP_ENABLED = DENO_ENV === "development" || DENO_ENV === "dev";
const FUNCTIONS_DIR = Deno.env.get("FUNCTIONS_DIR") ?? "./functions";

const plugins = [
  ...loggingMiddlewares,
  ...corsMiddlewares,
  ...authMiddlewares,
];

const server = new HttpServer({
  port: PORT,
  functionsDir: FUNCTIONS_DIR,
  plugins,
  mcpEnabled: MCP_ENABLED,
});

await server.start();
