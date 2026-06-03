/**
 * MCP Tools implementation for oct-edge-functions.
 * Agent-driven function lifecycle management and PostgreSQL DDL.
 *
 * Core McpTools class accepts adapter interfaces for testability.
 * Module-level convenience exports delegate to a default instance.
 */

import { join } from "@std/path";
import {
  checkColumnType,
  checkDefaultValue,
  checkPolicyExpression,
  checkRoutineBody,
  checkViewQuery,
  quoteIdent,
} from "../pg.ts";

import type { FunctionMeta, FunctionRegistry, ToolResult } from "./types.ts";

import {
  DenoLinter,
  DenoTestRunner,
  FileRegistryStore,
  MakeBuildService,
  PgSqlExecutor,
} from "./adapters/index.ts";

import type {
  BuildService,
  Linter,
  RegistryStore,
  SqlExecutor,
  TestRunner,
} from "./adapters/index.ts";

// ------------------------------------------------------------------
// Re-export types for backward compatibility
// ------------------------------------------------------------------

export type {
  ChangelogEntry,
  FunctionMeta,
  FunctionRegistry,
  FunctionStatus,
  ToolResult,
} from "./types.ts";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function bumpVersion(
  current: string,
  bump: "major" | "minor" | "patch",
): string {
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
// McpTools — main class with dependency injection
// ------------------------------------------------------------------

export class McpTools {
  constructor(
    private readonly registry: RegistryStore,
    private readonly testRunner: TestRunner,
    private readonly linter: Linter,
    private readonly sqlExecutor: SqlExecutor,
    private readonly buildService: BuildService,
  ) {}

  // ---- Lifecycle tools ----

  async listFunctions(): Promise<ToolResult> {
    const reg = await this.registry.load();
    return {
      success: true,
      data: reg.functions.map((f) => ({
        name: f.name,
        status: f.status,
        version: f.version,
        updated_at: f.updated_at,
      })),
    };
  }

  async getFunction(args: { name: string }): Promise<ToolResult> {
    const reg = await this.registry.load();
    const meta = reg.functions.find((f) => f.name === args.name);
    if (!meta) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Function '${args.name}' not found`,
        },
      };
    }

    let code = "";
    try {
      code = await Deno.readTextFile(join(meta.path, "index.ts"));
    } catch {
      code = "// Code file not found";
    }

    return { success: true, data: { meta, code } };
  }

  async createFunction(args: {
    name: string;
    template: "crud" | "query" | "proxy" | "transform";
    description?: string;
    spec?: { table_name?: string; upstream_url?: string };
  }): Promise<ToolResult> {
    const reg = await this.registry.load();
    if (reg.functions.find((f) => f.name === args.name)) {
      return {
        success: false,
        error: {
          code: "ALREADY_EXISTS",
          message: `Function '${args.name}' already exists`,
        },
      };
    }

    const requiredSpec: Record<string, string[]> = {
      crud: ["table_name"],
      query: ["table_name"],
      proxy: ["upstream_url"],
      transform: [],
    };

    const missing = requiredSpec[args.template].filter(
      (field) => !args.spec?.[field as keyof typeof args.spec],
    );
    if (missing.length > 0) {
      return {
        success: false,
        error: {
          code: "MISSING_SPEC",
          message: `Template '${args.template}' requires spec field(s): ${
            missing.join(", ")
          }`,
        },
      };
    }

    const funcDir = join("./functions", args.name);
    await Deno.mkdir(funcDir, { recursive: true });

    const templatePath = join("lib", "templates", `${args.template}.ts`);
    let templateCode = await Deno.readTextFile(templatePath);

    if (args.spec?.table_name) {
      templateCode = templateCode.replace(
        /\{\{TABLE_NAME\}\}/g,
        args.spec.table_name,
      );
    }
    if (args.spec?.upstream_url) {
      templateCode = templateCode.replace(
        /\{\{UPSTREAM_URL\}\}/g,
        args.spec.upstream_url,
      );
    }

    const indexPath = join(funcDir, "index.ts");
    await Deno.writeTextFile(indexPath, templateCode);

    const lintResult = await this.linter.lint(indexPath);
    if (!lintResult.success) {
      return {
        success: false,
        error: {
          code: "LINT_ERROR",
          message: "Generated code failed lint check",
          context: { lint_output: lintResult.output },
        },
      };
    }

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
    reg.functions.push(meta);
    await this.registry.save(reg);

    return { success: true, data: { meta, code: templateCode } };
  }

  async writeTests(args: { name: string }): Promise<ToolResult> {
    const reg = await this.registry.load();
    const meta = reg.functions.find((f) => f.name === args.name);
    if (!meta) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Function '${args.name}' not found`,
        },
      };
    }

    const testPath = join(meta.path, "test.ts");
    const code = await Deno.readTextFile(join(meta.path, "index.ts"));

    const methods: string[] = [];
    if (code.includes('case "GET"')) methods.push("GET");
    if (code.includes('case "POST"')) methods.push("POST");
    if (code.includes('case "PATCH"')) methods.push("PATCH");
    if (code.includes('case "DELETE"')) methods.push("DELETE");

    const testCode =
      `import { runHandler, assertStatus } from "@oct-edge-fns-core/testing.ts";
import handler from "./index.ts";

Deno.test("${args.name} - should handle GET", async () => {
  const res = await runHandler(handler, { method: "GET", path: "/${args.name}" });
  assertStatus(res, 200);
});

${
        methods.includes("POST")
          ? `Deno.test("${args.name} - should handle POST", async () => {
  const res = await runHandler(handler, {
    method: "POST",
    path: "/${args.name}",
    body: {},
  });
  assertStatus(res, 201);
});`
          : ""
      }

${
        methods.includes("PATCH")
          ? `Deno.test("${args.name} - should handle PATCH", async () => {
  const res = await runHandler(handler, {
    method: "PATCH",
    path: "/${args.name}",
    query: { id: "1" },
    body: {},
  });
  assertStatus(res, 200);
});`
          : ""
      }

${
        methods.includes("DELETE")
          ? `Deno.test("${args.name} - should handle DELETE", async () => {
  const res = await runHandler(handler, {
    method: "DELETE",
    path: "/${args.name}",
    query: { id: "1" },
  });
  assertStatus(res, 200);
});`
          : ""
      }
`;

    await Deno.writeTextFile(testPath, testCode);

    meta.status = "testing";
    meta.updated_at = new Date().toISOString();
    await this.registry.save(reg);

    return {
      success: true,
      data: { test_path: testPath, test_code: testCode },
    };
  }

  async runTests(args: { name?: string }): Promise<ToolResult> {
    const result = await this.testRunner.run(args.name);
    return {
      success: result.exitCode === 0,
      data: {
        exit_code: result.exitCode,
        passed: result.passed,
        failed: result.failed,
        output: result.output,
      },
    };
  }

  async updateFunction(
    args: { name: string; code: string },
  ): Promise<ToolResult> {
    const reg = await this.registry.load();
    const meta = reg.functions.find((f) => f.name === args.name);
    if (!meta) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Function '${args.name}' not found`,
        },
      };
    }

    const indexPath = join(meta.path, "index.ts");
    await Deno.writeTextFile(indexPath, args.code);

    const lintResult = await this.linter.lint(indexPath);
    if (!lintResult.success) {
      return {
        success: false,
        error: {
          code: "LINT_ERROR",
          message: "Updated code failed lint check",
          context: { lint_output: lintResult.output },
        },
      };
    }

    meta.updated_at = new Date().toISOString();
    await this.registry.save(reg);

    return { success: true, data: { meta } };
  }

  async deployFunction(args: {
    name: string;
    version_bump: "major" | "minor" | "patch";
    reason?: string;
  }): Promise<ToolResult> {
    const reg = await this.registry.load();
    const meta = reg.functions.find((f) => f.name === args.name);
    if (!meta) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Function '${args.name}' not found`,
        },
      };
    }

    const testResult = await this.testRunner.run(args.name);
    if (testResult.exitCode !== 0) {
      return {
        success: false,
        error: {
          code: "TESTS_FAILED",
          message: `Cannot deploy: tests failed for '${args.name}'`,
          context: { test_output: testResult.output },
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

    await this.registry.save(reg);

    return {
      success: true,
      data: {
        meta,
        test_result: { passed: testResult.passed, failed: testResult.failed },
      },
    };
  }

  async disableFunction(args: { name: string }): Promise<ToolResult> {
    const reg = await this.registry.load();
    const meta = reg.functions.find((f) => f.name === args.name);
    if (!meta) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Function '${args.name}' not found`,
        },
      };
    }

    meta.status = "deprecated";
    meta.updated_at = new Date().toISOString();
    meta.history.push({
      version: meta.version,
      status: "deprecated",
      changed_at: meta.updated_at,
      reason: "Disabled by agent",
    });

    await this.registry.save(reg);
    return { success: true, data: { meta } };
  }

  async deleteFunction(args: { name: string }): Promise<ToolResult> {
    const reg = await this.registry.load();
    const meta = reg.functions.find((f) => f.name === args.name);
    if (!meta) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Function '${args.name}' not found`,
        },
      };
    }

    meta.status = "archived";
    meta.updated_at = new Date().toISOString();
    meta.history.push({
      version: meta.version,
      status: "archived",
      changed_at: meta.updated_at,
      reason: "Archived by agent",
    });

    await this.registry.save(reg);
    return { success: true, data: { meta } };
  }

  async publishToProd(): Promise<ToolResult> {
    const reg = await this.registry.load();
    const activeFunctions = reg.functions.filter((f) => f.status === "active");

    const testResult = await this.testRunner.run();
    if (testResult.exitCode !== 0) {
      return {
        success: false,
        error: {
          code: "TESTS_FAILED",
          message: "Cannot publish to prod: some tests failed",
          context: { test_output: testResult.output },
        },
      };
    }

    const buildResult = await this.buildService.buildProd();
    if (!buildResult.success) {
      return {
        success: false,
        error: {
          code: "BUILD_FAILED",
          message: "Failed to build prod image",
          context: { build_output: buildResult.output },
        },
      };
    }

    return {
      success: true,
      data: {
        active_functions: activeFunctions.map((f) => f.name),
        test_result: { passed: testResult.passed, failed: testResult.failed },
        build_output: buildResult.output,
      },
    };
  }

  // ---- PostgreSQL DDL tools ----

  async pgCreateTable(args: Record<string, unknown>): Promise<ToolResult> {
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
        return {
          success: false,
          error: { code: "UNSAFE_SQL", message: typeCheck.reason! },
        };
      }
      if (col.default !== undefined && col.default !== null) {
        const defaultCheck = checkDefaultValue(col.default as string);
        if (!defaultCheck.safe) {
          return {
            success: false,
            error: { code: "UNSAFE_SQL", message: defaultCheck.reason! },
          };
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
      await this.sqlExecutor.execute(sql);
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

  async pgCreateView(args: Record<string, unknown>): Promise<ToolResult> {
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
      return {
        success: false,
        error: { code: "UNSAFE_SQL", message: viewSafety.reason! },
      };
    }

    const sql = materialized
      ? `CREATE ${orReplace ? "OR REPLACE " : ""}MATERIALIZED VIEW ${
        quoteIdent(schema)
      }.${quoteIdent(viewName)} AS\n${query};`
      : `CREATE ${orReplace ? "OR REPLACE " : ""}VIEW ${quoteIdent(schema)}.${
        quoteIdent(viewName)
      } AS\n${query};`;

    try {
      await this.sqlExecutor.execute(sql);
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

  async pgCreateRoutine(args: Record<string, unknown>): Promise<ToolResult> {
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
      return {
        success: false,
        error: { code: "UNSAFE_SQL", message: bodySafety.reason! },
      };
    }

    const paramsStr = parameters.map((p) => `${quoteIdent(p.name)} ${p.type}`)
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
      await this.sqlExecutor.execute(sql);
      return {
        success: true,
        data: { sql, schema, routine: name, type: routineType },
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

  async pgCreatePolicy(args: Record<string, unknown>): Promise<ToolResult> {
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
        return {
          success: false,
          error: { code: "UNSAFE_SQL", message: exprSafety.reason! },
        };
      }
    }
    if (withCheckExpression) {
      const exprSafety = checkPolicyExpression(withCheckExpression);
      if (!exprSafety.safe) {
        return {
          success: false,
          error: { code: "UNSAFE_SQL", message: exprSafety.reason! },
        };
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

    const enableRlsSql = `ALTER TABLE ${quoteIdent(schema)}.${
      quoteIdent(tableName)
    } ENABLE ROW LEVEL SECURITY;`;

    try {
      await this.sqlExecutor.execute(enableRlsSql);
      await this.sqlExecutor.execute(sql);
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
}

// ------------------------------------------------------------------
// Default instance (real adapters)
// ------------------------------------------------------------------

const FUNCTIONS_DIR = "./functions";

const _defaultStore = new FileRegistryStore("./functions.json", FUNCTIONS_DIR);
const _defaultTools = new McpTools(
  _defaultStore,
  new DenoTestRunner(FUNCTIONS_DIR),
  new DenoLinter(),
  new PgSqlExecutor(),
  new MakeBuildService(),
);

// ------------------------------------------------------------------
// Backward-compatible convenience exports
// Used by server.ts and main.ts without DI changes.
// Tests should instantiate McpTools directly.
// ------------------------------------------------------------------

export const loadRegistry = () => _defaultStore.load();
export const saveRegistry = (r: FunctionRegistry) => _defaultStore.save(r);

export const listFunctions = () => _defaultTools.listFunctions();
export const getFunction = (a: { name: string }) =>
  _defaultTools.getFunction(a);
export const createFunction = (a: Parameters<McpTools["createFunction"]>[0]) =>
  _defaultTools.createFunction(a);
export const writeTests = (a: { name: string }) => _defaultTools.writeTests(a);
export const runTests = (a: { name?: string }) => _defaultTools.runTests(a);
export const updateFunction = (a: { name: string; code: string }) =>
  _defaultTools.updateFunction(a);
export const deployFunction = (
  a: {
    name: string;
    version_bump: "major" | "minor" | "patch";
    reason?: string;
  },
) => _defaultTools.deployFunction(a);
export const disableFunction = (a: { name: string }) =>
  _defaultTools.disableFunction(a);
export const deleteFunction = (a: { name: string }) =>
  _defaultTools.deleteFunction(a);
export const publishToProd = () => _defaultTools.publishToProd();
export const pgCreateTable = (a: Record<string, unknown>) =>
  _defaultTools.pgCreateTable(a);
export const pgCreateView = (a: Record<string, unknown>) =>
  _defaultTools.pgCreateView(a);
export const pgCreateRoutine = (a: Record<string, unknown>) =>
  _defaultTools.pgCreateRoutine(a);
export const pgCreatePolicy = (a: Record<string, unknown>) =>
  _defaultTools.pgCreatePolicy(a);
