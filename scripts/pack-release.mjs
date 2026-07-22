import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDirectory = path.join(root, "release-assets");
const packages = ["sdk", "mcp-contracts", "cli"];
const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

await rm(assetDirectory, { recursive: true, force: true });
await mkdir(assetDirectory, { recursive: true });

const assets = [];
for (const directory of packages) {
  const packageDirectory = path.join(root, "packages", directory);
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8"));
  assert.equal(manifest.version, rootManifest.version, `${manifest.name} version must match the release version`);
  if (manifest.name === "@praxa/cli") {
    assert.equal(manifest.dependencies?.["@praxa/sdk"], manifest.version, "CLI must depend on the exact SDK release");
  }

  const result = spawnSync(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", assetDirectory],
    { cwd: packageDirectory, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packed = JSON.parse(result.stdout)[0];
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  assets.push(packed.filename);
}

const checksumLines = [];
for (const filename of assets.sort()) {
  const bytes = await readFile(path.join(assetDirectory, filename));
  checksumLines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${filename}`);
}
await writeFile(path.join(assetDirectory, "SHA256SUMS"), `${checksumLines.join("\n")}\n`, "utf8");

console.log(`Prepared ${assets.length} package tarballs and SHA256SUMS in release-assets/.`);
