/**
 * CORS plugin — handles Cross-Origin Resource Sharing for all routes.
 *
 * This is a SYSTEM-LEVEL plugin: it runs on every request before the handler.
 * Configure allowed origins via CORS_ORIGIN env var (comma-separated, default: *).
 */
import { corsMiddlewares } from "@oct-edge-fns/core";
import type { Middleware } from "@oct-edge-fns/core";

export const corsPlugin: Middleware[] = corsMiddlewares;
