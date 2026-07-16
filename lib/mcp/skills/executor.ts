/**
 * Multi-runtime skill executor.
 */

import type { Skill, SkillInvocationInput } from "./types.ts";

export interface SkillExecutionResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface ExecutorOptions {
  timeoutMs?: number;
  projectDir?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function executeSkill(
  skill: Skill,
  input: SkillInvocationInput,
  options: ExecutorOptions = {},
): Promise<SkillExecutionResult> {
  const runtime = skill.meta.runtime;
  if (!runtime) {
    return {
      success: false,
      error: { code: "NO_RUNTIME", message: "Skill has no declared runtime" },
    };
  }

  const entry = skill.meta.entry;
  if (runtime !== "wasm" && !entry) {
    return {
      success: false,
      error: { code: "NO_ENTRY", message: "Skill has no declared entry" },
    };
  }

  const command = buildCommand(skill, runtime, entry);
  if (!command) {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_RUNTIME",
        message: `Unsupported runtime: ${runtime}`,
      },
    };
  }

  const payload = {
    inputs: input.inputs ?? {},
    context: input.context ?? {},
  };

  const timeoutMs = input.timeout_ms ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const result = await runSubprocess(command, payload, skill.path, timeoutMs);
    return result;
  } catch (err) {
    return {
      success: false,
      error: {
        code: "EXECUTION_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function buildCommand(
  skill: Skill,
  runtime: NonNullable<Skill["meta"]["runtime"]>,
  entry: string | undefined,
): string[] | null {
  switch (runtime) {
    case "wasm": {
      const source = skill.source;
      if (source.type !== "mooncakes" || !source.package || !source.version) {
        return null;
      }
      const coordinate = entry
        ? `${source.package}@${source.version}/${entry}`
        : `${source.package}@${source.version}`;
      return ["moon", "runwasm", coordinate];
    }
    case "deno": {
      const perms = buildDenoPermissions(skill);
      return ["deno", "run", ...perms, entry!];
    }
    case "python": {
      return ["python", entry!];
    }
    default:
      return null;
  }
}

function buildDenoPermissions(skill: Skill): string[] {
  const perms: string[] = [];
  const readPaths = skill.meta.permissions?.read ?? [];

  if (readPaths.length === 0) {
    perms.push("--allow-read=./");
  } else {
    perms.push(`--allow-read=${readPaths.join(",")}`);
  }

  const envVars = skill.meta.permissions?.env ?? [];
  if (envVars.length === 0) {
    perms.push("--allow-env=PATH");
  } else {
    perms.push(`--allow-env=${envVars.join(",")}`);
  }

  const runCmds = skill.meta.permissions?.run ?? [];
  if (runCmds.length > 0) {
    perms.push(`--allow-run=${runCmds.join(",")}`);
  }

  const writePaths = skill.meta.permissions?.write ?? [];
  if (writePaths.length > 0) {
    if (writePaths.includes("*")) {
      perms.push("--allow-write");
    } else {
      perms.push(`--allow-write=${writePaths.join(",")}`);
    }
  }

  const netHosts = skill.meta.permissions?.net ?? [];
  if (netHosts.length > 0) {
    if (netHosts.includes("*")) {
      perms.push("--allow-net");
    } else {
      perms.push(`--allow-net=${netHosts.join(",")}`);
    }
  }

  return perms;
}

async function runSubprocess(
  command: string[],
  payload: Record<string, unknown>,
  cwd: string,
  timeoutMs: number,
): Promise<SkillExecutionResult> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const process = new Deno.Command(command[0], {
      args: command.slice(1),
      cwd,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      signal: abortController.signal,
    });

    const child = process.spawn();

    const encoder = new TextEncoder();
    const stdin = child.stdin.getWriter();
    await stdin.write(encoder.encode(JSON.stringify(payload)));
    await stdin.close();

    const output = await child.output();
    clearTimeout(timeoutId);

    const decoder = new TextDecoder();
    const stdout = decoder.decode(output.stdout).trim();
    const stderr = decoder.decode(output.stderr).trim();

    if (output.signal === "SIGABRT") {
      return {
        success: false,
        error: {
          code: "TIMEOUT",
          message: `Skill execution timed out after ${timeoutMs}ms`,
        },
      };
    }

    if (output.code !== 0) {
      return {
        success: false,
        error: {
          code: "NON_ZERO_EXIT",
          message: stderr || `Process exited with code ${output.code}`,
        },
      };
    }

    if (!stdout) {
      return { success: true, data: {} };
    }

    try {
      const parsed = JSON.parse(stdout);
      return { success: true, data: parsed };
    } catch {
      return {
        success: false,
        error: {
          code: "INVALID_JSON_OUTPUT",
          message: `Skill output is not valid JSON: ${
            stdout.substring(0, 200)
          }`,
        },
      };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        success: false,
        error: {
          code: "TIMEOUT",
          message: `Skill execution timed out after ${timeoutMs}ms`,
        },
      };
    }
    throw err;
  }
}
