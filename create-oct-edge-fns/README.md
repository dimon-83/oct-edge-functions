# create-oct-edge-fns

Scaffold a new [Oct Edge Functions](https://github.com/your-org/oct-edge-functions) project.

## Usage

```bash
# npm 7+
npm create oct-edge-fns@latest

# npm 6
npm create oct-edge-fns@latest my-project

# npx
npx create-oct-edge-fns@latest

# pnpm
pnpm create oct-edge-fns@latest

# yarn
yarn create oct-edge-fns
```

## Features

- **Interactive Setup** — Choose template and features via prompts
- **Templates**:
  - `default` — Full project with sample functions
  - `minimal` — Bare minimum setup
- **Optional Features**:
  - Docker + Docker Compose
  - MCP Server (AI Agent integration)
  - Auth Plugin (Bearer Token → PostgREST JWT)
  - CORS Plugin
  - Logging Plugin

## Requirements

- Node.js >= 18
- Docker + Docker Compose (optional, for containerized setup)
- Deno 2.x (optional, for local development)

## License

MIT
