import type { PostgrestClient } from "@supabase/postgrest-js";
import type { Logger } from "./logger.ts";

export interface Ctx {
  db?: PostgrestClient;
  user?: { id: number; username: string };
  requestId?: string;
  log?: Logger;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}
