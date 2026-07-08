FROM docker.m.daocloud.io/denoland/deno:alpine-2.0.6

WORKDIR /app

# Install runtime dependencies for skill execution
RUN apk add --no-cache curl bash python3

# Install MoonBit toolchain for WASM skill execution
ENV MOON_HOME=/usr/local/moon
RUN curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash -s -- \
  && ln -s "$MOON_HOME/bin/moon" /usr/local/bin/moon \
  && ln -s "$MOON_HOME/bin/moonc" /usr/local/bin/moonc \
  && ln -s "$MOON_HOME/bin/moonrun" /usr/local/bin/moonrun \
  && ln -s "$MOON_HOME/bin/moonfmt" /usr/local/bin/moonfmt

# Pre-cache dependencies
COPY deno.json .
COPY functions.json .
COPY skills.json .
COPY main.ts .
COPY crons /app/crons
COPY plugins /app/plugins
COPY skills /app/skills
RUN deno cache main.ts

# Copy functions
COPY functions /app/functions

RUN find functions -name '*.ts' ! -name 'test.ts' | xargs deno cache

USER deno

EXPOSE 18080

ENV FUNCTIONS_DIR=/app/functions

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]
