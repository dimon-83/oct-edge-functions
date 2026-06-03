/**
 * Project-level auth middleware configuration.
 *
 * Default implementation: reads PGREST_JWT from environment.
 * For production, replace getToken() with a secure token provider
 * (e.g. token exchange, OAuth2, or your own AuthPlugin).
 */

import { createAuthMiddlewares, envTokenProvider } from "../../lib/mod.ts";

export const authMiddlewares = createAuthMiddlewares(envTokenProvider);
