FROM docker.m.daocloud.io/denoland/deno:alpine-2.0.6

WORKDIR /app

# Pre-cache dependencies
COPY deno.json .
COPY functions.json .
COPY lib/ lib/
COPY main.ts .
COPY plugins/ plugins/
RUN deno cache main.ts lib/db.ts lib/server.ts lib/server.types.ts lib/mcp/server.ts lib/mcp/tools.ts lib/mcp/session.ts lib/mcp/types.ts lib/mcp/registry.ts lib/mcp/adapters/index.ts lib/mcp/adapters/registry_store.ts lib/mcp/adapters/test_runner.ts lib/mcp/adapters/linter.ts lib/mcp/adapters/sql_executor.ts lib/mcp/adapters/build_service.ts lib/testing.ts plugins/auth/index.ts plugins/cors/index.ts plugins/logging/index.ts

# Copy functions
COPY functions /app/functions

RUN find functions -name '*.ts' | xargs deno cache

USER deno

EXPOSE 18080

ENV FUNCTIONS_DIR=/app/functions

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]
