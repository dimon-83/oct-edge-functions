export type FunctionStatus = "draft" | "testing" | "active" | "deprecated" | "archived";

export interface ChangelogEntry {
  version: string;
  status: FunctionStatus;
  changed_at: string;
  reason: string;
}

export interface FunctionMeta {
  name: string;
  path: string;
  status: FunctionStatus;
  version: string;
  created_at: string;
  updated_at: string;
  history: ChangelogEntry[];
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
