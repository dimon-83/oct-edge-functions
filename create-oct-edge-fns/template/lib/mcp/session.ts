export interface McpSession {
  id: string;
  createdAt: number;
  lastActivity: number;
  messageEndpoint: string;
  controller?: ReadableStreamDefaultController<Uint8Array>;
}

export interface SessionStore {
  create(): McpSession;
  get(id: string): McpSession | undefined;
  delete(id: string): boolean;
  cleanupExpired(): void;
  startCleanup(intervalMs?: number): void;
  stopCleanup(): void;
}

export class InMemorySessionStore implements SessionStore {
  #sessions = new Map<string, McpSession>();
  #intervalId: ReturnType<typeof setInterval> | null = null;
  readonly #timeoutMs: number;

  constructor(timeoutMs = 30 * 60 * 1000) {
    this.#timeoutMs = timeoutMs;
  }

  create(): McpSession {
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: McpSession = {
      id,
      createdAt: now,
      lastActivity: now,
      messageEndpoint: `/mcp/message?session_id=${id}`,
    };
    this.#sessions.set(id, session);
    return session;
  }

  get(id: string): McpSession | undefined {
    const session = this.#sessions.get(id);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  delete(id: string): boolean {
    return this.#sessions.delete(id);
  }

  cleanupExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.#sessions.entries()) {
      if (now - session.lastActivity > this.#timeoutMs) {
        this.#sessions.delete(id);
      }
    }
  }

  startCleanup(intervalMs = 5 * 60 * 1000): void {
    if (this.#intervalId !== null) return;
    this.#intervalId = setInterval(() => this.cleanupExpired(), intervalMs);
  }

  stopCleanup(): void {
    if (this.#intervalId !== null) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }
}

const defaultStore = new InMemorySessionStore();
defaultStore.startCleanup();

export const createSession = defaultStore.create.bind(defaultStore);
export const getSession = defaultStore.get.bind(defaultStore);
export const deleteSession = defaultStore.delete.bind(defaultStore);
