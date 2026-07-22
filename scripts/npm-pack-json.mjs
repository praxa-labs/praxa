export function selectNpmPackResult(value, expectedName) {
  const packed = Array.isArray(value) ? value[0] : value?.[expectedName];
  if (packed === undefined || packed === null || typeof packed !== "object") {
    throw new Error(`npm_pack_result_missing:${expectedName}`);
  }
  if (packed.name !== expectedName) {
    throw new Error(`npm_pack_name_mismatch:${expectedName}`);
  }
  return packed;
}

export function parseNpmPackJson(stdout, expectedName) {
  return selectNpmPackResult(JSON.parse(stdout), expectedName);
}
