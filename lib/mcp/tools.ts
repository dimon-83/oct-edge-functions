/**
 * MCP Tools implementation for oct-edge-functions.
 * Provides agent-driven function lifecycle management.
 */

import { join } from "@std/path";
import {
  executeSql,
  quoteIdent,
  checkRoutineBody,
  checkViewQuery,
  checkColumnType,
  checkDefaultValue,
  checkPolicyExpression,
} from "../pg.ts";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type FunctionStatus = "draft" | "testing" | "active" | "deprecated" | "archived";

export interface FunctionMeta {
  name: string;
  path: string;
  status: FunctionStatus;
  version: string;
  created_at: string;
  updated_at: string;
  history: ChangelogEntry[];
}

export interface ChangelogEntry {
  version: string;
  status: FunctionStatus;
  changed_at: string;
  reason: string;
}

export interface FunctionRegistry {
  functions: FunctionMeta[];
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    context?: Record<string, unknown>;
  };
}

// ------------------------------------------------------------------
// Registry helpers
// ------------------------------------------------------------------

const REGISTRY_PATH = "./functions.json";
const FUNCTIONS_DIR = "./functions";

export async function loadRegistry(): Promise<FunctionRegistry> {
  try {
    const text = await Deno.readTextFile(REGISTRY_PATH);
    return JSON.parse(text) as FunctionRegistry;
  } catch {
    return { functions: [] };
  }
}

