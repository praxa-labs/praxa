#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parsePraxaCliArguments } from "../dist/arguments.js";
import { initializePraxaProject, loadPraxaProjectBaseUrl } from "../dist/init.js";

const help = `Praxa CLI

Usage:
  praxa init [--base-url URL] [--target TARGET] [--auth environment|oauth]
             [--project-dir DIR] [--dry-run] [--force] [--json]
  praxa doctor [--base-url URL]
  praxa mission submit --intent TEXT --idempotency-key KEY [--base-url URL]
  praxa mission get --run-id ID [--base-url URL]
  praxa mission create --input FILE --idempotency-key KEY [--base-url URL]
  praxa mission cancel --run-id ID --reason TEXT --idempotency-key KEY [--base-url URL]
  praxa version

Init targets: codex, claude, cursor, vscode, env, or all. Repeat --target to
select several. Project files never contain an access token or provider key.
`;

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
  const arguments_ = process.argv.slice(2);
  const usesGateway = arguments_[0] === "doctor" || arguments_[0] === "mission";
  const projectBaseUrl = usesGateway
    && process.env.PRAXA_BASE_URL === undefined
    && process.env.AURA_BASE_URL === undefined
    && !arguments_.includes("--base-url")
    ? await loadPraxaProjectBaseUrl(process.cwd())
    : undefined;
  const command = parsePraxaCliArguments(arguments_, {
    ...process.env,
    ...(projectBaseUrl === undefined ? {} : { PRAXA_BASE_URL: projectBaseUrl }),
  });
  if (command.kind === "help") {
    process.stdout.write(help);
    return;
  }
  if (command.kind === "init") {
    const initialized = await initializePraxaProject(command);
    if (command.json) {
      process.stdout.write(`${JSON.stringify(initialized, null, 2)}\n`);
      return;
    }
    const changed = initialized.files.filter((file) => file.action !== "unchanged");
    process.stdout.write(`${initialized.dryRun ? "Planned" : "Configured"} Praxa at ${initialized.projectDirectory}.\n`);
    for (const file of changed) process.stdout.write(`  ${file.action}: ${file.path}\n`);
    for (const step of initialized.nextSteps) process.stdout.write(`  next: ${step}\n`);
    return;
  }
  const {
    PraxaClient,
    PRAXA_CONTRACT_VERSION,
    PRAXA_OPENAPI_SHA256,
    PRAXA_OPENAPI_VERSION,
  } = await loadSdk();
  if (command.kind === "version") {
    process.stdout.write(`${JSON.stringify({
      cliVersion: "0.2.0",
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
    case "mission-submit":
      result = await client.submitIntent(command.intent, command.idempotencyKey);
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
