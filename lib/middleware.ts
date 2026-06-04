import type { Ctx } from "./context.ts";
import { AppError, AuthError, ValidationError } from "./context.ts";

export type Middleware = (
  req: Request,
  ctx: Ctx,
  next: () => Promise<Response>,
) => Response | Promise<Response>;

export function compose(
  middlewares: Middleware[],
): (req: Request) => Promise<Response> {
  return (req: Request) => {
    const ctx: Ctx = {};
    let index = -1;

    const dispatch = (i: number): Promise<Response> => {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }
      index = i;
      const fn = middlewares[i];
      if (!fn) {
        return Promise.reject(new Error("no more middleware"));
      }
      try {
        return Promise.resolve(fn(req, ctx, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    };

    return dispatch(0);
  };
}

export const errorMiddleware: Middleware = async (_req, _ctx, next) => {
  try {
    return await next();
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ValidationError) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
    if (err instanceof AppError) {
      return Response.json({ error: err.message }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
};
