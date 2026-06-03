import type { Middleware } from "../middleware.ts";
import { createClient } from "../db.ts";

export interface PgrestTokenProvider {
  getToken(): string | undefined;
}

export function createAuthMiddlewares(
  provider: PgrestTokenProvider,
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
