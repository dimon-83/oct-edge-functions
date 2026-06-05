/**
 * HttpServer — configurable HTTP server with plugin pipeline and MCP support.
 * Extracted from main.ts for testability. Lifecycle: new → start → stop.
 */

import { walk } from "@std/fs";
import { toFileUrl } from "@std/path";
import { compose, errorMiddleware } from "./middleware.ts";
import type { Middleware } from "./middleware.ts";

import {
  handleSseRequest,
  handleMessageRequest,
  handleStreamableHttpRequest,
} from "./mcp/server.ts";
import { loadRegistry } from "./mcp/tools.ts";
import type { FunctionModule, Pipeline } from "./server.types.ts";

export interface ServerConfig {
  port?: number;
  hostname?: string;
  functionsDir?: string;
  plugins?: Middleware[];
  mcpEnabled?: boolean;
}

export class HttpServer {
  private routes: Map<string, Pipeline> = new Map();
  private abortController: AbortController | null = null;
  private started = false;

  constructor(private config: ServerConfig) {}

  private get port(): number {
    return this.config.port ?? 8080;
  }

  private get hostname(): string {
    return this.config.hostname ?? "0.0.0.0";
  }

  private get functionsDir(): string {
    return this.config.functionsDir ?? "./functions";
  }

  private get plugins(): Middleware[] {
    return this.config.plugins ?? [];
  }

  private get mcpEnabled(): boolean {
    return this.config.mcpEnabled ?? false;
  }

  async loadRoutes(): Promise<Map<string, Pipeline>> {
    const functionsDir = await Deno.realPath(this.functionsDir);
    const routes = new Map<string, Pipeline>();

    const registry = await loadRegistry();
    const activeFunctions = new Set(
      registry.functions
        .filter((f) => f.status === "active")
        .map((f) => f.name),
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

      const funcName = routePath.replace(/^\//, "").split("/")[0];

      if (registry.functions.length > 0 && !activeFunctions.has(funcName)) {
        console.log(`  [${routePath}] -> SKIPPED (status not active)`);
        continue;
      }

      try {
        const mod: FunctionModule = await import(toFileUrl(entry.path).href);
        const rawHandler = mod.default ?? mod.handler;
        if (typeof rawHandler === "function") {
          const wrapped: Middleware = async (req, ctx, _next) => rawHandler(req, ctx);
          const pipeline = compose([errorMiddleware, ...this.plugins, wrapped]);
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

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const cleaned = url.pathname.replace(/\/$/, "") || "/";

    if (this.mcpEnabled) {
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
      if (cleaned === "/mcp/sse") return await handleSseRequest(req);
      if (cleaned === "/mcp/message") return await handleMessageRequest(req);
      if (cleaned === "/mcp") return await handleStreamableHttpRequest(req);
    }

    const pipeline = this.routes.get(cleaned);

    if (!pipeline) {
      const parts = cleaned.split("/").filter(Boolean);
      for (let i = parts.length - 1; i > 0; i--) {
        const prefix = "/" + parts.slice(0, i).join("/");
        const matched = this.routes.get(prefix);
        if (matched) return await matched(req);
      }
      return Response.json({ error: "Not Found", path: url.pathname }, { status: 404 });
    }

    return await pipeline(req);
  }

  async start(): Promise<void> {
    if (this.started) throw new Error("Server already started");
    this.started = true;

    this.routes = await this.loadRoutes();

    if (this.mcpEnabled) {
      console.log(`\n[MCP] SSE endpoint: http://${this.hostname}:${this.port}/mcp/sse`);
      console.log(`[MCP] Message endpoint: http://${this.hostname}:${this.port}/mcp/message?session_id=<id>`);
    }

    console.log(`\noct-edge-functions running on http://${this.hostname}:${this.port}\n`);

    this.abortController = new AbortController();
    Deno.serve(
      { port: this.port, hostname: this.hostname, signal: this.abortController.signal },
      (req) => this.handleRequest(req),
    );
  }

  async stop(): Promise<void> {
    this.abortController?.abort();
    this.started = false;
  }

  async getRoutes(): Promise<Map<string, Pipeline>> {
    if (this.routes.size > 0) return this.routes;
    this.routes = await this.loadRoutes();
    return this.routes;
  }

  setRoutes(routes: Map<string, Pipeline>): void {
    this.routes = routes;
  }
}
