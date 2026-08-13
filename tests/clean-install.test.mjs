import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { parseNpmPackJson } from "../scripts/npm-pack-json.mjs";

const repository = path.resolve(new URL("..", import.meta.url).pathname);

test("exact 0.3.0 tarballs install and expose SDK memory, CLI, and unchanged MCP contracts in a clean project", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "praxa-clean-install-"));
  const assets = path.join(temporary, "assets");
  const consumer = path.join(temporary, "consumer");
  try {
    await mkdir(assets);
    await mkdir(consumer);
    const packages = [
      ["sdk", "@praxa/sdk"],
      ["mcp-contracts", "@praxa/mcp-contracts"],
      ["cli", "@praxa/cli"],
    ];
    const tarballs = [];
    for (const [directory, name] of packages) {
      const packed = spawnSync(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", assets],
        { cwd: path.join(repository, "packages", directory), encoding: "utf8" },
      );
      assert.equal(packed.status, 0, packed.stderr || packed.stdout);
      const result = parseNpmPackJson(packed.stdout, name);
      assert.equal(result.version, "0.3.0");
      tarballs.push(path.join(assets, result.filename));
    }
    await writeFile(path.join(temporary, "package.json"), '{"private":true,"type":"module"}\n', "utf8");
    await writeFile(path.join(temporary, ".npmrc"), "offline=true\naudit=false\nfund=false\n", "utf8");
    const installed = spawnSync(
      "npm",
      ["install", "--ignore-scripts", "--no-package-lock", ...tarballs],
      { cwd: temporary, encoding: "utf8" },
    );
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    await writeFile(path.join(temporary, "smoke.mjs"), `
      import { PraxaClient } from "@praxa/sdk";
      import { MemoryFederation, createMem0MemorySource } from "@praxa/sdk/memory";
      import { MCP_SERVER_VERSION, PRAXA_MCP_TOOLS } from "@praxa/mcp-contracts";
      if (typeof PraxaClient !== "function" || typeof MemoryFederation !== "function" || typeof createMem0MemorySource !== "function") process.exit(2);
      if (MCP_SERVER_VERSION !== "0.3.0" || PRAXA_MCP_TOOLS.length !== 12) process.exit(3);
    `, "utf8");
    const imported = spawnSync(process.execPath, [path.join(temporary, "smoke.mjs")], { cwd: temporary, encoding: "utf8" });
    assert.equal(imported.status, 0, imported.stderr || imported.stdout);
    const cli = spawnSync(process.execPath, [path.join(temporary, "node_modules/@praxa/cli/bin/praxa.mjs"), "version"], { cwd: consumer, encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /"cliVersion": "0\.3\.0"/u);
    const legacyCli = spawnSync(process.execPath, [path.join(temporary, "node_modules/@praxa/cli/bin/aura.mjs"), "version"], { cwd: consumer, encoding: "utf8" });
    assert.equal(legacyCli.status, 0, legacyCli.stderr);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
