export function publishRequestedFromEnvironment(value) {
  if (value === undefined || value === "" || value === "false" || value === "0") return false;
  if (value === "true" || value === "1") return true;
  throw new Error("release_publish_requested_invalid");
}

export function assertReleaseRefMatchesVersion({ eventName, refName, version, publishRequested = false }) {
  if (typeof version !== "string" || version.length === 0 || version.startsWith("v")) {
    throw new Error("release_root_version_invalid");
  }
  if (eventName !== "release" && publishRequested !== true) return;
  const expected = `v${version}`;
  const actual = typeof refName === "string" && refName.length > 0 ? refName : "<missing>";
  if (actual !== expected) {
    throw new Error(`release_ref_version_mismatch:expected=${expected}:actual=${actual}`);
  }
}
