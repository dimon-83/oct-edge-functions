import { walk } from "@std/fs";
import { toFileUrl } from "@std/path";
import { compose, errorMiddleware } from "./lib/middleware.ts";
import type { Plugin } from "./lib/plugin.ts";
import type { Ctx } from "./lib/context.ts";

import { authPlugin } from "./plugins/auth/index.ts";
import { corsPlugin } from "./plugins/cors/index.ts";
import { loggingPlugin } from "./plugins/logging/index.ts";

// MCP imports (dev only)
import { handleSseRequest, handleMessageRequest, handleStreamableHttpRequest } from "./lib/mcp/server.ts";
import { loadRegistry } from "./lib/mcp/tools.ts";

type Pipeline = (req: Request) => Promise<Response>;

interface FunctionModule {
  default?: (req: Request, ctx: Ctx) => Response | Promise<Response>;
  handler?: (req: Request, ctx: Ctx) => Response | Promise<Response>;
}

const FUNCTIONS_DIR = Deno.env.get("FUNCTIONS_DIR") ?? "./functions";
const PORT = parseInt(Deno.env.get("PORT") ?? "8080");
const DENO_ENV = Deno.env.get("DENO_ENV") ?? "development";
const MCP_ENABLED = DENO_ENV === "development" || DENO_ENV === "dev";

const plugins: Plugin[] = [
  loggingPlugin,
  corsPlugin,
  authPlugin,
];

async function loadRoutes(): Promise<Map<string, Pipeline>> {
  const routes = new Map<string, Pipeline>();
  const functionsDir = await Deno.realPath(FUNCTIONS_DIR);

  // Load registry to filter by status
  const registry = await loadRegistry();
  const activeFunctions = new Set(
    registry.functions
      .filter((f) => f.status === "active")
      .map((f) => f.name)
  );

  for await (const entry of walk(functionsDir, { exts: [".ts", ".js"], includeDirs: false })) {
    const relativePath = entry.path.slice(functionsDir.length);

    if (!relativePath.endsWith("/index.ts") && !relativePath.endsWith("/index.js")) {
      continue;
    }

    let routePath = relativePath
      .replace(/\/index\.(ts|js)$/, "")
      .replace(/\/$/, "");

    if (!routePath.startsWith("/")) routePath = "/" + routePath;

    // Extract function name from route path (e.g. "/users" -> "users")
    const funcName = routePath.replace(/^\//, "").split("/")[0];

    // Skip inactive functions (only if registry has entries)
    if (registry.functions.length > 0 && !activeFunctions.has(funcName)) {
      console.log(`  [${routePath}] -> SKIPPED (status not active)`);
      continue;
    }

    try {
      const mod: FunctionModule = await import(toFileUrl(entry.path).href);
      const rawHandler = mod.default ?? mod.handler;
      if (typeof rawHandler === "function") {
        const wrapped = async (req: Request, ctx: Ctx, _next: () => Promise<Response>) => rawHandler(req, ctx);
        const pluginMiddlewares = plugins.flatMap((p) => p.middlewares);
        const pipeline = compose([errorMiddleware, ...pluginMiddlewares, wrapped]);
        routes.set(routePath, pipeline);
        console.log(`  [${routePath}] -> ${entry.path}`);
      } else {
        console.warn(`  [${routePath}] -> missing default export or named handler export`);
      }
    } catch (err) {
      console.error(`  [${routePath}] -> load error: ${err}`);
    }
  }

  return routes;
}

const routes = await loadRoutes();

// Log MCP status
if (MCP_ENABLED) {
  console.log(`\n[MCP] SSE endpoint: http://0.0.0.0:${PORT}/mcp/sse`);
  console.log(`[MCP] Message endpoint: http://0.0.0.0:${PORT}/mcp/message?session_id=<id>`);
}

console.log(`\noct-edge-functions running on http://0.0.0.0:${PORT}\n`);

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);
  const cleaned = url.pathname.replace(/\/$/, "") || "/";

  // MCP endpoints (dev only)
  if (MCP_ENABLED) {
    // Handle CORS preflight for MCP endpoints
    if (req.method === "OPTIONS" && (cleaned === "/mcp/sse" || cleaned === "/mcp/message")) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept",
        },
      });
    }
    if (cleaned === "/mcp/sse") {
      return await handleSseRequest(req);
    }
    if (cleaned === "/mcp/message") {
      return await handleMessageRequest(req);
    }
    // Streamable HTTP transport (MCP 2025-06-18)
    if (cleaned === "/mcp") {
      return await handleStreamableHttpRequest(req);
    }
  }

  const pipeline = routes.get(cleaned);

  if (!pipeline) {
    const parts = cleaned.split("/").filter(Boolean);
    for (let i = parts.length - 1; i > 0; i--) {
      const prefix = "/" + parts.slice(0, i).join("/");
      const matched = routes.get(prefix);
      if (matched) {
        return await matched(req);
      }
    }
    return Response.json({ error: "Not Found", path: url.pathname }, { status: 404 });
  }

  return await pipeline(req);
});
