/**
 * Logging plugin — adds request-scoped logger and logs request duration.
 *
 * This is a SYSTEM-LEVEL plugin: it runs on every request before the handler.
 * Attaches ctx.requestId and ctx.log for downstream handlers to use.
 */
import { loggingMiddlewares } from "@oct-edge-fns/core";
import type { Middleware } from "@oct-edge-fns/core";

export const loggingPlugin: Middleware[] = loggingMiddlewares;
