import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertPublishedPackageIntegrity,
  npmPackageTarballFilename,
  npmTarballIntegrity,
  parseNpmViewManifest,
  waitForPublishedManifest,
} from "./npm-registry-json.mjs";
import { assertReleaseRefMatchesVersion } from "./release-context.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = "https://registry.npmjs.org/";
const assetDirectory = path.join(root, "release-assets");
const packages = ["sdk", "mcp-contracts", "cli"];
const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

assertReleaseRefMatchesVersion({
  eventName: process.env.GITHUB_EVENT_NAME,
  refName: process.env.GITHUB_REF_NAME,
  version: rootManifest.version,
  publishRequested: true,
});

function publishedManifest(specifier, expectedVersion) {
  const lookup = spawnSync(
    "npm",
    ["view", specifier, "version", "dist.integrity", "--json", `--registry=${registry}`],
    { cwd: root, encoding: "utf8" },
  );
  if (lookup.status === 0) return parseNpmViewManifest(lookup.stdout, expectedVersion);
  const failure = `${lookup.stdout}\n${lookup.stderr}`;
  if (/E404|404 Not Found/u.test(failure)) return undefined;
  throw new Error(`Registry lookup failed for ${specifier}: ${failure}`);
}

for (const directory of packages) {
  const manifest = JSON.parse(await readFile(path.join(root, "packages", directory, "package.json"), "utf8"));
  assert.equal(manifest.version, rootManifest.version, `${manifest.name} version must match the release version`);
  if (manifest.name === "@praxa/cli") {
    assert.equal(manifest.dependencies?.["@praxa/sdk"], manifest.version, "CLI must depend on the exact SDK release");
  }

  const specifier = `${manifest.name}@${manifest.version}`;
  const tarball = path.join(assetDirectory, npmPackageTarballFilename(manifest.name, manifest.version));
  const tarballBytes = await readFile(tarball);
  const packed = { name: manifest.name, version: manifest.version, integrity: npmTarballIntegrity(tarballBytes) };
  const existing = publishedManifest(specifier, manifest.version);
  if (existing !== undefined) {
    const published = existing;
    assertPublishedPackageIntegrity(manifest.name, packed, published);
    console.log(`Already published with matching integrity: ${specifier}`);
    continue;
  }

  const publishArguments = ["publish", tarball, "--access", "public", `--registry=${registry}`];
  if (process.env.PRAXA_RELEASE_DISABLE_PROVENANCE === "1") {
    publishArguments.push("--provenance=false");
  }
  const publication = spawnSync("npm", publishArguments, { cwd: root, stdio: "inherit" });
  assert.equal(publication.status, 0, `npm publish failed for ${specifier}`);

  const published = await waitForPublishedManifest(() => publishedManifest(specifier, manifest.version));
  assert.notEqual(published, undefined, `Published package did not become readable from npm: ${specifier}`);
  assertPublishedPackageIntegrity(manifest.name, packed, published);
  console.log(`Published registry integrity verified: ${specifier}`);
}
