/**
 * oct-edge-functions — core library
 *
 * Re-export everything needed to build an edge-function runtime.
 * Intended for publication to jsr.io / deno.land/x.
 */

// Server & middleware
export { HttpServer } from "./server.ts";
export type { ServerConfig } from "./server.ts";
export { compose, errorMiddleware } from "./middleware.ts";
export type { Middleware } from "./middleware.ts";

// Context & errors
export type { Ctx } from "./context.ts";
export { AppError, AuthError, ValidationError } from "./context.ts";

// Logger
export type { Logger, LoggerConfig, LogLevel } from "./logger.ts";
export { createRequestLogger, LoggerFactory } from "./logger.ts";

// DB client
export { createClient } from "./db.ts";

// Testing helpers
export {
  buildRequest,
  createMockCtx,
  createMockDb,
  createMockLogger,
} from "./testing.ts";
export type { HandlerRequestOptions, MockDb, MockLogger } from "./testing.ts";

// MCP (dev-only, but exported so consumers can mount it)
export { McpTools } from "./mcp/tools.ts";
export type {
  FunctionMeta,
  FunctionRegistry,
  FunctionStatus,
  ToolResult,
} from "./mcp/types.ts";
export { getDefaultRegistry, ToolRegistry } from "./mcp/registry.ts";
export type { McpTool } from "./mcp/registry.ts";
export {
  handleMessageRequest,
  handleSseRequest,
  handleStreamableHttpRequest,
} from "./mcp/server.ts";

// MCP adapters
export {
  DenoLinter,
  DenoTestRunner,
  FileRegistryStore,
  InMemoryRegistryStore,
  MakeBuildService,
  MockBuildService,
  MockLinter,
  MockSqlExecutor,
  MockTestRunner,
  PgSqlExecutor,
} from "./mcp/adapters/index.ts";
export type {
  BuildResult,
  BuildService,
  Linter,
  LintResult,
  QueryResult,
  RegistryStore,
  SqlExecutor,
  TestResult,
  TestRunner,
} from "./mcp/adapters/index.ts";

// Templates (default exports)
export { default as crudTemplate } from "./templates/crud.ts";
export { default as queryTemplate } from "./templates/query.ts";
export { default as proxyTemplate } from "./templates/proxy.ts";
export { default as transformTemplate } from "./templates/transform.ts";

// Built-in plugins
export { corsMiddlewares } from "./plugins/cors.ts";
export { createAuthMiddlewares, envTokenProvider } from "./plugins/auth.ts";
export type { PgrestTokenProvider } from "./plugins/auth.ts";
export { loggingMiddlewares } from "./plugins/logging.ts";
