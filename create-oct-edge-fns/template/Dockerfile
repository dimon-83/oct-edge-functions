FROM docker.m.daocloud.io/denoland/deno:alpine-2.0.6

WORKDIR /app

# Pre-cache dependencies
COPY deno.json .
COPY functions.json .
COPY main.ts .
COPY crons /app/crons
COPY plugins /app/plugins
RUN deno cache main.ts

# Copy functions
COPY functions /app/functions

RUN find functions -name '*.ts' ! -name 'test.ts' | xargs deno cache

USER deno

EXPOSE 18080

ENV FUNCTIONS_DIR=/app/functions

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]
