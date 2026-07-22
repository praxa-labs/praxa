import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseNpmViewVersion } from "./npm-registry-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = "https://registry.npmjs.org/";
const packages = ["sdk", "mcp-contracts", "cli"];
const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

for (const directory of packages) {
  const manifest = JSON.parse(await readFile(path.join(root, "packages", directory, "package.json"), "utf8"));
  assert.equal(manifest.version, rootManifest.version, `${manifest.name} version must match the release version`);
  if (manifest.name === "@praxa/cli") {
    assert.equal(manifest.dependencies?.["@praxa/sdk"], manifest.version, "CLI must depend on the exact SDK release");
  }

  const specifier = `${manifest.name}@${manifest.version}`;
  const lookup = spawnSync(
    "npm",
    ["view", specifier, "version", "--json", `--registry=${registry}`],
    { cwd: root, encoding: "utf8" },
  );
  if (lookup.status === 0) {
    parseNpmViewVersion(lookup.stdout, manifest.version);
    console.log(`Already published: ${specifier}`);
    continue;
  }
  const lookupFailure = `${lookup.stdout}\n${lookup.stderr}`;
  assert.match(lookupFailure, /E404|404 Not Found/u, `Registry lookup failed for ${specifier}: ${lookupFailure}`);

  const publishArguments = [
    "publish",
    "--workspace",
    manifest.name,
    "--access",
    "public",
    `--registry=${registry}`,
  ];
  if (process.env.PRAXA_RELEASE_DISABLE_PROVENANCE === "1") {
    publishArguments.push("--provenance=false");
  }
  const published = spawnSync("npm", publishArguments, { cwd: root, stdio: "inherit" });
  assert.equal(published.status, 0, `npm publish failed for ${specifier}`);
}
