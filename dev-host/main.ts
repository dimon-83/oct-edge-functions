import { corsMiddlewares, createAuthMiddlewares, HttpServer, loggingMiddlewares, startCrons } from "@oct-edge-fns/core";

const PORT = parseInt(Deno.env.get("PORT") ?? "8080");
const DENO_ENV = Deno.env.get("DENO_ENV") ?? "development";
const MCP_ENABLED = DENO_ENV === "development" || DENO_ENV === "dev";
const FUNCTIONS_DIR = Deno.env.get("FUNCTIONS_DIR") ?? "./functions";
const CRONS_DIR = Deno.env.get("CRONS_DIR") ?? "./crons";

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

await startCrons({ cronsDir: CRONS_DIR });

await server.start();
