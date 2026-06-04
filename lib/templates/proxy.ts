import { AppError } from "@oct-edge-fns-core/context.ts";
import type { Ctx } from "@oct-edge-fns-core/context.ts";

// Template: proxy
// Usage: Forward requests to an external service
// Replace {{UPSTREAM_URL}} with the target endpoint.

const UPSTREAM_URL = "{{UPSTREAM_URL}}";

export default async function handler(
  req: Request,
  _ctx: Ctx,
): Promise<Response> {
  if (!UPSTREAM_URL || UPSTREAM_URL === "{{UPSTREAM_URL}}") {
    throw new AppError("UPSTREAM_URL is not configured");
  }

  try {
    const url = new URL(req.url);
    const targetUrl = `${UPSTREAM_URL}${url.pathname}${url.search}`;

    const headers = new Headers(req.headers);
    headers.delete("host");

    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    });

    const body = await upstreamRes.arrayBuffer();
    return new Response(body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: upstreamRes.headers,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
