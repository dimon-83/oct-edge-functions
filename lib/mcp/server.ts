/**
 * MCP SSE Server for oct-edge-functions.
 * Embedded in the dev runtime. Disabled in prod.
 */

import { createSession, deleteSession, getSession } from "./session.ts";
import * as tools from "./tools.ts";
import type { ToolResult } from "./types.ts";
import { getDefaultRegistry, type ToolRegistry } from "./registry.ts";
import { FileSkillRegistryStore, SkillTools } from "./skills/mod.ts";

const MCP_VERSION = "2024-11-05";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ------------------------------------------------------------------
// Tool registry setup
// ------------------------------------------------------------------

function setupRegistry(): ToolRegistry {
  const r = getDefaultRegistry();

  const skillTools = new SkillTools({
    registryStore: new FileSkillRegistryStore("./skills.json"),
  });

  r.register({
    name: "list_functions",
    description:
      "List all functions in the registry with their status and version",
    inputSchema: { type: "object", properties: {} },
    handler: () => tools.listFunctions(),
  });

  r.register({
    name: "get_function",
    description: "Get a function's metadata and source code",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Function name" } },
      required: ["name"],
    },
    handler: (a) => tools.getFunction(a as { name: string }),
  });

  r.register({
    name: "create_function",
    description: "Create a new function from a template",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Function name (directory name)" },
        template: {
          type: "string",
          enum: ["crud", "query", "proxy", "transform"],
          description: "Code template to use",
        },
        description: {
          type: "string",
          description: "Natural language description",
        },
        spec: {
          type: "object",
          properties: {
            table_name: { type: "string" },
            upstream_url: { type: "string" },
          },
        },
      },
      required: ["name", "template"],
    },
    handler: (a) =>
      tools.createFunction(
        a as {
          name: string;
          template: "crud" | "query" | "proxy" | "transform";
          description?: string;
          spec?: Record<string, string>;
        },
      ),
  });

  r.register({
    name: "write_tests",
    description: "Generate test scaffold for a function",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Function name" } },
      required: ["name"],
    },
    handler: (a) => tools.writeTests(a as { name: string }),
  });

  r.register({
    name: "run_tests",
    description: "Run tests for a function or all functions",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Function name (omit to run all)",
        },
      },
    },
    handler: (a) => tools.runTests(a as { name?: string }),
  });

  r.register({
    name: "update_function",
    description: "Update a function's source code",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Function name" },
        code: { type: "string", description: "New source code" },
      },
      required: ["name", "code"],
    },
    handler: (a) => tools.updateFunction(a as { name: string; code: string }),
  });

  r.register({
    name: "deploy_function",
    description:
      "Deploy a function: run tests, bump version, set status to active",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Function name" },
        version_bump: {
          type: "string",
          enum: ["major", "minor", "patch"],
          description: "Semver bump type",
        },
        reason: { type: "string", description: "Changelog reason" },
      },
      required: ["name", "version_bump"],
    },
    handler: (a) =>
      tools.deployFunction(
        a as {
          name: string;
          version_bump: "major" | "minor" | "patch";
          reason?: string;
        },
      ),
  });

  r.register({
    name: "disable_function",
    description: "Disable a function (set status to deprecated)",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Function name" } },
      required: ["name"],
    },
    handler: (a) => tools.disableFunction(a as { name: string }),
  });

  r.register({
    name: "delete_function",
    description: "Archive a function (soft delete)",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Function name" } },
      required: ["name"],
    },
    handler: (a) => tools.deleteFunction(a as { name: string }),
  });

  r.register({
    name: "publish_to_prod",
    description: "Validate all active functions and build prod Docker image",
    inputSchema: { type: "object", properties: {} },
    handler: () => tools.publishToProd(),
  });

  r.register({
    name: "pg_create_table",
    description: "Create a PostgreSQL table in the specified schema",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description: "Database schema (default: public)",
        },
        table_name: { type: "string", description: "Table name" },
        columns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              primary_key: { type: "boolean" },
              nullable: { type: "boolean" },
              default: { type: "string" },
              unique: { type: "boolean" },
              references: {
                type: "object",
                properties: {
                  table: { type: "string" },
                  column: { type: "string" },
                },
              },
            },
          },
          description: "Column definitions",
        },
        if_not_exists: {
          type: "boolean",
          description: "Add IF NOT EXISTS clause",
        },
      },
      required: ["table_name", "columns"],
    },
    handler: (a) => tools.pgCreateTable(a),
  });

  r.register({
    name: "pg_create_view",
    description: "Create a PostgreSQL view (regular or materialized)",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description: "Database schema (default: public)",
        },
        view_name: { type: "string", description: "View name" },
        query: { type: "string", description: "SELECT query for the view" },
        or_replace: { type: "boolean", description: "Use CREATE OR REPLACE" },
        materialized: {
          type: "boolean",
          description: "Create a materialized view",
        },
      },
      required: ["view_name", "query"],
    },
    handler: (a) => tools.pgCreateView(a),
  });

  r.register({
    name: "pg_create_routine",
    description: "Create or replace a PostgreSQL function or stored procedure",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description: "Database schema (default: public)",
        },
        name: { type: "string", description: "Function/procedure name" },
        language: {
          type: "string",
          description: "Language (default: plpgsql)",
        },
        returns: {
          type: "string",
          description: "Return type (required for functions)",
        },
        parameters: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, type: { type: "string" } },
          },
          description: "Function parameters",
        },
        body: {
          type: "string",
          description: "Function body (the $$ ... $$ content)",
        },
        type: {
          type: "string",
          enum: ["function", "procedure"],
          description: "Routine type (default: function)",
        },
      },
      required: ["name", "body"],
    },
    handler: (a) => tools.pgCreateRoutine(a),
  });

  r.register({
    name: "pg_create_policy",
    description: "Create a Row-Level Security policy on a table",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description: "Database schema (default: public)",
        },
        table_name: { type: "string", description: "Table name" },
        policy_name: { type: "string", description: "Policy name" },
        operation: {
          type: "string",
          enum: ["ALL", "SELECT", "INSERT", "UPDATE", "DELETE"],
          description: "Operation type (default: ALL)",
        },
        role: {
          type: "string",
          description: "Database role (default: public)",
        },
        using_expression: {
          type: "string",
          description: "USING expression for the policy",
        },
        with_check_expression: {
          type: "string",
          description: "WITH CHECK expression",
        },
      },
      required: ["table_name", "policy_name"],
    },
    handler: (a) => tools.pgCreatePolicy(a),
  });

  // ---- Skill tools ----

  r.register({
    name: "list_skills",
    description: "List all discovered skills with status, runtime and source",
    inputSchema: { type: "object", properties: {} },
    handler: () => skillTools.listSkills(),
  });

  r.register({
    name: "get_skill",
    description: "Get a skill's metadata, source and SKILL.md instructions",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name" } },
      required: ["name"],
    },
    handler: (a) => skillTools.getSkill(a as { name: string }),
  });

  r.register({
    name: "register_skill",
    description:
      "Register a skill in skills.json so it can be installed and enabled",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name" },
        source_type: {
          type: "string",
          enum: ["mooncakes", "npm", "git", "local"],
          description: "Source type",
        },
        package: { type: "string", description: "Package identifier" },
        version: { type: "string", description: "Exact version" },
        url: { type: "string", description: "Git or download URL" },
        git_url: { type: "string", description: "Git URL for npx skills add" },
        path: { type: "string", description: "Local path" },
        install_command: {
          type: "string",
          description:
            "Optional install command (default generated from source)",
        },
        install_directory: {
          type: "string",
          description: "Optional install directory",
        },
        enabled: {
          type: "boolean",
          description: "Whether the skill is enabled",
        },
      },
      required: ["name", "source_type"],
    },
    handler: (a) =>
      skillTools.registerSkill(
        a as {
          name: string;
          source_type: "mooncakes" | "npm" | "git" | "local";
          package?: string;
          version?: string;
          url?: string;
          git_url?: string;
          path?: string;
          install_command?: string;
          install_directory?: string;
          enabled?: boolean;
        },
      ),
  });

  r.register({
    name: "unregister_skill",
    description: "Remove a skill from skills.json",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name" } },
      required: ["name"],
    },
    handler: (a) => skillTools.unregisterSkill(a as { name: string }),
  });

  r.register({
    name: "install_skills",
    description:
      "Install or update skills according to skills.json. Omit name to install all.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill name (omit to install all)",
        },
      },
    },
    handler: (a) => skillTools.installSkills(a as { name?: string }),
  });

  r.register({
    name: "invoke_skill",
    description:
      "Execute a skill's entry point with inputs and optional context",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name" },
        inputs: { type: "object", description: "Skill inputs" },
        context: { type: "object", description: "Additional context" },
        timeout_ms: {
          type: "number",
          description: "Execution timeout in milliseconds",
        },
      },
      required: ["name"],
    },
    handler: (a) =>
      skillTools.invokeSkill(
        a as {
          name: string;
          inputs?: Record<string, unknown>;
          context?: Record<string, unknown>;
          timeout_ms?: number;
        },
      ),
  });

  r.register({
    name: "suggest_skill",
    description:
      "Suggest skills that match user text or uploaded file metadata",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "User text" },
        file_name: { type: "string", description: "Uploaded file name" },
        file_type: {
          type: "string",
          description: "MIME type of uploaded file",
        },
      },
    },
    handler: (a) =>
      skillTools.suggestSkill(
        a as { text?: string; file_name?: string; file_type?: string },
      ),
  });

  r.register({
    name: "sync_skills_registry",
    description: "Sync skills.json with skills discovered on the filesystem",
    inputSchema: { type: "object", properties: {} },
    handler: () => skillTools.syncRegistry(),
  });

  return r;
}

