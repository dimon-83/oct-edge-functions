/**
 * Rate limit plugin — basic per-IP rate limiting using an in-memory store.
 *
 * This is a SYSTEM-LEVEL plugin: it runs on every request before the handler.
 * Configure via env vars:
 *   RATE_LIMIT_WINDOW_MS  — time window in ms (default: 60000 = 1 min)
 *   RATE_LIMIT_MAX        — max requests per window (default: 100)
 */
import type { Middleware } from "@oct-edge-fns/core";

const WINDOW_MS = parseInt(Deno.env.get("RATE_LIMIT_WINDOW_MS") ?? "60000");
const MAX_REQUESTS = parseInt(Deno.env.get("RATE_LIMIT_MAX") ?? "100");

const store = new Map<string, { count: number; resetAt: number }>();

function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

const rateLimitMiddleware: Middleware = async (req, _ctx, next) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";

  const now = Date.now();
  let entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(ip, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    return Response.json(
      { error: "Too Many Requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) } },
    );
  }

  // Periodic cleanup
  if (Math.random() < 0.01) cleanup();

  return await next();
};

export const rateLimitPlugin: Middleware[] = [rateLimitMiddleware];