export async function saveRegistry(registry: FunctionRegistry): Promise<void> {
  await Deno.writeTextFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function bumpVersion(current: string, bump: "major" | "minor" | "patch"): string {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

// ------------------------------------------------------------------
// Tools
// ------------------------------------------------------------------

export async function listFunctions(): Promise<ToolResult> {
  const registry = await loadRegistry();
  return {
    success: true,
    data: registry.functions.map((f) => ({
      name: f.name,
      status: f.status,
      version: f.version,
      updated_at: f.updated_at,
    })),
  };
}

export async function getFunction(args: { name: string }): Promise<ToolResult> {
  const registry = await loadRegistry();
  const meta = registry.functions.find((f) => f.name === args.name);
  if (!meta) {
    return { success: false, error: { code: "NOT_FOUND", message: `Function '${args.name}' not found` } };
  }

  const codePath = join(meta.path, "index.ts");
  let code = "";
  try {
    code = await Deno.readTextFile(codePath);
  } catch {
    code = "// Code file not found";
  }

  return {
    success: true,
    data: { meta, code },
  };
}

export async function createFunction(args: {
  name: string;
  template: "crud" | "query" | "proxy" | "transform";
  description?: string;
  spec?: {
    table_name?: string;
    upstream_url?: string;
  };
}): Promise<ToolResult> {
  const registry = await loadRegistry();

  if (registry.functions.find((f) => f.name === args.name)) {
    return { success: false, error: { code: "ALREADY_EXISTS", message: `Function '${args.name}' already exists` } };
  }

  const funcDir = join(FUNCTIONS_DIR, args.name);
  await Deno.mkdir(funcDir, { recursive: true });

  // Load template
  const templatePath = join("lib", "templates", `${args.template}.ts`);
  let templateCode = await Deno.readTextFile(templatePath);

  // Replace placeholders
  if (args.spec?.table_name) {
    templateCode = templateCode.replace(/\{\{TABLE_NAME\}\}/g, args.spec.table_name);
  }
  if (args.spec?.upstream_url) {
    templateCode = templateCode.replace(/\{\{UPSTREAM_URL\}\}/g, args.spec.upstream_url);
  }

  const indexPath = join(funcDir, "index.ts");
  await Deno.writeTextFile(indexPath, templateCode);

  // Lint check
  const lintResult = await runLint(indexPath);
  if (!lintResult.success) {
    return {
      success: false,
      error: {
        code: "LINT_ERROR",
        message: `Generated code failed lint check`,
        context: { lint_output: lintResult.output },
      },
    };
  }

  // Register
  const now = new Date().toISOString();
  const meta: FunctionMeta = {
    name: args.name,
    path: `functions/${args.name}`,
    status: "draft",
    version: "0.0.0",
    created_at: now,
    updated_at: now,
    history: [],
  };
  registry.functions.push(meta);
  await saveRegistry(registry);

  return {
    success: true,
    data: { meta, code: templateCode },
  };
}

export async function writeTests(args: { name: string }): Promise<ToolResult> {
  const registry = await loadRegistry();
  const meta = registry.functions.find((f) => f.name === args.name);
  if (!meta) {
    return { success: false, error: { code: "NOT_FOUND", message: `Function '${args.name}' not found` } };
  }

  const testPath = join(meta.path, "test.ts");

  // Generate a basic test scaffold based on the function code
  const indexPath = join(meta.path, "index.ts");
  const code = await Deno.readTextFile(indexPath);

  // Simple heuristic: detect HTTP methods used
  const methods: string[] = [];
  if (code.includes('case "GET"')) methods.push("GET");
  if (code.includes('case "POST"')) methods.push("POST");
  if (code.includes('case "PATCH"')) methods.push("PATCH");
  if (code.includes('case "DELETE"')) methods.push("DELETE");

  const testCode = `import { runHandler, assertStatus } from "../../lib/testing.ts";
import handler from "./index.ts";

Deno.test("${args.name} - should handle GET", async () => {
  const res = await runHandler(handler, { method: "GET", path: "/${args.name}" });
  assertStatus(res, 200);
});

${methods.includes("POST") ? `Deno.test("${args.name} - should handle POST", async () => {
  const res = await runHandler(handler, {
    method: "POST",
    path: "/${args.name}",
    body: {},
  });
  assertStatus(res, 201);
});` : ""}

${methods.includes("PATCH") ? `Deno.test("${args.name} - should handle PATCH", async () => {
  const res = await runHandler(handler, {
    method: "PATCH",
    path: "/${args.name}",
    query: { id: "1" },
    body: {},
  });
  assertStatus(res, 200);
});` : ""}

${methods.includes("DELETE") ? `Deno.test("${args.name} - should handle DELETE", async () => {
  const res = await runHandler(handler, {
    method: "DELETE",
    path: "/${args.name}",
    query: { id: "1" },
  });
  assertStatus(res, 200);
});` : ""}
`;

  await Deno.writeTextFile(testPath, testCode);

  // Update status to testing
  meta.status = "testing";
  meta.updated_at = new Date().toISOString();
  await saveRegistry(registry);

  return {
    success: true,
    data: { test_path: testPath, test_code: testCode },
  };
}

export async function runTests(args: { name?: string }): Promise<ToolResult> {
  const cmd = args.name
    ? new Deno.Command("deno", {
        args: ["test", "--allow-all", join(FUNCTIONS_DIR, args.name, "test.ts")],
        stdout: "piped",
        stderr: "piped",
      })
    : new Deno.Command("deno", {
        args: ["test", "--allow-all", FUNCTIONS_DIR],
        stdout: "piped",
        stderr: "piped",
      });

  const { code, stdout, stderr } = await cmd.output();
  const output = new TextDecoder().decode(stdout) + "\n" + new TextDecoder().decode(stderr);

  const passed = output.match(/test result: ok\. (\d+) passed/)?.[1];
  const failed = output.match(/test result: FAILED\. (\d+) passed; (\d+) failed/)?.[2];

  return {
    success: code === 0,
    data: {
      exit_code: code,
      passed: passed ? parseInt(passed) : 0,
      failed: failed ? parseInt(failed) : 0,
      output,
    },
  };
}

export async function updateFunction(args: {
  name: string;
  code: string;
}): Promise<ToolResult> {
  const registry = await loadRegistry();
  const meta = registry.functions.find((f) => f.name === args.name);
  if (!meta) {
    return { success: false, error: { code: "NOT_FOUND", message: `Function '${args.name}' not found` } };
  }

  const indexPath = join(meta.path, "index.ts");
  await Deno.writeTextFile(indexPath, args.code);

  // Lint check
  const lintResult = await runLint(indexPath);
  if (!lintResult.success) {
    return {
      success: false,
      error: {
        code: "LINT_ERROR",
        message: `Updated code failed lint check`,
        context: { lint_output: lintResult.output },
      },
    };
  }

  meta.updated_at = new Date().toISOString();
  await saveRegistry(registry);

  return { success: true, data: { meta } };
}

export async function deployFunction(args: {
  name: string;
  version_bump: "major" | "minor" | "patch";
  reason?: string;
}): Promise<ToolResult> {
  const registry = await loadRegistry();
  const meta = registry.functions.find((f) => f.name === args.name);
  if (!meta) {
    return { success: false, error: { code: "NOT_FOUND", message: `Function '${args.name}' not found` } };
  }

  // Ensure tests pass before deploy
  const testResult = await runTests({ name: args.name });
  if (!testResult.success) {
    return {
      success: false,
      error: {
        code: "TESTS_FAILED",
        message: `Cannot deploy: tests failed for '${args.name}'`,
        context: { test_output: (testResult.data as Record<string, string>)?.output },
      },
    };
  }

  const newVersion = bumpVersion(meta.version, args.version_bump);
  const now = new Date().toISOString();

  meta.version = newVersion;
  meta.status = "active";
  meta.updated_at = now;
  meta.history.push({
    version: newVersion,
    status: "active",
    changed_at: now,
    reason: args.reason || `Deployed with ${args.version_bump} bump`,
  });

  await saveRegistry(registry);

  return {
    success: true,
    data: { meta, test_result: testResult.data },
  };
}

export async function disableFunction(args: { name: string }): Promise<ToolResult> {
  const registry = await loadRegistry();
  const meta = registry.functions.find((f) => f.name === args.name);
  if (!meta) {
    return { success: false, error: { code: "NOT_FOUND", message: `Function '${args.name}' not found` } };
  }

  meta.status = "deprecated";
  meta.updated_at = new Date().toISOString();
  meta.history.push({
    version: meta.version,
    status: "deprecated",
    changed_at: meta.updated_at,
    reason: "Disabled by agent",
  });

  await saveRegistry(registry);
  return { success: true, data: { meta } };
}

export async function deleteFunction(args: { name: string }): Promise<ToolResult> {
  const registry = await loadRegistry();
  const meta = registry.functions.find((f) => f.name === args.name);
  if (!meta) {
    return { success: false, error: { code: "NOT_FOUND", message: `Function '${args.name}' not found` } };
  }

  meta.status = "archived";
  meta.updated_at = new Date().toISOString();
  meta.history.push({
    version: meta.version,
    status: "archived",
    changed_at: meta.updated_at,
    reason: "Archived by agent",
  });

  await saveRegistry(registry);
  return { success: true, data: { meta } };
}

export async function publishToProd(): Promise<ToolResult> {
  const registry = await loadRegistry();
  const activeFunctions = registry.functions.filter((f) => f.status === "active");

  // Run all tests
  const testResult = await runTests();
  if (!testResult.success) {
    return {
      success: false,
      error: {
        code: "TESTS_FAILED",
        message: "Cannot publish to prod: some tests failed",
        context: { test_output: (testResult.data as Record<string, string>)?.output },
      },
    };
  }

  // Build and export prod image
  const cmd = new Deno.Command("make", {
    args: ["export", "ENV=prod"],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await cmd.output();
  const output = new TextDecoder().decode(stdout) + "\n" + new TextDecoder().decode(stderr);

  if (code !== 0) {
    return {
      success: false,
      error: {
        code: "BUILD_FAILED",
        message: "Failed to build prod image",
        context: { build_output: output },
      },
    };
  }

  return {
    success: true,
    data: {
      active_functions: activeFunctions.map((f) => f.name),
      test_result: testResult.data,
      build_output: output,
    },
  };
}

// ------------------------------------------------------------------
// PostgreSQL DDL tools
// ------------------------------------------------------------------

export async function pgCreateTable(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const schema = (args.schema as string) || "public";
  const tableName = args.table_name as string;
  const columns = args.columns as Array<Record<string, unknown>>;
  const ifNotExists = args.if_not_exists as boolean || false;

  if (!tableName) {
    return {
      success: false,
      error: { code: "INVALID_ARGS", message: "table_name is required" },
    };
  }
  if (!columns || !Array.isArray(columns) || columns.length === 0) {
    return {
      success: false,
      error: {
        code: "INVALID_ARGS",
        message: "columns is required and must be a non-empty array",
      },
    };
  }

  for (const col of columns) {
    const typeCheck = checkColumnType(col.type as string);
    if (!typeCheck.safe) {
      return { success: false, error: { code: "UNSAFE_SQL", message: typeCheck.reason! } };
    }
    if (col.default !== undefined && col.default !== null) {
      const defaultCheck = checkDefaultValue(col.default as string);
      if (!defaultCheck.safe) {
        return { success: false, error: { code: "UNSAFE_SQL", message: defaultCheck.reason! } };
      }
    }
  }

  const colDefs = columns.map((col) => {
    const parts = [quoteIdent(col.name as string), col.type as string];
    if (col.primary_key) parts.push("PRIMARY KEY");
    if (col.nullable === false) parts.push("NOT NULL");
    if (col.default !== undefined && col.default !== null) {
      parts.push(`DEFAULT ${col.default}`);
    }
    if (col.unique) parts.push("UNIQUE");
    if (col.references) {
      const ref = col.references as Record<string, string>;
      parts.push(
        `REFERENCES ${quoteIdent(ref.table)}(${quoteIdent(ref.column)})`,
      );
    }
    return "  " + parts.join(" ");
  });

  const sql = [
    `CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}${
      quoteIdent(schema)
    }.${quoteIdent(tableName)} (`,
    colDefs.join(",\n"),
    ");",
  ].join("\n");

  try {
    await executeSql(sql);
    return { success: true, data: { sql, schema, table: tableName } };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "SQL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        context: { sql },
      },
    };
  }
}

export async function pgCreateView(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const schema = (args.schema as string) || "public";
  const viewName = args.view_name as string;
  const query = args.query as string;
  const orReplace = args.or_replace as boolean || false;
  const materialized = args.materialized as boolean || false;

  if (!viewName) {
    return {
      success: false,
      error: { code: "INVALID_ARGS", message: "view_name is required" },
    };
  }
  if (!query) {
    return {
      success: false,
      error: { code: "INVALID_ARGS", message: "query is required" },
    };
  }

  const viewSafety = checkViewQuery(query);
  if (!viewSafety.safe) {
    return { success: false, error: { code: "UNSAFE_SQL", message: viewSafety.reason! } };
  }

  const sql = materialized
    ? `CREATE ${
      orReplace ? "OR REPLACE " : ""
    }MATERIALIZED VIEW ${quoteIdent(schema)}.${quoteIdent(viewName)} AS\n${query};`
    : `CREATE ${
      orReplace ? "OR REPLACE " : ""
    }VIEW ${quoteIdent(schema)}.${quoteIdent(viewName)} AS\n${query};`;

  try {
    await executeSql(sql);
    return {
      success: true,
      data: { sql, schema, view: viewName, materialized },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "SQL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        context: { sql },
      },
    };
  }
}

export async function pgCreateRoutine(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const schema = (args.schema as string) || "public";
  const name = args.name as string;
  const language = (args.language as string) || "plpgsql";
  const returns = args.returns as string;
  const body = args.body as string;
  const parameters = (args.parameters as Array<Record<string, string>>) || [];
  const routineType = (args.type as string) || "function";

  if (!name) {
    return {
      success: false,
      error: { code: "INVALID_ARGS", message: "name is required" },
    };
  }
  if (!body) {
    return {
      success: false,
      error: { code: "INVALID_ARGS", message: "body is required" },
    };
  }

  const bodySafety = checkRoutineBody(body);
  if (!bodySafety.safe) {
    return { success: false, error: { code: "UNSAFE_SQL", message: bodySafety.reason! } };
  }

  const paramsStr = parameters
    .map((p) => `${quoteIdent(p.name)} ${p.type}`)
    .join(", ");
  const returnsClause = routineType === "procedure"
    ? ""
    : `  RETURNS ${returns}\n`;

  const sql = [
    `CREATE OR REPLACE ${
      routineType === "procedure" ? "PROCEDURE" : "FUNCTION"
    } ${quoteIdent(schema)}.${quoteIdent(name)}(${paramsStr})`,
    `${returnsClause}  LANGUAGE ${language}`,
    `AS $$`,
    body,
    `$$;`,
  ].join("\n");

  try {
    await executeSql(sql);
    return { success: true, data: { sql, schema, routine: name, type: routineType } };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "SQL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        context: { sql },
      },
    };
  }
}

