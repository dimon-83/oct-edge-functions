/**
 * Auth plugin — injects a PostgREST client into ctx.db using a JWT token.
 *
 * This is a SYSTEM-LEVEL plugin: it runs on every request before the handler.
 * Configure the token source via PGREST_JWT env var or pass a custom provider.
 */
import { createAuthMiddlewares, envTokenProvider } from "@oct-edge-fns/core";
import type { PgrestTokenProvider, Middleware } from "@oct-edge-fns/core";

export type { PgrestTokenProvider };
export { envTokenProvider };

/**
 * Create auth middlewares with a custom token provider.
 * Default: reads PGREST_JWT from environment.
 */
export function createAuthPlugin(
  provider: PgrestTokenProvider = envTokenProvider,
): Middleware[] {
  return createAuthMiddlewares(provider);
}

/** Default auth plugin using env PGREST_JWT */
export const authMiddlewares: Middleware[] = createAuthMiddlewares();
