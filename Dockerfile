FROM docker.m.daocloud.io/denoland/deno:alpine-2.0.6

WORKDIR /app

# Pre-cache dependencies
COPY deno.json .
COPY functions.json .
COPY lib/*.ts lib/
COPY lib/mcp/*.ts lib/mcp/
COPY lib/templates/*.ts lib/templates/
COPY main.ts .
COPY plugins/ plugins/
RUN deno cache main.ts lib/db.ts lib/mcp/server.ts lib/mcp/tools.ts lib/mcp/session.ts lib/testing.ts plugins/auth/index.ts plugins/cors/index.ts plugins/logging/index.ts

# Copy functions
COPY functions /app/functions

RUN find functions -name '*.ts' | xargs deno cache

USER deno

EXPOSE 18080

ENV FUNCTIONS_DIR=/app/functions

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]
