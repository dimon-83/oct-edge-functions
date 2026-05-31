/**
 * In-memory MCP session store for SSE transport.
 * Sufficient for single-instance dev environment.
 */

export interface McpSession {
  id: string;
  createdAt: number;
  lastActivity: number;
  messageEndpoint: string;
}

const sessions = new Map<string, McpSession>();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function createSession(): McpSession {
  const id = crypto.randomUUID();
  const now = Date.now();
  const session: McpSession = {
    id,
    createdAt: now,
    lastActivity: now,
    messageEndpoint: `/mcp/message?session_id=${id}`,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): McpSession | undefined {
  const session = sessions.get(id);
  if (session) {
    session.lastActivity = Date.now();
  }
  return session;
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      sessions.delete(id);
    }
  }
}

// Periodic cleanup every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
