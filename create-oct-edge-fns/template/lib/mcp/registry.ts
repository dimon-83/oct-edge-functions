/**
 * ToolRegistry — a registry pattern for MCP tool dispatch.
 * Replaces the open-coded switch + TOOL_DEFINITIONS coupling.
 */

import type { ToolResult } from "./types.ts";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export class ToolRegistry {
  #tools = new Map<string, McpTool>();

  register(tool: McpTool): void {
    this.#tools.set(tool.name, tool);
  }

  get(name: string): McpTool | undefined {
    return this.#tools.get(name);
  }

  list(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return Array.from(this.#tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }
}

let _defaultRegistry: ToolRegistry | null = null;

export function getDefaultRegistry(): ToolRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new ToolRegistry();
  }
  return _defaultRegistry;
}
