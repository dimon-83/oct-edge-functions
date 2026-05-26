export type LogLevel = "debug" | "info" | "error";

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, error: 2 };
const configuredLevel: LogLevel =
  (Deno.env.get("LOG_LEVEL") as LogLevel) ?? "info";

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

class RotatingFileWriter {
  #file: Deno.FsFile | null = null;
  #bytesWritten = 0;

  constructor(
    private path: string,
    private maxBytes: number,
    private maxFiles: number,
  ) {}

  async writeLine(line: string): Promise<void> {
    const data = new TextEncoder().encode(line + "\n");
    if (this.#bytesWritten + data.length > this.maxBytes) {
      await this.#rotate();
    }
    if (!this.#file) {
      await this.#open();
    }
    await this.#file!.write(data);
    this.#bytesWritten += data.length;
  }

  async #open(): Promise<void> {
    this.#file = await Deno.open(this.path, {
      create: true,
      append: true,
      write: true,
    });
    const info = await Deno.stat(this.path);
    this.#bytesWritten = info.size;
  }

  async #rotate(): Promise<void> {
    this.#close();
    for (let i = this.maxFiles; i > 0; i--) {
      const src = i === 1 ? this.path : `${this.path}.${i - 1}`;
      const dst = `${this.path}.${i}`;
      try {
        await Deno.rename(src, dst);
      } catch {
        // src may not exist on first rotation
      }
    }
  }

  #close(): void {
    this.#file?.close();
    this.#file = null;
  }

  close(): void {
    this.#close();
  }
}

const logDir = Deno.env.get("LOG_DIR") ?? "./logs";
const maxBytes = parseInt(
  Deno.env.get("LOG_MAX_BYTES") ?? String(10 * 1024 * 1024),
  10,
);
const maxFiles = parseInt(Deno.env.get("LOG_MAX_FILES") ?? "5", 10);

let fileWriter: RotatingFileWriter | null = null;
let writerReady: Promise<void> | null = null;

async function ensureWriter(): Promise<void> {
  if (fileWriter) return;
  if (writerReady) return writerReady;
  writerReady = (async () => {
    try {
      await Deno.mkdir(logDir, { recursive: true });
      fileWriter = new RotatingFileWriter(
        `${logDir}/app.log`,
        maxBytes,
        maxFiles,
      );
    } catch {
      // File logging unavailable — fall back to console only
    }
  })();
  return writerReady;
}

ensureWriter();

export function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[configuredLevel];
}

function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;

  const output = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });

  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }

  ensureWriter().then(() => fileWriter?.writeLine(output));
}

export const logger: Logger = {
  debug: (message, meta) => log("debug", message, meta),
  info: (message, meta) => log("info", message, meta),
  error: (message, meta) => log("error", message, meta),
};

export function createRequestLogger(requestId: string): Logger {
  return {
    debug: (message, meta) => log("debug", message, { requestId, ...meta }),
    info: (message, meta) => log("info", message, { requestId, ...meta }),
    error: (message, meta) => log("error", message, { requestId, ...meta }),
  };
}

export async function closeLogger(): Promise<void> {
  fileWriter?.close();
  fileWriter = null;
}
