import type { Middleware } from "../../lib/middleware.ts";
import { AuthError } from "../../lib/context.ts";
import { createClient } from "../../lib/db.ts";

interface CacheEntry {
  jwt: string;
  expiresAt: number;
}

export interface AuthPluginConfig {
  baseUrl?: string;
  cacheTtlMs?: number;
}

export class AuthPlugin {
  readonly #tokenCache = new Map<string, CacheEntry>();
  readonly #baseUrl: string;
  readonly #cacheTtlMs: number;

  constructor(config: AuthPluginConfig = {}) {
    this.#baseUrl = config.baseUrl ??
      Deno.env.get("IA_CSC_BASE_URL") ?? "";
    this.#cacheTtlMs = config.cacheTtlMs ?? 540_000;
  }

  async #exchangePgrestToken(appToken: string): Promise<string> {
    if (!this.#baseUrl) {
      throw new AuthError("IA_CSC_BASE_URL is not configured");
    }

    const resp = await fetch(`${this.#baseUrl}/pgrest-token/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appToken}`,
      },
    });

    if (!resp.ok) {
      throw new AuthError(
        `Token exchange failed: ${resp.status} ${resp.statusText}`,
      );
    }

    const result = await resp.json();
    const token = result?.token;

    if (!token || typeof token !== "string") {
      throw new AuthError(
        "Token exchange failed: response did not contain a valid token",
      );
    }

    return token;
  }

  get middleware(): Middleware {
    return async (_req, ctx, next) => {
      const authHeader = _req.headers.get("Authorization");

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const appToken = authHeader.slice(7);

        const cached = this.#tokenCache.get(appToken);
        if (cached && Date.now() < cached.expiresAt) {
          ctx.db = createClient(cached.jwt);
        } else {
          if (cached) {
            this.#tokenCache.delete(appToken);
          }
          try {
            const jwt = await this.#exchangePgrestToken(appToken);
            this.#tokenCache.set(appToken, {
              jwt,
              expiresAt: Date.now() + this.#cacheTtlMs,
            });
            ctx.db = createClient(jwt);
          } catch (err) {
            if (err instanceof AuthError) throw err;
          }
        }
      }

      return next();
    };
  }

  get middlewares(): Middleware[] {
    return [this.middleware];
  }
}

const defaultAuth = new AuthPlugin();

export const authMiddlewares: Middleware[] = defaultAuth.middlewares;
