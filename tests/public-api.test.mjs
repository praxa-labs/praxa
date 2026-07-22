import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  AuraClient,
  PRAXA_CONTRACT_VERSION,
  PRAXA_OPENAPI_SHA256,
  PRAXA_OPENAPI_VERSION,
  PraxaClient,
} from "../packages/sdk/dist/index.js";
import { parsePraxaCliArguments } from "../packages/cli/dist/arguments.js";
import {
  AURA_MCP_TOOLS,
  PRAXA_MCP_TOOLS,
  praxaMcpTool,
} from "../packages/mcp-contracts/dist/index.js";

test("Praxa exports preserve the established Aura wire compatibility", () => {
  assert.equal(PraxaClient, AuraClient);
  assert.equal(PRAXA_OPENAPI_VERSION, "8.1.0");
  assert.equal(PRAXA_CONTRACT_VERSION, "aura-integration-gateway-v8.1");
  assert.equal(PRAXA_MCP_TOOLS, AURA_MCP_TOOLS);
  assert.equal(praxaMcpTool("aura_create_mission")?.requiredScope, "missions:write");
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
          runId: "11111111-1111-4111-8111-111111111111",
          status: "running",
          sequence: 1,
          steps: [],
        });
    },
  });

  await client.createMission({
    goalSpec: { task: "bounded public SDK test" },
    resourceBudget: {
      maximumSteps: 2,
      maximumToolCalls: 2,
      maximumElapsedMs: 5_000,
      maximumParallelism: 1,
    },
  }, "public-sdk-test-0001");

  assert.equal(requests.length, 2);
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
      PRAXA_BASE_URL: "https://api.example.test/v8",
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

test("every public MCP tool maps to a governed route and no direct executor", () => {
  assert.ok(PRAXA_MCP_TOOLS.length > 0);
  for (const tool of PRAXA_MCP_TOOLS) {
    assert.match(tool.path, /^\/(v8|mcp)(\/|$)/u);
    assert.doesNotMatch(tool.name, /provider|credential|execute_direct/iu);
    assert.ok(tool.requiredScope.length > 0);
  }
});