const registry = setupRegistry();

// ------------------------------------------------------------------
// Request handlers
// ------------------------------------------------------------------

async function handleToolCall(
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const { name, arguments: args = {} } = request.params as {
    name: string;
    arguments?: Record<string, unknown>;
  };

  const tool = registry.get(name);
  if (!tool) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32601, message: `Unknown tool: ${name}` },
    };
  }

  let result: ToolResult;

  try {
    result = await tool.handler(args);
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!result.success && result.error?.code === "NEED_USER_INPUT") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32000,
        message: result.error.message,
        data: result.error.context,
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: !result.success,
    },
  };
}

async function handleRequest(
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  switch (request.method) {
    case "initialize": {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: MCP_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "oct-edge-functions-mcp",
            version: "1.0.0",
          },
        },
      };
    }

    case "tools/list": {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { tools: registry.list() },
      };
    }

    case "tools/call": {
      return await handleToolCall(request);
    }

    default:
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      };
  }
}

// ------------------------------------------------------------------
// HTTP handlers
// ------------------------------------------------------------------

export function handleSseRequest(_req: Request): Response {
  const session = createSession();
  console.log(`[MCP] SSE connection established, session_id: ${session.id}`);

  const body = new ReadableStream({
    start(controller) {
      // Store controller for later use (when sending notifications)
      session.controller = controller;

      // Send endpoint event - some clients expect just the URI string
      const endpointEvent =
        `event: endpoint\ndata: ${session.messageEndpoint}\n\n`;
      controller.enqueue(new TextEncoder().encode(endpointEvent));
      console.log(`[MCP] Sent endpoint event: ${session.messageEndpoint}`);

      // Note: notifications/initialized should be sent after client sends initialize request
      // This is handled in the message endpoint
    },
    cancel() {
      console.log(`[MCP] SSE connection closed, session_id: ${session.id}`);
      deleteSession(session.id);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

// ------------------------------------------------------------------
// Streamable HTTP transport (MCP 2025-06-18)
// Single endpoint: POST /mcp for JSON-RPC, GET /mcp for SSE stream
// ------------------------------------------------------------------

export function handleStreamableHttpRequest(
  req: Request,
): Response | Promise<Response> {
  if (req.method === "GET") {
    return handleStreamableSseStream(req);
  }
  if (req.method === "POST") {
    return handleStreamablePost(req);
  }
  return new Response("Method not allowed", { status: 405 });
}

function handleStreamableSseStream(_req: Request): Response {
  const session = createSession();

  const body = new ReadableStream({
    start(controller) {
      session.controller = controller;
      const endpointEvent =
        `event: endpoint\ndata: ${session.messageEndpoint}\n\n`;
      controller.enqueue(new TextEncoder().encode(endpointEvent));
    },
    cancel() {
      deleteSession(session.id);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handleStreamablePost(req: Request): Promise<Response> {
  const accept = req.headers.get("Accept") || "";
  const wantsStream = accept.includes("text/event-stream");

  try {
    const body = await req.json();
    const request = body as JsonRpcRequest;

    const response = await handleRequest(request);

    if (request.method === "initialize" && response.result) {
      if (wantsStream) {
        const stream = new ReadableStream({
          start(controller) {
            const respEvent = `event: message\ndata: ${
              JSON.stringify(response)
            }\n\n`;
            controller.enqueue(new TextEncoder().encode(respEvent));

            const initNotification = `event: message\ndata: ${
              JSON.stringify({
                jsonrpc: "2.0",
                method: "notifications/initialized",
              })
            }\n\n`;
            controller.enqueue(new TextEncoder().encode(initNotification));

            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    return Response.json(response, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: err instanceof Error ? err.message : "Parse error",
        },
      },
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  }
}

export async function handleMessageRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    console.log(`[MCP] Message request missing session_id`);
    return Response.json({ error: "Missing session_id" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    console.log(`[MCP] Invalid or expired session: ${sessionId}`);
    return Response.json({ error: "Invalid or expired session" }, {
      status: 400,
    });
  }

  try {
    const body = await req.json();
    const request = body as JsonRpcRequest;
    console.log(
      `[MCP] Received message: ${request.method}, session_id: ${sessionId}`,
    );

    const response = await handleRequest(request);
    console.log(
      `[MCP] Sending response: ${
        JSON.stringify(response).substring(0, 200)
      }...`,
    );

    // After successful initialize, send notifications/initialized via SSE
    if (
      request.method === "initialize" && response.result && session.controller
    ) {
      const initNotification = `event: message\ndata: ${
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        })
      }\n\n`;
      session.controller.enqueue(new TextEncoder().encode(initNotification));
      console.log(`[MCP] Sent notifications/initialized via SSE`);
    }

    return Response.json(response, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  } catch (err) {
    console.error(`[MCP] Error handling message: ${err}`);
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message: err instanceof Error ? err.message : "Parse error",
        },
      },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        },
      },
    );
  }
}
