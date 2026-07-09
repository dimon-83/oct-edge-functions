import type { Middleware } from "../middleware.ts";
import { createClient } from "../db.ts";

export interface PgrestTokenProvider {
  getToken(): string | undefined;
}

export function createAuthMiddlewares(
  provider: PgrestTokenProvider = envTokenProvider,
): Middleware[] {
  return [
    (_req, ctx, next) => {
      const token = provider.getToken();
      if (token) {
        ctx.db = createClient(token);
      }
      return next();
    },
  ];
}

export const envTokenProvider: PgrestTokenProvider = {
  getToken: () => Deno.env.get("PGREST_JWT"),
};

/** Default auth plugin using env PGREST_JWT */
export const authMiddlewares: Middleware[] = createAuthMiddlewares();

/** Alias for creating auth middlewares with a custom token provider. */
export const createAuthPlugin = createAuthMiddlewares;
