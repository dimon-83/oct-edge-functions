import type { Middleware } from "./middleware.ts";

export interface Plugin {
  name: string;
  middlewares: Middleware[];
}
