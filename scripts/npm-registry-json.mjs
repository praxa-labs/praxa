import { createHash } from "node:crypto";

export function npmPackageTarballFilename(packageName, version) {
  if (typeof packageName !== "string" || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(packageName)) {
    throw new Error("npm_package_name_invalid");
  }
  if (typeof version !== "string" || !/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/u.test(version)) {
    throw new Error("npm_package_version_invalid");
  }
  return `${packageName.replace(/^@/u, "").replace("/", "-")}-${version}.tgz`;
}

export function npmTarballIntegrity(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

export function selectNpmViewVersion(value, expectedVersion) {
  const versions = Array.isArray(value) ? value : [value];
  if (versions.length !== 1 || versions[0] !== expectedVersion) {
    throw new Error(`npm_view_version_mismatch:${expectedVersion}`);
  }
  return versions[0];
}

export function parseNpmViewVersion(stdout, expectedVersion) {
  return selectNpmViewVersion(JSON.parse(stdout), expectedVersion);
}

export function selectNpmViewManifest(value, expectedVersion) {
  const candidates = Array.isArray(value) ? value : [value];
  if (candidates.length !== 1 || candidates[0] === null || typeof candidates[0] !== "object") {
    throw new Error(`npm_view_manifest_mismatch:${expectedVersion}`);
  }
  const manifest = candidates[0];
  if (manifest.version !== expectedVersion) throw new Error(`npm_view_manifest_mismatch:${expectedVersion}`);
  const integrity = manifest["dist.integrity"] ?? manifest.dist?.integrity;
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
    throw new Error(`npm_view_integrity_missing:${expectedVersion}`);
  }
  return { version: manifest.version, integrity };
}

export function parseNpmViewManifest(stdout, expectedVersion) {
  return selectNpmViewManifest(JSON.parse(stdout), expectedVersion);
}

export function assertPublishedPackageIntegrity(expectedName, packed, published) {
  if (packed.name !== expectedName || typeof packed.integrity !== "string") {
    throw new Error(`npm_pack_integrity_missing:${expectedName}`);
  }
  if (packed.integrity !== published.integrity) {
    throw new Error(`published_digest_mismatch:${expectedName}@${published.version}`);
  }
}

export async function waitForPublishedManifest(
  lookup,
  {
    attempts = 46,
    intervalMs = 2_000,
    delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  if (typeof lookup !== "function") throw new Error("npm_registry_lookup_invalid");
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error("npm_registry_attempts_invalid");
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) throw new Error("npm_registry_interval_invalid");
  if (typeof delay !== "function") throw new Error("npm_registry_delay_invalid");

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const published = await lookup();
    if (published !== undefined) return published;
    if (attempt < attempts - 1) await delay(intervalMs);
  }
  return undefined;
}
