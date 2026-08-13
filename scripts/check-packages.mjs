import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseNpmPackJson } from "./npm-pack-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  ["sdk", "@praxa/sdk", 80],
  ["cli", "@praxa/cli", 40],
  ["mcp-contracts", "@praxa/mcp-contracts", 40],
];

for (const [directory, expectedName, maximumFiles] of packages) {
  const result = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: path.join(root, "packages", directory), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const packed = parseNpmPackJson(result.stdout, expectedName);
  assert.equal(packed.name, expectedName);
  assert.ok(packed.files.length > 0);
  assert.ok(packed.files.length < maximumFiles, `${expectedName} tarball is unexpectedly large`);
  for (const file of packed.files) {
    assert.match(
      file.path,
      /^(?:LICENSE|NOTICE|README\.md|package\.json|dist\/|bin\/)/u,
      `${expectedName} contains unexpected file ${file.path}`,
    );
    assert.doesNotMatch(file.path, /(?:^|\/)(?:src|test|tests|\.env|AGENTS\.md|RULES\.md)(?:\/|$)/u);
  }
  for (const required of ["LICENSE", "NOTICE", "README.md", "package.json"]) {
    assert.ok(packed.files.some((file) => file.path === required), `${expectedName} is missing ${required}`);
  }
  assert.ok(packed.files.some((file) => file.path === "dist/index.js" || file.path === "dist/arguments.js"));
  if (expectedName === "@praxa/sdk") {
    assert.ok(packed.files.some((file) => file.path === "dist/memory/index.js"), "SDK tarball is missing memory entrypoint");
  }
  console.log(`${expectedName}: ${packed.files.length} files, ${packed.size} bytes packed.`);
}
