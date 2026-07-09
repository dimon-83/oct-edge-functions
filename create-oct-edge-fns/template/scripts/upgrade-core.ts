const DENO_JSON_PATH = "./deno.json";
const JSR_META_URL = "https://jsr.io/@oct-edge-fns/core/meta.json";
const CORE_IMPORT_KEY = "@oct-edge-fns/core";

function parseVersion(spec: string): string {
  const at = spec.lastIndexOf("@");
  if (at === -1) {
    throw new Error(`Cannot parse version from ${spec}`);
  }
  return spec.slice(at + 1).replace(/^[\^~]/, "");
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(/[-+]/)[0].split(".").map(Number);
  const pb = b.split(/[-+]/)[0].split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  // Treat pre-release/build metadata as equal for selection purposes.
  return 0;
}

async function fetchVersions(): Promise<{ latest: string; versions: string[] }> {
  const res = await fetch(JSR_META_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch JSR metadata: ${res.status} ${res.statusText}`);
  }
  const meta = await res.json();
  return {
    latest: meta.latest,
    versions: Object.keys(meta.versions),
  };
}

function readDenoJson(): Record<string, unknown> {
  return JSON.parse(Deno.readTextFileSync(DENO_JSON_PATH));
}

function writeDenoJson(json: Record<string, unknown>) {
  Deno.writeTextFileSync(DENO_JSON_PATH, JSON.stringify(json, null, 2) + "\n");
}

function updateCoreImport(
  json: Record<string, unknown>,
  targetVersion: string,
) {
  const imports = (json.imports ?? {}) as Record<string, string>;
  const prefixKey = `${CORE_IMPORT_KEY}/`;

  // Migrate from the legacy prefix mapping (which Deno cannot resolve for JSR
  // subpath exports) to explicit subpath mappings.
  if (prefixKey in imports) {
    delete imports[prefixKey];
  }

  // Ensure the explicit subpath mappings we use in the template exist.
  const explicitMappings: Record<string, string> = {
    [`${CORE_IMPORT_KEY}/testing`]: `jsr:@oct-edge-fns/core@^${targetVersion}/testing`,
    [`${CORE_IMPORT_KEY}/plugins`]: `jsr:@oct-edge-fns/core@^${targetVersion}/plugins`,
  };
  for (const [key, value] of Object.entries(explicitMappings)) {
    imports[key] = value;
  }

  // Update any remaining core imports to the target version.
  const coreVersionPattern = /jsr:@oct-edge-fns\/core@[\^~]?[^/"]+/g;
  for (const [key, value] of Object.entries(imports)) {
    if (key === CORE_IMPORT_KEY || key.startsWith(prefixKey)) {
      imports[key] = value.replace(
        coreVersionPattern,
        `jsr:@oct-edge-fns/core@^${targetVersion}`,
      );
    }
  }
  json.imports = imports;
}

function removeIfExists(path: string) {
  try {
    const info = Deno.statSync(path);
    Deno.removeSync(path, { recursive: info.isDirectory });
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
}

async function runDenoCache() {
  const cmd = new Deno.Command("deno", {
    args: ["cache", "main.ts"],
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await cmd.output();
  if (code !== 0) {
    throw new Error(`deno cache main.ts failed with exit code ${code}`);
  }
}

async function main() {
  const denoJson = readDenoJson();
  const imports = (denoJson.imports ?? {}) as Record<string, string>;
  const currentSpec = imports[CORE_IMPORT_KEY];
  if (!currentSpec) {
    console.error("❌ @oct-edge-fns/core is not in deno.json imports");
    Deno.exit(1);
  }

  const currentVersion = parseVersion(currentSpec);
  console.log(`Current core version: ${currentVersion}`);

  const { versions } = await fetchVersions();
  const newer = versions
    .filter((v) => compareSemver(v, currentVersion) > 0)
    .sort((a, b) => compareSemver(b, a));

  if (newer.length === 0) {
    console.log("✅ Already on the latest core version");
    Deno.exit(0);
  }

  const envVersion = Deno.env.get("VERSION");
  let targetVersion: string;

  if (envVersion) {
    if (!versions.includes(envVersion)) {
      console.error(`❌ Version ${envVersion} is not published on JSR`);
      Deno.exit(1);
    }
    targetVersion = envVersion;
    console.log(`Using VERSION override: ${targetVersion}`);
  } else {
    console.log("\nNewer core versions available:");
    newer.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));
    const input = prompt("\nSelect version (number, default: 1):");
    const idx = input && input.trim() ? parseInt(input.trim(), 10) - 1 : 0;
    if (isNaN(idx) || idx < 0 || idx >= newer.length) {
      console.error("❌ Invalid selection");
      Deno.exit(1);
    }
    targetVersion = newer[idx];
  }

  updateCoreImport(denoJson, targetVersion);
  writeDenoJson(denoJson);
  console.log(`✅ Updated deno.json -> @oct-edge-fns/core@^${targetVersion}`);

  removeIfExists("deno.lock");
  console.log("✅ Removed deno.lock");

  removeIfExists("lib");
  console.log("✅ Removed stale lib/ directory");

  await runDenoCache();
  console.log("✅ Re-cached dependencies");

  console.log(`\n🎉 Project upgraded to @oct-edge-fns/core@^${targetVersion}`);
}

main().catch((err) => {
  console.error(`❌ Upgrade failed: ${err.message}`);
  Deno.exit(1);
});
