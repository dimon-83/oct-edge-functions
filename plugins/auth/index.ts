import type { Middleware } from "../../lib/middleware.ts";
import type { Plugin } from "../../lib/plugin.ts";
import { AuthError } from "../../lib/context.ts";
import { createClient } from "../../lib/db.ts";

const IA_CSC_BASE_URL = Deno.env.get("IA_CSC_BASE_URL");
const CACHE_TTL_MS = 540_000;

interface CacheEntry {
  jwt: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CacheEntry>();

async function exchangePgrestToken(appToken: string): Promise<string> {
  if (!IA_CSC_BASE_URL) {
    throw new AuthError("IA_CSC_BASE_URL is not configured");
  }

  const resp = await fetch(`${IA_CSC_BASE_URL}/pgrest-token/exchange`, {
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

const authMiddleware: Middleware = async (_req, ctx, next) => {
  const authHeader = _req.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const appToken = authHeader.slice(7);

    const cached = tokenCache.get(appToken);
    if (cached && Date.now() < cached.expiresAt) {
      ctx.db = createClient(cached.jwt);
    } else {
      if (cached) {
        tokenCache.delete(appToken);
      }
      try {
        const jwt = await exchangePgrestToken(appToken);
        tokenCache.set(appToken, {
          jwt,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        ctx.db = createClient(jwt);
      } catch {
        // Best-effort: ctx.db stays undefined on failure
      }
    }
  }

  return next();
};

export const authPlugin: Plugin = {
  name: "auth",
  middlewares: [authMiddleware],
};
