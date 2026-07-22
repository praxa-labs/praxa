export type AuraCliCommand =
  | Readonly<{ kind: "version" }>
  | Readonly<{ kind: "doctor"; baseUrl: string }>
  | Readonly<{ kind: "mission-get"; baseUrl: string; runId: string }>
  | Readonly<{ kind: "mission-create"; baseUrl: string; input: string; idempotencyKey: string }>
  | Readonly<{ kind: "mission-cancel"; baseUrl: string; runId: string; reason: string; idempotencyKey: string }>;

function option(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
}

function required(arguments_: readonly string[], name: string): string {
  const value = option(arguments_, name);
  if (value === undefined || value.trim().length === 0) throw new Error(`Missing ${name}`);
  return value;
}

export function parseAuraCliArguments(
  arguments_: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = {},
): AuraCliCommand {
  if (arguments_[0] === "version" || arguments_[0] === "--version") {
    return { kind: "version" };
  }
  const baseUrl = option(arguments_, "--base-url")
    ?? environment["PRAXA_BASE_URL"]
    ?? environment["AURA_BASE_URL"];
  if (baseUrl === undefined) {
    throw new Error("Missing --base-url or PRAXA_BASE_URL");
  }
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("Aura base URL must be HTTPS and contain no credentials");
  }
  if (arguments_[0] === "doctor") return { kind: "doctor", baseUrl: url.origin };
  if (arguments_[0] !== "mission") throw new Error("Expected doctor or mission command");
  if (arguments_[1] === "get") {
    return { kind: "mission-get", baseUrl: url.origin, runId: required(arguments_, "--run-id") };
  }
  if (arguments_[1] === "create") {
    return {
      kind: "mission-create",
      baseUrl: url.origin,
      input: required(arguments_, "--input"),
      idempotencyKey: required(arguments_, "--idempotency-key"),
    };
  }
  if (arguments_[1] === "cancel") {
    return {
      kind: "mission-cancel",
      baseUrl: url.origin,
      runId: required(arguments_, "--run-id"),
      reason: required(arguments_, "--reason"),
      idempotencyKey: required(arguments_, "--idempotency-key"),
    };
  }
  throw new Error("Expected mission get, create, or cancel");
}

export const parsePraxaCliArguments = parseAuraCliArguments;