export async function pgCreatePolicy(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const schema = (args.schema as string) || "public";
  const tableName = args.table_name as string;
  const policyName = args.policy_name as string;
  const operation = (args.operation as string) || "ALL";
  const role = (args.role as string) || "public";
  const usingExpression = args.using_expression as string;
  const withCheckExpression = args.with_check_expression as string;

  if (!tableName) {
    return {
      success: false,
      error: { code: "INVALID_ARGS", message: "table_name is required" },
    };
  }
  if (!policyName) {
    return {
      success: false,
      error: { code: "INVALID_ARGS", message: "policy_name is required" },
    };
  }

  if (usingExpression) {
    const exprSafety = checkPolicyExpression(usingExpression);
    if (!exprSafety.safe) {
      return { success: false, error: { code: "UNSAFE_SQL", message: exprSafety.reason! } };
    }
  }
  if (withCheckExpression) {
    const exprSafety = checkPolicyExpression(withCheckExpression);
    if (!exprSafety.safe) {
      return { success: false, error: { code: "UNSAFE_SQL", message: exprSafety.reason! } };
    }
  }

  const usingClause = usingExpression ? `\n  USING (${usingExpression})` : "";
  const checkClause = withCheckExpression
    ? `\n  WITH CHECK (${withCheckExpression})`
    : "";

  const sql = [
    `CREATE POLICY ${quoteIdent(policyName)}`,
    `  ON ${quoteIdent(schema)}.${quoteIdent(tableName)}`,
    operation !== "ALL" ? `  FOR ${operation}` : "",
    `  TO ${role}`,
    usingClause,
    checkClause,
    ";",
  ].filter((line) => line !== "").join("\n");

  const enableRlsSql =
    `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(tableName)} ENABLE ROW LEVEL SECURITY;`;

  try {
    await executeSql(enableRlsSql);
    await executeSql(sql);
    return {
      success: true,
      data: {
        sql,
        enable_rls_sql: enableRlsSql,
        schema,
        table: tableName,
        policy: policyName,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "SQL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        context: { sql, enable_rls_sql: enableRlsSql },
      },
    };
  }
}

// ------------------------------------------------------------------
// Lint helper
// ------------------------------------------------------------------

async function runLint(filePath: string): Promise<{ success: boolean; output: string }> {
  const cmd = new Deno.Command("deno", {
    args: ["lint", filePath],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await cmd.output();
  const output = new TextDecoder().decode(stdout) + "\n" + new TextDecoder().decode(stderr);

  return { success: code === 0, output };
}
