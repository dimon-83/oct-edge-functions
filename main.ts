import { walk } from "@std/fs";
import { toFileUrl } from "@std/path";
import { compose, errorMiddleware } from "./lib/middleware.ts";
import type { Plugin } from "./lib/plugin.ts";
import type { Ctx } from "./lib/context.ts";

import { authPlugin } from "./plugins/auth/index.ts";
import { corsPlugin } from "./plugins/cors/index.ts";
import { loggingPlugin } from "./plugins/logging/index.ts";

type Pipeline = (req: Request) => Promise<Response>;

interface FunctionModule {
  default?: (req: Request, ctx: Ctx) => Response | Promise<Response>;
  handler?: (req: Request, ctx: Ctx) => Response | Promise<Response>;
}

const FUNCTIONS_DIR = Deno.env.get("FUNCTIONS_DIR") ?? "./functions";
const PORT = parseInt(Deno.env.get("PORT") ?? "8080");

const plugins: Plugin[] = [
  loggingPlugin,
  corsPlugin,
  authPlugin,
];

async function loadRoutes(): Promise<Map<string, Pipeline>> {
  const routes = new Map<string, Pipeline>();
  const functionsDir = await Deno.realPath(FUNCTIONS_DIR);

  for await (const entry of walk(functionsDir, { exts: [".ts", ".js"], includeDirs: false })) {
    const relativePath = entry.path.slice(functionsDir.length);

    if (!relativePath.endsWith("/index.ts") && !relativePath.endsWith("/index.js")) {
      continue;
    }

    let routePath = relativePath
      .replace(/\/index\.(ts|js)$/, "")
      .replace(/\/$/, "");

    if (!routePath.startsWith("/")) routePath = "/" + routePath;

    try {
      const mod: FunctionModule = await import(toFileUrl(entry.path).href);
      const rawHandler = mod.default ?? mod.handler;
      if (typeof rawHandler === "function") {
        const wrapped = async (req: Request, ctx: Ctx, _next: () => Promise<Response>) => rawHandler(req, ctx);
        const pluginMiddlewares = plugins.flatMap(p => p.middlewares);
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
console.log(`\noct-edge-functions running on http://0.0.0.0:${PORT}\n`);

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);
  const cleaned = url.pathname.replace(/\/$/, "") || "/";

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
