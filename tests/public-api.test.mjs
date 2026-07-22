import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  AuraClient,
  PRAXA_CONTRACT_VERSION,
  PRAXA_OPENAPI_SHA256,
  PRAXA_OPENAPI_VERSION,
  PraxaClient,
  createPraxaAgentTools,
  PRAXA_OPENAI_FUNCTION_TOOLS,
} from "../packages/sdk/dist/index.js";
import { parsePraxaCliArguments } from "../packages/cli/dist/arguments.js";
import {
  AURA_MCP_TOOLS,
  MCP_LEGACY_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION,
  PRAXA_MCP_TOOLS,
  praxaMcpTool,
} from "../packages/mcp-contracts/dist/index.js";

test("Praxa exports preserve the established Aura wire compatibility", () => {
  assert.equal(PraxaClient, AuraClient);
  assert.equal(PRAXA_OPENAPI_VERSION, "8.1.0");
  assert.equal(PRAXA_CONTRACT_VERSION, "aura-integration-gateway-v8.1");
  assert.equal(PRAXA_MCP_TOOLS, AURA_MCP_TOOLS);
  assert.equal(MCP_PROTOCOL_VERSION, "2025-11-25");
  assert.equal(MCP_LEGACY_PROTOCOL_VERSION, "2025-03-26");
  assert.equal(praxaMcpTool("aura_create_mission")?.requiredScope, "missions:write");
});

test("agent tools and OpenAI declarations cover the governed MCP surface", () => {
  const client = new PraxaClient({
    baseUrl: "https://api.example.test",
    accessToken: () => "synthetic-oauth-token",
  });
  assert.deepEqual(
    createPraxaAgentTools(client).map((tool) => tool.name),
    PRAXA_MCP_TOOLS.map((tool) => tool.name),
  );
  assert.deepEqual(
    PRAXA_OPENAI_FUNCTION_TOOLS.map((tool) => tool.name),
    PRAXA_MCP_TOOLS.map((tool) => tool.name),
  );
  assert.ok(PRAXA_OPENAI_FUNCTION_TOOLS.every((tool) => tool.strict === false));
});

test("generated SDK hash matches the distributed OpenAPI bytes", async () => {
  const source = await readFile(new URL("../openapi/praxa-api.yaml", import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), PRAXA_OPENAPI_SHA256);
});

test("keyed mutations retry with an unchanged key and body", async () => {
  const requests = [];
  const client = new PraxaClient({
    baseUrl: "https://api.example.test",
    accessToken: () => "synthetic-oauth-token",
    maximumAttempts: 2,
    retryBaseDelayMs: 0,
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return requests.length === 1
        ? Response.json({ code: "temporarily_unavailable" }, { status: 503 })
        : Response.json({
          requestId: "11111111-1111-4111-8111-111111111111",
          submissionId: "22222222-2222-4222-8222-222222222222",
          disposition: "pending_compilation",
          message: "Recorded without execution.",
        });
    },
  });

  const submission = await client.submitIntent(
    "Prepare a bounded public SDK test",
    "public-sdk-test-0001",
  );

  assert.equal(requests.length, 2);
  assert.equal(submission.disposition, "pending_compilation");
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), ["/v8/intents", "/v8/intents"]);
  assert.deepEqual(
    requests.map((request) => request.headers.get("idempotency-key")),
    ["public-sdk-test-0001", "public-sdk-test-0001"],
  );
  assert.equal(await requests[0].text(), await requests[1].text());
});

test("unsafe origins are rejected before a request", () => {
  assert.throws(
    () => new PraxaClient({
      baseUrl: "http://api.example.test",
      accessToken: () => "synthetic-oauth-token",
    }),
    /HTTPS origin/u,
  );
});

test("CLI prefers Praxa variables and has a no-network version smoke", () => {
  assert.deepEqual(
    parsePraxaCliArguments(["doctor"], {
      PRAXA_BASE_URL: "https://api.example.test",
      AURA_BASE_URL: "https://legacy.example.test",
    }),
    { kind: "doctor", baseUrl: "https://api.example.test" },
  );

  const result = spawnSync(
    process.execPath,
    ["packages/cli/bin/praxa.mjs", "version"],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"openapiVersion": "8\.1\.0"/u);
});

test("CLI configures a project-scoped agent client without embedding a token", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "praxa-public-init-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["packages/cli/bin/praxa.mjs", "init", "--project-dir", root, "--target", "codex", "--json"],
      { cwd: new URL("..", import.meta.url), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const initialized = JSON.parse(result.stdout);
    assert.equal(initialized.schemaVersion, "praxa-init-result-v1");
    assert.equal(initialized.baseUrl, "https://agents.praxa.io");
    const config = await readFile(path.join(root, ".codex/config.toml"), "utf8");
    assert.match(config, /url = "https:\/\/agents\.praxa\.io\/mcp"/u);
    assert.match(config, /bearer_token_env_var = "PRAXA_ACCESS_TOKEN"/u);
    assert.doesNotMatch(config, /synthetic-oauth-token/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("every public MCP tool maps to a governed route and no direct executor", () => {
  assert.ok(PRAXA_MCP_TOOLS.length > 0);
  for (const tool of PRAXA_MCP_TOOLS) {
    assert.match(tool.path, /^\/(v8|mcp)(\/|$)/u);
    assert.doesNotMatch(tool.name, /provider|credential|execute_direct/iu);
    assert.ok(tool.requiredScope.length > 0);
  }
});
