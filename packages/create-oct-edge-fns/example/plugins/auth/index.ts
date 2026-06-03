/**
 * Project-level auth middleware configuration.
 *
 * Default: reads PGREST_JWT from environment.
 * For production, replace getToken() with a secure implementation
 * (e.g. token exchange, OAuth2, or your own AuthPlugin).
 */

import { createAuthMiddlewares, envTokenProvider } from "@oct-edge-fns/core";

export const authMiddlewares = createAuthMiddlewares(envTokenProvider);
