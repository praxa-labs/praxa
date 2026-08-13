import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";

import { addPraxaMemorySource, planPraxaMemorySync } from "../packages/cli/dist/memory.js";

const root = new URL("..", import.meta.url);
const repository = fileURLToPath(root);
const run = (...arguments_) => spawnSync(process.execPath, ["packages/cli/bin/praxa.mjs", ...arguments_], { cwd: root, encoding: "utf8" });
const runAsync = (...arguments_) => new Promise((resolve) => {
  const child = spawn(process.execPath, ["packages/cli/bin/praxa.mjs", ...arguments_], { cwd: repository, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (status) => resolve({ status, stdout, stderr }));
});

test("memory source add dry-run is credential-free and does not write", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "praxa-memory-cli-"));
  try {
    const result = run("memory", "source", "add", "mem0", "--mode", "federated", "--project-dir", project, "--dry-run");
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.dryRun, true);
    assert.equal(plan.source.access, "read_only");
    assert.match(plan.notice, /No provider connection, credential, sync, mirror, cutover, write, or migration/u);
    await assert.rejects(access(path.join(project, ".praxa/memory.json")), /ENOENT/u);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test("memory source config writes only provider metadata and sync plan remains non-executable", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "praxa-memory-cli-"));
  try {
    const added = run("memory", "source", "add", "openai_agents", "--mode", "federated", "--project-dir", project);
    assert.equal(added.status, 0, added.stderr);
    const source = await readFile(path.join(project, ".praxa/memory.json"), "utf8");
    assert.deepEqual(JSON.parse(source), {
      schemaVersion: "praxa-memory-sources-v1",
      sources: [{ id: "openai_agents", provider: "openai_agents", mode: "federated", access: "read_only", enabled: true }],
    });
    assert.doesNotMatch(source, /token|secret|api.?key/iu);
    const planned = run("memory", "sync", "plan", "--project-dir", project, "--dry-run");
    assert.equal(planned.status, 0, planned.stderr);
    assert.equal(JSON.parse(planned.stdout).executable, false);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test("memory mirror, cutover, and sync execution fail with precise unsupported messages", () => {
  const cases = [
    [["memory", "mirror"], /Memory mirror is not implemented/u],
    [["memory", "cutover"], /Memory cutover is not implemented/u],
    [["memory", "sync", "run"], /Memory sync execution is not implemented/u],
    [["memory", "source", "add", "mem0", "--mode", "mirror"], /Memory mode mirror is not implemented/u],
  ];
  for (const [arguments_, pattern] of cases) {
    const result = run(...arguments_);
    assert.equal(result.status, 1);
    assert.match(result.stderr, pattern);
  }
});

test("programmatic memory source configuration validates all mutation options before writing", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "praxa-memory-cli-options-"));
  try {
    await assert.rejects(
      addPraxaMemorySource({ projectDirectory: project, provider: "mem0", mode: "federated" }),
      /dryRun must be a boolean/u,
    );
    await assert.rejects(
      addPraxaMemorySource({ projectDirectory: project, provider: "bogus", mode: "federated", dryRun: false }),
      /provider is unsupported/u,
    );
    await assert.rejects(
      addPraxaMemorySource({ projectDirectory: project, provider: "mem0", mode: "mirror", dryRun: false }),
      /mode must be federated/u,
    );
    await assert.rejects(
      addPraxaMemorySource({ projectDirectory: project, provider: "mem0", mode: "federated", dryRun: false, json: true }),
      /unsupported option json/u,
    );
    await assert.rejects(
      planPraxaMemorySync({ projectDirectory: project, dryRun: false }),
      /dryRun must be true/u,
    );
    await assert.rejects(access(path.join(project, ".praxa/memory.json")), /ENOENT/u);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test("concurrent source additions serialize without losing either provider", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const project = await mkdtemp(path.join(tmpdir(), "praxa-memory-cli-race-"));
    try {
      const results = await Promise.all(["mem0", "zep"].map((provider) => runAsync(
        "memory", "source", "add", provider, "--mode", "federated", "--project-dir", project,
      )));
      assert.ok(results.every((result) => result.status === 0), JSON.stringify(results));
      const config = JSON.parse(await readFile(path.join(project, ".praxa/memory.json"), "utf8"));
      assert.deepEqual(config.sources.map((source) => source.provider).sort(), ["mem0", "zep"]);
    } finally { await rm(project, { recursive: true, force: true }); }
  }
});

test("same-process concurrent source additions use unique atomic writes", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "praxa-memory-cli-local-race-"));
  try {
    await Promise.all(["mem0", "zep"].map((provider) => addPraxaMemorySource({
      projectDirectory: project,
      provider,
      mode: "federated",
      dryRun: false,
    })));
    const config = JSON.parse(await readFile(path.join(project, ".praxa/memory.json"), "utf8"));
    assert.deepEqual(config.sources.map((source) => source.provider).sort(), ["mem0", "zep"]);
  } finally { await rm(project, { recursive: true, force: true }); }
});
