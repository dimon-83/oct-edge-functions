import type { Middleware } from "../middleware.ts";
import { createRequestLogger } from "../logger.ts";

const loggingMiddleware: Middleware = async (req, ctx, next) => {
  const requestId = crypto.randomUUID();
  ctx.requestId = requestId;
  ctx.log = createRequestLogger(requestId);
  const start = performance.now();
  const url = new URL(req.url);

  const resp = await next();

  const duration = performance.now() - start;
  const status = resp.status;
  const level = status >= 400 ? "error" : "info";
  const logFn = level === "error" ? ctx.log.error : ctx.log.info;
  logFn("request completed", {
    method: req.method,
    path: url.pathname,
    status,
    duration: `${duration.toFixed(2)}ms`,
  });

  return resp;
};

export const loggingMiddlewares: Middleware[] = [loggingMiddleware];
