/**
 * MCP SSE Server for oct-edge-functions.
 * Embedded in the dev runtime. Disabled in prod.
 */

import { createSession, getSession, deleteSession } from "./session.ts";
import * as tools from "./tools.ts";
import type { ToolResult } from "./tools.ts";

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
// Tool definitions for MCP initialization
// ------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: "list_functions",
    description: "List all functions in the registry with their status and version",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_function",
    description: "Get a function's metadata and source code",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Function name" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_function",
    description: "Create a new function from a template",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Function name (directory name)" },
        template: {
          type: "string",
          enum: ["crud", "query", "proxy", "transform"],
          description: "Code template to use",
        },
        description: { type: "string", description: "Natural language description of the function" },
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
  },
  {
    name: "write_tests",
    description: "Generate test scaffold for a function",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Function name" },
      },
      required: ["name"],
    },
  },
  {
    name: "run_tests",
    description: "Run tests for a function or all functions",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Function name (omit to run all)" },
      },
    },
  },
  {
    name: "update_function",
    description: "Update a function's source code",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Function name" },
        code: { type: "string", description: "New source code" },
      },
      required: ["name", "code"],
    },
  },
  {
    name: "deploy_function",
    description: "Deploy a function: run tests, bump version, set status to active",
    inputSchema: {
      type: "object" as const,
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
  },
  {
    name: "disable_function",
    description: "Disable a function (set status to deprecated)",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Function name" },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_function",
    description: "Archive a function (soft delete)",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Function name" },
      },
      required: ["name"],
    },
  },
  {
    name: "publish_to_prod",
    description: "Validate all active functions and build prod Docker image",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

// ------------------------------------------------------------------
// Request handlers
// ------------------------------------------------------------------

async function handleToolCall(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { name, arguments: args = {} } = request.params as { name: string; arguments?: Record<string, unknown> };

  let result: ToolResult;

  try {
    switch (name) {
      case "list_functions":
        result = await tools.listFunctions();
        break;
      case "get_function":
        result = await tools.getFunction(args as { name: string });
        break;
      case "create_function":
        result = await tools.createFunction(args as { name: string; template: "crud" | "query" | "proxy" | "transform"; description?: string; spec?: Record<string, string> });
        break;
      case "write_tests":
        result = await tools.writeTests(args as { name: string });
        break;
      case "run_tests":
        result = await tools.runTests(args as { name?: string });
        break;
      case "update_function":
        result = await tools.updateFunction(args as { name: string; code: string });
        break;
      case "deploy_function":
        result = await tools.deployFunction(args as { name: string; version_bump: "major" | "minor" | "patch"; reason?: string });
        break;
      case "disable_function":
        result = await tools.disableFunction(args as { name: string });
        break;
      case "delete_function":
        result = await tools.deleteFunction(args as { name: string });
        break;
      case "publish_to_prod":
        result = await tools.publishToProd();
        break;
      default:
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        };
    }
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

async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
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
        result: { tools: TOOL_DEFINITIONS },
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

export async function handleSseRequest(req: Request): Promise<Response> {
  const session = createSession();
  console.log(`[MCP] SSE connection established, session_id: ${session.id}`);

  const body = new ReadableStream({
    start(controller) {
      // Store controller for later use (when sending notifications)
      session.controller = controller;
      
      // Send endpoint event only
      const endpointEvent = `event: endpoint\ndata: ${JSON.stringify({ uri: session.messageEndpoint })}\n\n`;
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
    return Response.json({ error: "Invalid or expired session" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const request = body as JsonRpcRequest;
    console.log(`[MCP] Received message: ${request.method}, session_id: ${sessionId}`);
    
    const response = await handleRequest(request);
    console.log(`[MCP] Sending response: ${JSON.stringify(response).substring(0, 200)}...`);
    
    // After successful initialize, send notifications/initialized via SSE
    if (request.method === "initialize" && response.result && session.controller) {
      const initNotification = `event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      })}\n\n`;
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
