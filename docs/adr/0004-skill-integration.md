# ADR 0004: Skill Integration for Domain-Centric Agent Capabilities

## Status

Accepted

## Context

AI coding agents using oct-edge-functions need to perform tasks that are tightly
coupled to a specific business domain. A concrete example is generating baseline
SQL for water-treatment inlet monitoring points: the agent must understand what
an "inlet point" is, know the target database schema, and produce correctly
structured INSERT statements from an uploaded Excel file.

These tasks do not fit the existing **Function** model well:

- They are not general-purpose HTTP endpoints.
- They require embedded domain knowledge that changes per project.
- They often combine reasoning (reading instructions) with deterministic
  execution (parsing Excel, mapping columns, emitting SQL).

At the same time, the ecosystem has converged on **Skills** as a way to package
domain knowledge for agents. Anthropic's skills are directories with a
`SKILL.md` file; mooncakes.io packages skills as pre-compiled WASM executables.
We want oct-edge-functions to consume and manage such skills through its MCP
server.

## Decision

Integrate Skill management and execution into the oct-edge-functions MCP server.

### 1. Skill Is an External Capability Package

A **Skill** is a reusable domain capability package consumed by the MCP server.
It is authored outside the project and installed into the workspace.

- Minimum content: a `SKILL.md` with YAML frontmatter and agent instructions.
- Optional content: an executable entry point (WASM, TypeScript/JavaScript, or
  Python) invoked by the MCP server.
- Location: `.claude/skills/<name>/` (Anthropic-compatible) or `skills/<name>/`.

### 2. Skill Registry

A `skills.json` file at the project root records which skills are installed and
enabled:

```json
{
  "version": "1.0.0",
  "skills_dir": ".claude/skills",
  "skills": [
    {
      "name": "pptz",
      "enabled": false,
      "source": {
        "type": "mooncakes",
        "package": "Milky2018/pptz",
        "version": "0.6.0",
        "git_url": "https://github.com/Milky2018/pptz.git"
      },
      "install": {
        "directory": ".claude/skills/pptz"
      }
    }
  ]
}
```

- `source.type` is one of `mooncakes | npm | git | local`.
- `install.command` is optional; when omitted the MCP server generates a default
  command from the source type.
- `version` is an exact version for reproducible installs.
- For `mooncakes` sources, prefer `git_url`; when present the server installs the
  skill with `npx skills add <git_url>`, which works for any Git-based skill
  (including MoonBit WASM skills published to mooncakes.io).

### 3. Discovery and Activation

The MCP server discovers skills by scanning `.claude/skills/*/` and
`skills/*/`. Only skills listed in `skills.json` with `enabled: true` are exposed
to agents.

### 4. Runtime Support

Skills are executed in a subprocess using stdin/stdout JSON:

| Runtime | Supported languages / source | Execution command |
| ------- | ---------------------------- | ----------------- |
| `wasm`  | MoonBit WASM from mooncakes.io | `moon runwasm <package>@<version>/<entry>` |
| `deno`  | TypeScript / JavaScript      | `deno run --allow-read --allow-env <entry>` |
| `python`| Python                       | `python <entry>` |

Node is intentionally merged into Deno because Deno can run JavaScript and
sharing one runtime reduces image size.

### 5. Pure-Function Execution Model

Skills are pure functions of `inputs` + `context`:

- `inputs`: user-provided data such as file bytes or form objects.
- `context`: additional information the agent gathers before invoking the skill,
  such as database schema from a separate PostgreSQL MCP server.

If a skill needs side effects (executing SQL), it returns the desired action in
its output data and the agent decides whether to perform it through the
appropriate MCP tool.

### 6. Multi-MCP Architecture

oct-edge-functions does not need to become a universal database client. Database
introspection and SQL execution are delegated to a PostgreSQL MCP server that
OpenCode also connects to. The oct-edge-functions MCP server focuses on:

- Function lifecycle management.
- Skill discovery, installation, and execution.

### 7. MCP Tools for Skills

The following tools are added to the MCP server:

| Tool              | Purpose                                           |
| ----------------- | ------------------------------------------------- |
| `list_skills`     | List discovered skills with status and runtime    |
| `get_skill`       | Read a skill's `SKILL.md` and metadata            |
| `register_skill`  | Add a skill to `skills.json`                      |
| `unregister_skill`| Remove a skill from `skills.json`                 |
| `install_skills`  | Install or update skills according to `skills.json` |
| `invoke_skill`    | Execute a skill's entry point                     |
| `suggest_skill`   | Recommend skills based on text/file metadata      |

## Consequences

### Positive

- Domain knowledge can be packaged, versioned, and reused across projects.
- Agents can handle business-specific tasks without every detail being hardcoded
  into prompts.
- WASM skills from mooncakes.io run in a sandboxed, cross-platform runtime.
- Existing Function and database tools remain unchanged; Skills complement them.

### Negative

- Docker image must include `moon`, `deno`, and `python` runtimes.
- Subprocess execution adds overhead compared to in-process function calls.
- Skill authors must follow the `SKILL.md` frontmatter and stdin/stdout JSON
  contract.
- Database context must be fetched by the agent through a separate MCP server,
  adding one round-trip.

## Alternatives Considered

1. **Implement skills as special Functions** — Rejected: Functions are HTTP
   handlers with a lifecycle; skills are agent instructions and may not expose
   URLs.
2. **Allow skills to open their own database connections** — Rejected: complicates
   WASM execution and blurs security boundaries; pure functions are easier to
   test and sandbox.
3. **Support arbitrary WASM sources** — Rejected: first version focuses on the
   mooncakes.io ecosystem where `moon runwasm` provides a uniform execution
   model.
4. **Keep Node as a separate runtime** — Rejected: Deno can execute JavaScript,
   so unifying under Deno reduces runtime sprawl.
