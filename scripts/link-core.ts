const [mode, targetDir] = Deno.args;
if (!mode || !targetDir) {
  console.error("Usage: deno run scripts/link-core.ts <link|unlink> <target-dir>");
  Deno.exit(1);
}

const denoJsonPath = targetDir + "/deno.json";
const json = JSON.parse(Deno.readTextFileSync(denoJsonPath));

json.imports = json.imports ?? {};

if (mode === "link") {
  const libPath = Deno.cwd() + "/lib";
  json.imports["@oct-edge-fns/core"] = libPath + "/mod.ts";
  json.imports["@oct-edge-fns/core/"] = libPath + "/";
  console.error(`✅ Linked @oct-edge-fns/core -> ${libPath}/`);
} else if (mode === "unlink") {
  delete json.imports["@oct-edge-fns/core"];
  delete json.imports["@oct-edge-fns/core/"];
  console.error("✅ Removed local link");
} else {
  console.error(`Unknown mode: ${mode}`);
  Deno.exit(1);
}

Deno.writeTextFileSync(denoJsonPath, JSON.stringify(json, null, 2) + "\n");
