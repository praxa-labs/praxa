import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

import { assertReleaseRefMatchesVersion, publishRequestedFromEnvironment } from "../scripts/release-context.mjs";

const repository = path.resolve(new URL("..", import.meta.url).pathname);

test("release ref validation binds release events to the root version without blocking safe dispatches", () => {
  assert.doesNotThrow(() => assertReleaseRefMatchesVersion({ eventName: undefined, refName: undefined, version: "0.3.0" }));
  assert.doesNotThrow(() => assertReleaseRefMatchesVersion({ eventName: "workflow_dispatch", refName: "main", version: "0.3.0" }));
  assert.doesNotThrow(() => assertReleaseRefMatchesVersion({ eventName: "workflow_dispatch", refName: "main", version: "0.3.0", publishRequested: false }));
  assert.doesNotThrow(() => assertReleaseRefMatchesVersion({ eventName: "workflow_dispatch", refName: "v0.3.0", version: "0.3.0", publishRequested: true }));
  assert.doesNotThrow(() => assertReleaseRefMatchesVersion({ eventName: "release", refName: "v0.3.0", version: "0.3.0" }));
  for (const refName of [undefined, "main", "v0.2.0", "0.3.0"]) {
    assert.throws(
      () => assertReleaseRefMatchesVersion({ eventName: "release", refName, version: "0.3.0" }),
      /release_ref_version_mismatch:expected=v0\.3\.0/u,
    );
  }
  assert.throws(
    () => assertReleaseRefMatchesVersion({ eventName: "workflow_dispatch", refName: "main", version: "0.3.0", publishRequested: true }),
    /release_ref_version_mismatch:expected=v0\.3\.0:actual=main/u,
  );
  assert.equal(publishRequestedFromEnvironment("true"), true);
  assert.equal(publishRequestedFromEnvironment("false"), false);
  assert.throws(() => publishRequestedFromEnvironment("yes"), /release_publish_requested_invalid/u);
});

test("release pack and publish fail before filesystem or registry work on a mismatched release tag", () => {
  for (const environment of [
    { ...process.env, GITHUB_EVENT_NAME: "release", GITHUB_REF_NAME: "v0.2.0", PRAXA_RELEASE_PUBLISH_REQUESTED: "true" },
    { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF_NAME: "main", PRAXA_RELEASE_PUBLISH_REQUESTED: "true" },
  ]) {
    for (const script of ["scripts/pack-release.mjs", "scripts/publish-packages.mjs"]) {
      const result = spawnSync(process.execPath, [script], { cwd: repository, env: environment, encoding: "utf8" });
      assert.notEqual(result.status, 0, `${script} unexpectedly accepted a mismatched publishing ref`);
      assert.match(`${result.stdout}\n${result.stderr}`, /release_ref_version_mismatch:expected=v0\.3\.0/u);
    }
  }
  const safeDispatch = spawnSync(process.execPath, ["scripts/check-release-ref.mjs"], {
    cwd: repository,
    env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF_NAME: "main", PRAXA_RELEASE_PUBLISH_REQUESTED: "false" },
    encoding: "utf8",
  });
  assert.equal(safeDispatch.status, 0, safeDispatch.stderr);

  const localPublicationEnvironment = { ...process.env };
  delete localPublicationEnvironment.GITHUB_EVENT_NAME;
  delete localPublicationEnvironment.GITHUB_REF_NAME;
  delete localPublicationEnvironment.PRAXA_RELEASE_PUBLISH_REQUESTED;
  const localPublication = spawnSync(process.execPath, ["scripts/publish-packages.mjs"], {
    cwd: repository,
    env: localPublicationEnvironment,
    encoding: "utf8",
  });
  assert.notEqual(localPublication.status, 0, "direct publication unexpectedly bypassed release ref validation");
  assert.match(
    `${localPublication.stdout}\n${localPublication.stderr}`,
    /release_ref_version_mismatch:expected=v0\.3\.0:actual=<missing>/u,
  );
});
