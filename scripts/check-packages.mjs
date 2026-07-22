import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  ["sdk", "@praxa/sdk"],
  ["cli", "@praxa/cli"],
  ["mcp-contracts", "@praxa/mcp-contracts"],
];

for (const [directory, expectedName] of packages) {
  const result = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: path.join(root, "packages", directory), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const packed = JSON.parse(result.stdout)[0];
  assert.equal(packed.name, expectedName);
  assert.ok(packed.files.length > 0);
  assert.ok(packed.files.length < 40, `${expectedName} tarball is unexpectedly large`);
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
  console.log(`${expectedName}: ${packed.files.length} files, ${packed.size} bytes packed.`);
}
