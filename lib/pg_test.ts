import { assertEquals } from "@std/assert";
import {
  checkColumnType,
  checkDefaultValue,
  checkPolicyExpression,
  checkRoutineBody,
  checkViewQuery,
  quoteIdent,
} from "./pg.ts";

Deno.test("quoteIdent - wraps in double quotes", () => {
  assertEquals(quoteIdent("hello"), '"hello"');
});

Deno.test("quoteIdent - escapes double quotes", () => {
  assertEquals(quoteIdent('he"llo'), '"he""llo"');
});

Deno.test("checkRoutineBody - allows safe body", () => {
  const result = checkRoutineBody("SELECT 1;");
  assertEquals(result, { safe: true });
});

Deno.test("checkRoutineBody - blocks DROP TABLE", () => {
  const result = checkRoutineBody("DROP TABLE users;");
  assertEquals(result.safe, false);
  assertEquals(result.reason!.includes("DROP"), true);
});

Deno.test("checkRoutineBody - blocks TRUNCATE", () => {
  const result = checkRoutineBody("TRUNCATE users;");
  assertEquals(result.safe, false);
});

Deno.test("checkRoutineBody - blocks ALTER SYSTEM", () => {
  const result = checkRoutineBody("ALTER SYSTEM SET something;");
  assertEquals(result.safe, false);
});

Deno.test("checkRoutineBody - allows SELECT with CTE", () => {
  const result = checkRoutineBody("WITH cte AS (SELECT 1) SELECT * FROM cte;");
  assertEquals(result, { safe: true });
});

Deno.test("checkViewQuery - allows SELECT", () => {
  const result = checkViewQuery("SELECT * FROM users");
  assertEquals(result, { safe: true });
});

Deno.test("checkViewQuery - allows WITH CTE", () => {
  const result = checkViewQuery("WITH cte AS (SELECT 1) SELECT * FROM cte");
  assertEquals(result, { safe: true });
});

Deno.test("checkViewQuery - rejects non-SELECT", () => {
  const result = checkViewQuery("DELETE FROM users");
  assertEquals(result.safe, false);
});

Deno.test("checkViewQuery - blocks dangerous in view", () => {
  const result = checkViewQuery("SELECT * FROM users; DROP TABLE users;");
  assertEquals(result.safe, false);
});

Deno.test("checkColumnType - allows standard types", () => {
  assertEquals(checkColumnType("INTEGER"), { safe: true });
  assertEquals(checkColumnType("VARCHAR(255)"), { safe: true });
  assertEquals(checkColumnType("TIMESTAMPTZ"), { safe: true });
  assertEquals(checkColumnType("NUMERIC(10,2)"), { safe: true });
});

Deno.test("checkColumnType - rejects dangerous content", () => {
  const result = checkColumnType("INTEGER); DROP TABLE users; --");
  assertEquals(result.safe, false);
});

Deno.test("checkDefaultValue - safe default", () => {
  assertEquals(checkDefaultValue("NOW()"), { safe: true });
  assertEquals(checkDefaultValue("0"), { safe: true });
  assertEquals(checkDefaultValue("true"), { safe: true });
});

Deno.test("checkDefaultValue - dangerous default", () => {
  const result = checkDefaultValue("pg_sleep(10)");
  assertEquals(result.safe, false);
});

Deno.test("checkPolicyExpression - safe expression", () => {
  const result = checkPolicyExpression("user_id = current_user_id()");
  assertEquals(result, { safe: true });
});

Deno.test("checkPolicyExpression - dangerous expression", () => {
  const result = checkPolicyExpression("DROP TABLE users");
  assertEquals(result.safe, false);
});
