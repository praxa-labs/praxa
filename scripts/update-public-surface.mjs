import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = "PUBLIC_SURFACE_MANIFEST.json";
const ignoredDirectories = new Set([".git", "node_modules", "dist", "release-assets"]);

async function walk(directory, relative = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const childRelative = path.posix.join(relative, entry.name);
    if (childRelative === manifestPath) continue;
    const child = path.join(directory, entry.name);
    const stat = await lstat(child);
    if (stat.isSymbolicLink()) throw new Error(`Cannot manifest symlink: ${childRelative}`);
    if (entry.isDirectory()) files.push(...await walk(child, childRelative));
    else files.push(childRelative);
  }
  return files;
}

const files = [];
for (const relative of (await walk(root)).sort()) {
  const bytes = await readFile(path.join(root, relative));
  files.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex") });
}

await writeFile(path.join(root, manifestPath), `${JSON.stringify({
  schemaVersion: "praxa-public-surface-v1",
  source: "praxa-harness-reviewed-allowlist",
  files,
}, null, 2)}\n`, "utf8");
console.log(`Updated ${manifestPath} with ${files.length} files.`);
