#!/usr/bin/env -S deno run --allow-net --allow-read
/**
 * MCP stdio proxy for Trae integration
 * Forwards stdio to SSE endpoint
 */

const SSE_URL = "http://localhost:{{PORT_DEV}}/mcp/sse";

async function main() {
  console.error("[MCP Proxy] Connecting to", SSE_URL);

  const response = await fetch(SSE_URL);
  if (!response.ok) {
    console.error("[MCP Proxy] Failed to connect:", response.status);
    Deno.exit(1);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    console.error("[MCP Proxy] No response body");
    Deno.exit(1);
  }

  let messageEndpoint = "";

  // Read SSE events
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data.includes("/mcp/message")) {
          messageEndpoint = data;
          console.error("[MCP Proxy] Got endpoint:", messageEndpoint);
        }
      }
    }

    if (messageEndpoint) break;
  }

  if (!messageEndpoint) {
    console.error("[MCP Proxy] No message endpoint received");
    Deno.exit(1);
  }

  // Forward stdin to HTTP POST
  const buffer = new Uint8Array(1024);
  while (true) {
    const n = await Deno.stdin.read(buffer);
    if (n === null) break;

    const message = new TextDecoder().decode(buffer.subarray(0, n));
    const url = `http://localhost:{{PORT_DEV}}${messageEndpoint}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: message,
      });

      const result = await response.json();
      console.log(JSON.stringify(result));
    } catch (err) {
      console.error("[MCP Proxy] Error:", err);
    }
  }
}

main();
