import { assertEquals } from "@std/assert";
import { AppError, AuthError, ValidationError } from "./context.ts";

Deno.test("AuthError", () => {
  const err = new AuthError("unauthorized");
  assertEquals(err.name, "AuthError");
  assertEquals(err.message, "unauthorized");
  assertEquals(err instanceof Error, true);
});

Deno.test("ValidationError", () => {
  const err = new ValidationError("invalid input");
  assertEquals(err.name, "ValidationError");
  assertEquals(err.message, "invalid input");
  assertEquals(err instanceof Error, true);
});

Deno.test("AppError", () => {
  const err = new AppError("internal error");
  assertEquals(err.name, "AppError");
  assertEquals(err.message, "internal error");
  assertEquals(err instanceof Error, true);
});
