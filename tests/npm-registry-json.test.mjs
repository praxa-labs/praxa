import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNpmViewVersion, selectNpmViewVersion } from "../scripts/npm-registry-json.mjs";

test("selects the npm 10 string-shaped view result", () => {
  assert.equal(selectNpmViewVersion("0.1.0", "0.1.0"), "0.1.0");
});

test("selects the npm 12 array-shaped view result", () => {
  assert.equal(selectNpmViewVersion(["0.1.0"], "0.1.0"), "0.1.0");
});

test("parses either supported npm view JSON shape", () => {
  assert.equal(parseNpmViewVersion('["0.1.0"]', "0.1.0"), "0.1.0");
});

test("rejects missing, ambiguous, or mismatched registry versions", () => {
  for (const value of [[], ["0.1.0", "0.1.1"], "0.1.1"]) {
    assert.throws(
      () => selectNpmViewVersion(value, "0.1.0"),
      /npm_view_version_mismatch:0\.1\.0/u,
    );
  }
});
