import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNpmPackJson, selectNpmPackResult } from "../scripts/npm-pack-json.mjs";

const manifest = Object.freeze({
  name: "@praxa/sdk",
  version: "0.1.0",
  files: [],
});

test("selects the npm 10 array-shaped pack result", () => {
  assert.equal(selectNpmPackResult([manifest], manifest.name), manifest);
});

test("selects the npm 12 package-keyed pack result", () => {
  assert.equal(selectNpmPackResult({ [manifest.name]: manifest }, manifest.name), manifest);
});

test("parses either supported npm pack JSON shape", () => {
  assert.deepEqual(parseNpmPackJson(JSON.stringify({ [manifest.name]: manifest }), manifest.name), manifest);
});

test("rejects a missing or mismatched package result", () => {
  assert.throws(
    () => selectNpmPackResult({}, manifest.name),
    /npm_pack_result_missing:@praxa\/sdk/u,
  );
  assert.throws(
    () => selectNpmPackResult([{ ...manifest, name: "@praxa/other" }], manifest.name),
    /npm_pack_name_mismatch:@praxa\/sdk/u,
  );
});
