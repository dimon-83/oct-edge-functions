FROM denoland/deno:alpine-2.0.6

WORKDIR /app

COPY deno.json .
COPY main.ts .
COPY lib/ lib/
COPY plugins/ plugins/
COPY functions/ functions/

RUN deno cache main.ts

RUN addgroup -S app && adduser -S -G app deno
USER deno

EXPOSE 8080

ENV FUNCTIONS_DIR=/app/functions

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD deno eval "fetch('http://localhost:8080/').catch(() => {}).then(r => { if (!r) throw new Error('not ready'); Deno.exit(r.ok ? 0 : 1); })"

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]
