#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parsePraxaCliArguments } from "../dist/arguments.js";

async function loadSdk() {
  try {
    return await import("@praxa/sdk");
  } catch (error) {
    if (
      error === null ||
      typeof error !== "object" ||
      error.code !== "ERR_MODULE_NOT_FOUND" ||
      !String(error.message).includes("@praxa/sdk")
    ) {
      throw error;
    }
    for (const sibling of ["../../sdk/dist/index.js", "../../aura-sdk/dist/index.js"]) {
      try {
        return await import(sibling);
      } catch (siblingError) {
        if (
          siblingError === null ||
          typeof siblingError !== "object" ||
          siblingError.code !== "ERR_MODULE_NOT_FOUND"
        ) {
          throw siblingError;
        }
      }
    }
    throw error;
  }
}

function token() {
  const value = process.env.PRAXA_ACCESS_TOKEN ?? process.env.AURA_ACCESS_TOKEN;
  if (!value) throw new Error("PRAXA_ACCESS_TOKEN is required");
  return value;
}

async function main() {
  const command = parsePraxaCliArguments(process.argv.slice(2), process.env);
  const {
    PraxaClient,
    PRAXA_CONTRACT_VERSION,
    PRAXA_OPENAPI_SHA256,
    PRAXA_OPENAPI_VERSION,
  } = await loadSdk();
  if (command.kind === "version") {
    process.stdout.write(`${JSON.stringify({
      cliVersion: "0.1.0",
      openapiVersion: PRAXA_OPENAPI_VERSION,
      contractVersion: PRAXA_CONTRACT_VERSION,
      openapiSha256: PRAXA_OPENAPI_SHA256,
    }, null, 2)}\n`);
    return;
  }
  const client = new PraxaClient({ baseUrl: command.baseUrl, accessToken: token });
  let result;
  switch (command.kind) {
    case "doctor":
      result = { ok: true, coverage: await client.getReferenceCoverage() };
      break;
    case "mission-get":
      result = await client.getMission(command.runId);
      break;
    case "mission-create":
      result = await client.createMission(
        JSON.parse(await readFile(command.input, "utf8")),
        command.idempotencyKey,
      );
      break;
    case "mission-cancel":
      result = await client.cancelMission(command.runId, command.reason, command.idempotencyKey);
      break;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Praxa CLI failed"}\n`);
  process.exitCode = 1;
});
