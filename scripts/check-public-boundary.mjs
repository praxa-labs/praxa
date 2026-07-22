import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenSegments = new Set([
  "infra",
  "supabase",
  "Martyn-front-end",
  "evidence",
  "evidence-templates",
  "ml",
  "runbooks",
]);
const ignoredDirectories = new Set([".git", "node_modules", "dist"]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/u,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/u,
  /\bsk-(?:live|test|proj)-[A-Za-z0-9_-]{16,}\b/u,
];
const privateImport = /(?:from\s+|import\s*\()["'][^"']*(?:src\/lib\/operator|operator\/adapters|credential-owner|infra\/|supabase\/)/u;

async function walk(directory, relative = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const childRelative = path.posix.join(relative, entry.name);
    const child = path.join(directory, entry.name);
    const stat = await lstat(child);
    assert.equal(stat.isSymbolicLink(), false, `symlink is forbidden: ${childRelative}`);
    assert.equal(forbiddenSegments.has(entry.name), false, `private path is forbidden: ${childRelative}`);
    assert.notEqual(entry.name, "AGENTS.md", `private governance file is forbidden: ${childRelative}`);
    assert.notEqual(entry.name, "RULES.md", `private governance file is forbidden: ${childRelative}`);
    if (entry.isDirectory()) files.push(...await walk(child, childRelative));
    else files.push(childRelative);
  }
  return files;
}

const files = await walk(root);
for (const relative of files) {
  if (!/\.(?:c?m?js|json|md|ts|ya?ml)$/u.test(relative) && !["LICENSE", "NOTICE"].includes(relative)) {
    continue;
  }
  const source = await readFile(path.join(root, relative), "utf8");
  for (const pattern of secretPatterns) {
    assert.doesNotMatch(source, pattern, `credential-shaped value in ${relative}`);
  }
  if (/\.(?:c?m?js|ts)$/u.test(relative)) {
    assert.doesNotMatch(source, privateImport, `private implementation import in ${relative}`);
  }
}

const expectedPackages = new Map([
  ["packages/sdk/package.json", "@praxa/sdk"],
  ["packages/cli/package.json", "@praxa/cli"],
  ["packages/mcp-contracts/package.json", "@praxa/mcp-contracts"],
]);
for (const [relative, name] of expectedPackages) {
  const manifest = JSON.parse(await readFile(path.join(root, relative), "utf8"));
  assert.equal(manifest.name, name);
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(manifest.repository?.url, "git+https://github.com/praxa-labs/praxa.git");
  assert.equal(manifest.publishConfig?.access, "public");
  assert.equal(manifest.publishConfig?.provenance, true);
  assert.equal(manifest.publishConfig?.registry, "https://registry.npmjs.org/");
  assert.ok(manifest.keywords?.includes("agentic-harness"));
  assert.ok(manifest.keywords?.length >= 10);
}
for (const relative of ["packages/cli/bin/praxa.mjs", "packages/cli/bin/aura.mjs"]) {
  const stat = await lstat(path.join(root, relative));
  assert.notEqual(stat.mode & 0o111, 0, `CLI binary must be executable: ${relative}`);
}

const surface = JSON.parse(await readFile(path.join(root, "PUBLIC_SURFACE_MANIFEST.json"), "utf8"));
assert.equal(surface.schemaVersion, "praxa-public-surface-v1");
for (const entry of surface.files) {
  const bytes = await readFile(path.join(root, entry.path));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, `hash mismatch: ${entry.path}`);
}

console.log(`Validated ${files.length} public files and ${surface.files.length} exported hashes.`);
