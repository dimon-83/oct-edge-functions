#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import prompts from "prompts";
import { cyan, yellow, green, red, reset, dim } from "kolorist";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES = [
  {
    name: "default",
    display: "Default",
    color: cyan,
    description: "Standard Oct Edge Functions project with all features",
  },
  {
    name: "minimal",
    display: "Minimal",
    color: yellow,
    description: "Bare minimum setup, no sample functions or crons",
  },
];

const HELPERS = [
  { name: "docker", display: "Docker + Docker Compose", color: cyan, checked: true },
  { name: "mcp", display: "MCP Server (Dev)", color: green, checked: true },
  { name: "crons", display: "Cron Tasks", color: green, checked: true },
  { name: "auth", display: "Auth Plugin", color: yellow, checked: true },
  { name: "cors", display: "CORS Plugin", color: reset, checked: true },
  { name: "logging", display: "Logging Plugin", color: cyan, checked: true },
  { name: "rate-limit", display: "Rate Limit Plugin", color: red, checked: false },
];

function printBanner() {
  console.log();
  console.log(`${cyan("◆")}  ${cyan("create-oct-edge-fns")}  ${dim("v1.1.0")}`);
  console.log(`${cyan("|")}`);
}

function printHelp() {
  printBanner();
  console.log(`${cyan("|")}  ${green("Usage:")}`);
  console.log(`${cyan("|")}    npm create oct-edge-fns@latest [project-name] [options]`);
  console.log(`${cyan("|")}`);
  console.log(`${cyan("|")}  ${green("Options:")}`);
  console.log(`${cyan("|")}    -t, --template <name>     Template: default | minimal (default: default)`);
  console.log(`${cyan("|")}    --port <number>           Server port (default: 18080)`);
  console.log(`${cyan("|")}    --no-docker               Skip Docker setup`);
  console.log(`${cyan("|")}    --no-mcp                  Skip MCP server`);
  console.log(`${cyan("|")}    --no-crons                Skip cron tasks`);
  console.log(`${cyan("|")}    --no-auth                 Skip auth plugin`);
  console.log(`${cyan("|")}    --no-cors                 Skip CORS plugin`);
  console.log(`${cyan("|")}    --no-logging              Skip logging plugin`);
  console.log(`${cyan("|")}    --rate-limit              Include rate-limit plugin`);
  console.log(`${cyan("|")}    --all                     Include all features`);
  console.log(`${cyan("|")}    -y, --yes                 Skip prompts, use defaults`);
  console.log(`${cyan("|")}    -h, --help                Show this help`);
  console.log(`${cyan("|")}`);
  console.log(`${cyan("|")}  ${green("Plugins:")}`);
  console.log(`${cyan("|")}    Plugins are system-level middleware that run on every request.`);
  console.log(`${cyan("|")}    Each plugin lives in plugins/<name>/index.ts and can be customized.`);
  console.log(`${cyan("|")}`);
  console.log(`${cyan("|")}  ${green("Examples:")}`);
  console.log(`${cyan("|")}    npm create oct-edge-fns@latest my-app`);
  console.log(`${cyan("|")}    npm create oct-edge-fns@latest my-app -t minimal --no-docker`);
  console.log(`${cyan("|")}    npm create oct-edge-fns@latest my-app --rate-limit --no-crons`);
  console.log(`${cyan("|")}    npm create oct-edge-fns@latest my-app -y`);
  console.log();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    projectName: null,
    template: "default",
    helpers: null, // null = interactive, [] = none, [...] = specific
    port: null,
    yes: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      result.help = true;
      return result;
    }

    if (arg === "-y" || arg === "--yes") {
      result.yes = true;
      continue;
    }

    if (arg === "-t" || arg === "--template") {
      result.template = args[++i];
      continue;
    }

    if (arg === "--port") {
      result.port = args[++i];
      continue;
    }

    if (arg === "--all") {
      result.helpers = HELPERS.map((h) => h.name);
      continue;
    }

    if (arg === "--rate-limit") {
      if (result.helpers === null) result.helpers = HELPERS.filter((h) => h.checked).map((h) => h.name);
      if (!result.helpers.includes("rate-limit")) result.helpers.push("rate-limit");
      continue;
    }

    if (arg.startsWith("--no-")) {
      const helperName = arg.slice(5);
      if (HELPERS.some((h) => h.name === helperName)) {
        if (result.helpers === null) result.helpers = HELPERS.filter((h) => h.checked).map((h) => h.name);
        result.helpers = result.helpers.filter((h) => h !== helperName);
      }
      continue;
    }

    if (!arg.startsWith("-")) {
      result.projectName = arg;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  printBanner();

  let targetDir = args.projectName;

  // Interactive: ask for project name
  if (!targetDir) {
    const result = await prompts(
      {
        type: "text",
        name: "projectName",
        message: `${cyan("?")}  Project name:`,
        initial: "my-edge-functions",
        validate: (value) => value.trim().length > 0 || "Project name is required",
      },
      {
        onCancel: () => {
          console.log(`${red("✖")}  Operation cancelled`);
          process.exit(0);
        },
      }
    );
    targetDir = result.projectName.trim();
  }

  const root = path.resolve(targetDir);

  // Check if directory exists and is not empty
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
    const { overwrite } = await prompts(
      {
        type: "confirm",
        name: "overwrite",
        message: `${yellow("!")}  Directory "${targetDir}" is not empty. Overwrite?`,
        initial: false,
      },
      {
        onCancel: () => {
          console.log(`${red("✖")}  Operation cancelled`);
          process.exit(0);
        },
      }
    );
    if (!overwrite) {
      console.log(`${red("✖")}  Operation cancelled`);
      process.exit(0);
    }
    fs.rmSync(root, { recursive: true });
  }

  fs.mkdirSync(root, { recursive: true });
  console.log(`${cyan("|")}`);

  // Template selection
  let template = args.template;
  if (!args.yes && !TEMPLATES.find((t) => t.name === template)) {
    const result = await prompts(
      {
        type: "select",
        name: "template",
        message: `${cyan("?")}  Select a template:`,
        choices: TEMPLATES.map((t) => ({
          title: t.color(t.display),
          value: t.name,
          description: t.description,
        })),
      },
      {
        onCancel: () => {
          console.log(`${red("✖")}  Operation cancelled`);
          process.exit(0);
        },
      }
    );
    template = result.template;
  }

  console.log(`${cyan("|")}`);

  // Helper selection
  let helpers = args.helpers;
  if (!args.yes && helpers === null) {
    const result = await prompts(
      {
        type: "multiselect",
        name: "helpers",
        message: `${cyan("?")}  Select features:`,
        choices: HELPERS.map((h) => ({
          title: h.color(h.display),
          value: h.name,
          selected: h.checked,
        })),
        instructions: false,
        hint: "- Space to select. Return to submit",
      },
      {
        onCancel: () => {
          console.log(`${red("✖")}  Operation cancelled`);
          process.exit(0);
        },
      }
    );
    helpers = result.helpers || [];
  } else if (helpers === null) {
    helpers = HELPERS.filter((h) => h.checked).map((h) => h.name);
  }

  console.log(`${cyan("|")}`);

  // Port selection
  let port = args.port;
  if (!args.yes && !port) {
    const result = await prompts(
      {
        type: "text",
        name: "port",
        message: `${cyan("?")}  Server port:`,
        initial: "18080",
        validate: (value) => {
          const num = parseInt(value, 10);
          if (isNaN(num) || num < 1 || num > 65535) {
            return "Please enter a valid port number (1-65535)";
          }
          return true;
        },
      },
      {
        onCancel: () => {
          console.log(`${red("✖")}  Operation cancelled`);
          process.exit(0);
        },
      }
    );
    port = result.port || "18080";
  }
  if (!port) {
    port = "18080";
  }

  console.log(`${cyan("|")}`);

  // Copy template files
  const templateDir = path.join(__dirname, "..", "template");
  copyDir(templateDir, root, { template, helpers });

  // Rename gitignore
  const gitignoreSrc = path.join(root, "_gitignore");
  const gitignoreDest = path.join(root, ".gitignore");
  if (fs.existsSync(gitignoreSrc)) {
    fs.renameSync(gitignoreSrc, gitignoreDest);
  }

  // Process template variables
  processTemplate(root, { projectName: path.basename(root), helpers, port });

  // Minimal template: remove sample functions and crons
  if (template === "minimal") {
    const functionsDir = path.join(root, "functions");
    if (fs.existsSync(functionsDir)) {
      fs.rmSync(functionsDir, { recursive: true });
    }
    fs.mkdirSync(functionsDir, { recursive: true });

    const cronsDir = path.join(root, "crons");
    if (fs.existsSync(cronsDir)) {
      fs.rmSync(cronsDir, { recursive: true });
    }

    // Write empty functions.json
    fs.writeFileSync(
      path.join(root, "functions.json"),
      JSON.stringify({ functions: [] }, null, 2) + "\n"
    );
  }

  // Remove unselected plugins
  const allPlugins = ["auth", "cors", "logging", "rate-limit"];
  const selectedPlugins = helpers.filter((h) => allPlugins.includes(h));
  for (const plugin of allPlugins) {
    if (!selectedPlugins.includes(plugin)) {
      const pluginDir = path.join(root, "plugins", plugin);
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true });
      }
    }
  }

  // Remove crons dir if not selected
  if (!helpers.includes("crons")) {
    const cronsDir = path.join(root, "crons");
    if (fs.existsSync(cronsDir)) {
      fs.rmSync(cronsDir, { recursive: true });
    }
    // Remove startCrons from main.ts
    const mainPath = path.join(root, "main.ts");
    if (fs.existsSync(mainPath)) {
      let content = fs.readFileSync(mainPath, "utf-8");
      content = content.replace(/\nawait startCrons\(\{ cronsDir: CRONS_DIR \}\);\n/, "\n");
      content = content.replace(/, startCrons/, "");
      content = content.replace(/const CRONS_DIR = Deno\.env\.get\("CRONS_DIR"\) \?\? "\.\/crons";\n/, "");
      fs.writeFileSync(mainPath, content);
    }
  }

  // Update main.ts: only import selected plugins
  const mainPath = path.join(root, "main.ts");
  if (fs.existsSync(mainPath)) {
    let content = fs.readFileSync(mainPath, "utf-8");

    // Remove unselected plugin imports
    if (!helpers.includes("auth")) {
      content = content.replace(/import \{ authMiddlewares \} from "\.\/plugins\/auth\/index\.ts";\n/, "");
      content = content.replace(/\s*\.\.\.authMiddlewares,/, "");
    }
    if (!helpers.includes("cors")) {
      content = content.replace(/import \{ corsPlugin \} from "\.\/plugins\/cors\/index\.ts";\n/, "");
      content = content.replace(/\s*\.\.\.corsPlugin,/, "");
    }
    if (!helpers.includes("logging")) {
      content = content.replace(/import \{ loggingPlugin \} from "\.\/plugins\/logging\/index\.ts";\n/, "");
      content = content.replace(/\s*\.\.\.loggingPlugin,/, "");
    }
    if (helpers.includes("rate-limit")) {
      content = content.replace(
        /import \{ corsPlugin \} from "\.\/plugins\/cors\/index\.ts";/,
        'import { corsPlugin } from "./plugins/cors/index.ts";\nimport { rateLimitPlugin } from "./plugins/rate-limit/index.ts";'
      );
      content = content.replace(
        /\.\.\.corsPlugin,/,
        "...corsPlugin,\n  ...rateLimitPlugin,"
      );
    }

    fs.writeFileSync(mainPath, content);
  }

  // Print success
  console.log(`${green("✔")}  Project created in ${cyan(root)}`);
  console.log(`${cyan("|")}`);
  console.log(`${cyan("◆")}  ${green("Next steps:")}`);
  console.log(`${cyan("|")}`);
  console.log(`${cyan("|")}  cd ${targetDir}`);

  const displayPort = port || "18080";
  if (helpers.includes("docker")) {
    console.log(`${cyan("|")}  docker compose up -d`);
    console.log(`${cyan("|")}`);
    console.log(`${cyan("|")}  HTTP API: http://localhost:${displayPort}`);
    if (helpers.includes("mcp")) {
      console.log(`${cyan("|")}  MCP SSE:  http://localhost:${displayPort}/mcp/sse`);
    }
  } else {
    console.log(`${cyan("|")}  deno task start`);
    console.log(`${cyan("|")}`);
    console.log(`${cyan("|")}  HTTP API: http://localhost:${displayPort}`);
    if (helpers.includes("mcp")) {
      console.log(`${cyan("|")}  MCP SSE:  http://localhost:${displayPort}/mcp/sse`);
    }
  }

  console.log(`${cyan("|")}`);
  console.log(`${cyan("◆")}  ${green("Happy coding!")}`);
  console.log();
}

function copyDir(srcDir, destDir, options) {
  fs.mkdirSync(destDir, { recursive: true });

  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);

    const stat = fs.statSync(srcFile);

    if (stat.isDirectory()) {
      copyDir(srcFile, destFile, options);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  }
}

function processTemplate(dir, vars) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      processTemplate(filePath, vars);
    } else if (
      file.endsWith(".ts") ||
      file.endsWith(".json") ||
      file.endsWith(".yml") ||
      file.endsWith(".md") ||
      file.endsWith(".sh") ||
      file.endsWith(".env") ||
      file.endsWith("Dockerfile") ||
      file === "Makefile"
    ) {
      let content = fs.readFileSync(filePath, "utf-8");
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, vars.projectName);
      if (vars.port) {
        content = content.replace(/\{\{PORT\}\}/g, vars.port);
        content = content.replace(/\{\{PORT_DEV\}\}/g, vars.port);
        const prodPort = String(parseInt(vars.port, 10) + 1);
        content = content.replace(/\{\{PORT_PROD\}\}/g, prodPort);
      }
      fs.writeFileSync(filePath, content);
    }
  }
}

main().catch((err) => {
  console.error(red(err.message));
  process.exit(1);
});
