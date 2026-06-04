#!/usr/bin/env node

const { program } = require("commander");
const fs = require("fs");
const path = require("path");

const EXAMPLE_DIR = path.join(__dirname, "example");

program
  .name("create-oct-edge-fns")
  .description("Scaffold a new oct-edge-functions project")
  .argument("[project-name]", "Project name (creates a directory with this name)")
  .option("-f, --force", "Overwrite existing directory")
  .action(run);

program.parse(process.argv);

function run(projectName, options) {
  projectName = projectName || "my-edge-function";
  const targetDir = path.resolve(process.cwd(), projectName);
  const name = path.basename(targetDir);

  if (fs.existsSync(targetDir)) {
    if (options.force) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } else {
      console.error(`❌ Directory "${projectName}" already exists. Use --force to overwrite.`);
      process.exit(1);
    }
  }

  console.log(`\n🚀 Creating oct-edge-functions project: ${projectName}\n`);

  copyDir(EXAMPLE_DIR, targetDir, name);

  console.log("📁 Project structure:");
  printTree(targetDir, projectName);

  console.log(`\n✅ Project created successfully!\n`);
  console.log(`  cd ${projectName}`);
  console.log(`  deno task dev\n`);
}

function copyDir(src, dest, projectName) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of entries) {
    if (entry.name === ".gitkeep") continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, projectName);
    } else {
      let content = fs.readFileSync(srcPath, "utf-8");
      content = content.replace(/example/g, projectName);
      fs.writeFileSync(destPath, content, "utf-8");
    }
  }
}

function printTree(dir, rootName) {
  function walk(currentDir, prefix) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true }).filter(
      (e) => !e.name.startsWith(".") || e.name === ".gitignore" || e.name === ".env.example",
    );
    entries.forEach((entry, i) => {
      const isLast = i === entries.length - 1;
      const connector = isLast ? "└── " : "├── ";
      console.log(prefix + connector + entry.name);
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name), prefix + (isLast ? "    " : "│   "));
      }
    });
  }
  console.log(rootName + "/");
  walk(dir, "");
}
