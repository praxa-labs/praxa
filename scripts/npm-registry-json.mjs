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
