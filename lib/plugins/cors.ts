import type { Middleware } from "../middleware.ts";

const corsOrigins = (Deno.env.get("CORS_ORIGIN") ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const corsHeaders = "Content-Type, Authorization, Accept";

const corsMiddleware: Middleware = async (req, _ctx, next) => {
  const origin = req.headers.get("Origin");

  const allowedOrigin = !origin || corsOrigins.includes("*")
    ? (origin ?? "*")
    : corsOrigins.includes(origin)
    ? origin
    : null;

  if (req.method === "OPTIONS") {
    const headers = new Headers();
    if (allowedOrigin) {
      headers.set("Access-Control-Allow-Origin", allowedOrigin);
      headers.set("Access-Control-Allow-Methods", corsMethods);
      headers.set("Access-Control-Allow-Headers", corsHeaders);
      headers.set("Access-Control-Max-Age", "86400");
    }
    return new Response(null, { status: 204, headers });
  }

  const resp = await next();

  if (allowedOrigin) {
    const headers = new Headers(resp.headers);
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Vary", "Origin");
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    });
  }

  return resp;
};

export const corsMiddlewares: Middleware[] = [corsMiddleware];

/** Alias for use as a named plugin. */
export const corsPlugin: Middleware[] = corsMiddlewares;
