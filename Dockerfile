FROM docker.m.daocloud.io/denoland/deno:alpine-2.0.6 AS builder

WORKDIR /app

COPY deno.json deno.lock* ./

COPY lib/ lib/
COPY plugins/ plugins/
COPY main.ts .
COPY functions.json .
RUN deno cache main.ts lib/db.ts lib/server.ts lib/server.types.ts lib/mcp/server.ts lib/mcp/tools.ts lib/mcp/session.ts lib/mcp/types.ts lib/mcp/registry.ts lib/mcp/adapters/index.ts lib/mcp/adapters/registry_store.ts lib/mcp/adapters/test_runner.ts lib/mcp/adapters/linter.ts lib/mcp/adapters/sql_executor.ts lib/mcp/adapters/build_service.ts lib/testing.ts plugins/auth/index.ts plugins/cors/index.ts plugins/logging/index.ts
RUN deno cache main.ts lib/mod.ts lib/db.ts lib/server.ts lib/server.types.ts lib/middleware.ts lib/context.ts lib/logger.ts lib/testing.ts lib/pg.ts \
  lib/mcp/server.ts lib/mcp/tools.ts lib/mcp/session.ts lib/mcp/types.ts lib/mcp/registry.ts \
  lib/mcp/adapters/index.ts lib/mcp/adapters/registry_store.ts lib/mcp/adapters/test_runner.ts lib/mcp/adapters/linter.ts lib/mcp/adapters/sql_executor.ts lib/mcp/adapters/build_service.ts \
  lib/plugins/cors.ts lib/plugins/logging.ts \
  plugins/auth/index.ts

FROM docker.m.daocloud.io/denoland/deno:alpine-2.0.6

WORKDIR /app

COPY --from=builder /app/deno.json .
COPY --from=builder /app/functions.json .
COPY --from=builder /app/main.ts .
COPY lib/ lib/
COPY plugins/ plugins/
COPY functions/ functions/

RUN deno cache main.ts

RUN addgroup -S app && adduser -S -G app deno
USER deno

EXPOSE 18080

ENV FUNCTIONS_DIR=/app/functions

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD deno eval "fetch('http://localhost:18080/').catch(() => {}).then(r => { if (!r) throw new Error('not ready'); Deno.exit(r.ok ? 0 : 1); })"

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]
