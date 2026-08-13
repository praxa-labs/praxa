import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertPublishedPackageIntegrity,
  npmPackageTarballFilename,
  npmTarballIntegrity,
  parseNpmViewManifest,
  parseNpmViewVersion,
  selectNpmViewManifest,
  selectNpmViewVersion,
} from "../scripts/npm-registry-json.mjs";

test("release tarball identity is derived deterministically from package name, version, and bytes", () => {
  assert.equal(npmPackageTarballFilename("@praxa/sdk", "0.3.0"), "praxa-sdk-0.3.0.tgz");
  assert.equal(
    npmTarballIntegrity(Buffer.from("abc")),
    "sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==",
  );
});

test("selects the npm 10 string-shaped view result", () => {
  assert.equal(selectNpmViewVersion("0.1.0", "0.1.0"), "0.1.0");
});

test("parses npm manifest integrity in flat and nested output shapes", () => {
  const integrity = "sha512-c3ludGhldGlj";
  assert.deepEqual(selectNpmViewManifest({ version: "0.3.0", "dist.integrity": integrity }, "0.3.0"), { version: "0.3.0", integrity });
  assert.deepEqual(parseNpmViewManifest(JSON.stringify([{ version: "0.3.0", dist: { integrity } }]), "0.3.0"), { version: "0.3.0", integrity });
});

test("published version reuse is allowed only for byte-identical package integrity", () => {
  const packed = { name: "@praxa/sdk", integrity: "sha512-same" };
  const published = { version: "0.3.0", integrity: "sha512-same" };
  assert.doesNotThrow(() => assertPublishedPackageIntegrity("@praxa/sdk", packed, published));
  assert.throws(
    () => assertPublishedPackageIntegrity("@praxa/sdk", packed, { ...published, integrity: "sha512-different" }),
    /published_digest_mismatch:@praxa\/sdk@0\.3\.0/u,
  );
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
