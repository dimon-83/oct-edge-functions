export type LogLevel = "debug" | "info" | "error";

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, error: 2 };

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

export interface LoggerConfig {
  level?: LogLevel;
  logDir?: string;
  maxBytes?: number;
  maxFiles?: number;
}

export class LoggerFactory {
  #configuredLevel: LogLevel;
  #logDir: string;
  #maxBytes: number;
  #maxFiles: number;
  #fileWriter: RotatingFileWriter | null = null;
  #writerReady: Promise<void> | null = null;

  constructor(config: LoggerConfig = {}) {
    this.#configuredLevel = config.level ??
      (Deno.env.get("LOG_LEVEL") as LogLevel) ?? "info";
    this.#logDir = config.logDir ?? Deno.env.get("LOG_DIR") ?? "./logs";
    this.#maxBytes = config.maxBytes ??
      parseInt(Deno.env.get("LOG_MAX_BYTES") ?? String(10 * 1024 * 1024), 10);
    this.#maxFiles = config.maxFiles ??
      parseInt(Deno.env.get("LOG_MAX_FILES") ?? "5", 10);
  }

  get level(): LogLevel {
    return this.#configuredLevel;
  }

  shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.#configuredLevel];
  }

  async #ensureWriter(): Promise<void> {
    if (this.#fileWriter) return;
    if (!this.#writerReady) {
      this.#writerReady = Deno.mkdir(this.#logDir, { recursive: true })
        .then(() => {
          this.#fileWriter = new RotatingFileWriter(
            `${this.#logDir}/app.log`,
            this.#maxBytes,
            this.#maxFiles,
          );
        })
        .catch(() => {});
    }
    await this.#writerReady;
  }

  #log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(level)) return;

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

    this.#ensureWriter().then(() => this.#fileWriter?.writeLine(output));
  }

  createLogger(requestId?: string): Logger {
    if (!requestId) {
      return {
        debug: (message, meta) => this.#log("debug", message, meta),
        info: (message, meta) => this.#log("info", message, meta),
        error: (message, meta) => this.#log("error", message, meta),
      };
    }
    return {
      debug: (message, meta) =>
        this.#log("debug", message, { requestId, ...meta }),
      info: (message, meta) =>
        this.#log("info", message, { requestId, ...meta }),
      error: (message, meta) =>
        this.#log("error", message, { requestId, ...meta }),
    };
  }

  close(): void {
    this.#fileWriter?.close();
    this.#fileWriter = null;
  }
}

const defaultFactory: LoggerFactory = new LoggerFactory();

export const shouldLog: (level: LogLevel) => boolean = defaultFactory.shouldLog
  .bind(defaultFactory);
export const logger: Logger = defaultFactory.createLogger();
export const createRequestLogger = (requestId: string): Logger =>
  defaultFactory.createLogger(requestId);
export const closeLogger = (): void => {
  defaultFactory.close();
};
