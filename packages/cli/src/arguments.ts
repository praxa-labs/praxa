export const DEFAULT_PRAXA_BASE_URL = "https://agents.praxa.io" as const;

export type PraxaInitTarget = "codex" | "claude" | "cursor" | "vscode" | "env";
export type PraxaAuthMode = "environment" | "oauth";

export type AuraCliCommand =
  | Readonly<{ kind: "help" }>
  | Readonly<{ kind: "version" }>
  | Readonly<{
      kind: "init";
      baseUrl: string;
      projectDirectory: string;
      targets: readonly PraxaInitTarget[];
      authMode: PraxaAuthMode;
      dryRun: boolean;
      force: boolean;
      json: boolean;
    }>
  | Readonly<{ kind: "doctor"; baseUrl: string }>
  | Readonly<{ kind: "mission-submit"; baseUrl: string; intent: string; idempotencyKey: string }>
  | Readonly<{ kind: "mission-get"; baseUrl: string; runId: string }>
  | Readonly<{ kind: "mission-create"; baseUrl: string; input: string; idempotencyKey: string }>
  | Readonly<{ kind: "mission-cancel"; baseUrl: string; runId: string; reason: string; idempotencyKey: string }>;

function option(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  if (index < 0) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}

function required(arguments_: readonly string[], name: string): string {
  const value = option(arguments_, name);
  if (value === undefined || value.trim().length === 0) throw new Error(`Missing ${name}`);
  return value;
}

function boundedText(arguments_: readonly string[], name: string, maximumLength: number): string {
  const value = required(arguments_, name).trim();
  if (value.length > maximumLength) throw new Error(`${name} exceeds ${maximumLength} characters`);
  return value;
}

function uuid(arguments_: readonly string[], name: string): string {
  const value = required(arguments_, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(`${name} must be a UUID`);
  }
  return value;
}

function idempotencyKey(arguments_: readonly string[]): string {
  const value = required(arguments_, "--idempotency-key");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u.test(value)) {
    throw new Error("--idempotency-key must be 16-128 supported characters");
  }
  return value;
}

function values(arguments_: readonly string[], name: string): string[] {
  const found: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== name) continue;
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--") || value.trim().length === 0) {
      throw new Error(`Missing ${name}`);
    }
    found.push(value);
  }
  return found;
}

function validateOptions(
  arguments_: readonly string[],
  start: number,
  valued: readonly string[],
  flags: readonly string[] = [],
): void {
  for (let index = start; index < arguments_.length; index += 1) {
    const argument = arguments_[index] ?? "";
    if (flags.includes(argument)) continue;
    if (valued.includes(argument)) {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`Missing ${argument}`);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
}

function canonicalBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) {
    throw new Error("Praxa base URL must be an exact HTTPS origin without credentials, path, query, or fragment");
  }
  return url.origin;
}

const initTargets = new Set<PraxaInitTarget>(["codex", "claude", "cursor", "vscode", "env"]);

function parseInitTargets(arguments_: readonly string[]): readonly PraxaInitTarget[] {
  const requested = values(arguments_, "--target");
  if (requested.length === 0) return [...initTargets];
  if (requested.includes("all")) {
    if (requested.length !== 1) throw new Error("--target all cannot be combined with another target");
    return [...initTargets];
  }
  const targets: PraxaInitTarget[] = [];
  for (const target of requested) {
    if (!initTargets.has(target as PraxaInitTarget)) {
      throw new Error("--target must be codex, claude, cursor, vscode, env, or all");
    }
    if (!targets.includes(target as PraxaInitTarget)) targets.push(target as PraxaInitTarget);
  }
  return targets;
}

export function parseAuraCliArguments(
  arguments_: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = {},
): AuraCliCommand {
  if (arguments_.length === 0 || arguments_[0] === "help" || arguments_[0] === "--help" || arguments_[0] === "-h") {
    validateOptions(arguments_, arguments_.length === 0 ? 0 : 1, []);
    return { kind: "help" };
  }
  if (arguments_[0] === "version" || arguments_[0] === "--version") {
    validateOptions(arguments_, 1, []);
    return { kind: "version" };
  }
  const configuredBaseUrl = option(arguments_, "--base-url")
    ?? environment["PRAXA_BASE_URL"]
    ?? environment["AURA_BASE_URL"];
  if (arguments_[0] === "init") {
    validateOptions(arguments_, 1, ["--base-url", "--target", "--auth", "--project-dir"], ["--dry-run", "--force", "--json"]);
    const authMode = option(arguments_, "--auth") ?? "environment";
    if (authMode !== "environment" && authMode !== "oauth") {
      throw new Error("--auth must be environment or oauth");
    }
    return {
      kind: "init",
      baseUrl: canonicalBaseUrl(configuredBaseUrl ?? DEFAULT_PRAXA_BASE_URL),
      projectDirectory: option(arguments_, "--project-dir") ?? ".",
      targets: parseInitTargets(arguments_),
      authMode,
      dryRun: arguments_.includes("--dry-run"),
      force: arguments_.includes("--force"),
      json: arguments_.includes("--json"),
    };
  }
  if (arguments_[0] !== "doctor" && arguments_[0] !== "mission") {
    throw new Error("Expected init, doctor, or mission command");
  }
  if (configuredBaseUrl === undefined) {
    throw new Error("Missing --base-url or PRAXA_BASE_URL");
  }
  const baseUrl = canonicalBaseUrl(configuredBaseUrl);
  if (arguments_[0] === "doctor") {
    validateOptions(arguments_, 1, ["--base-url"]);
    return { kind: "doctor", baseUrl };
  }
  if (arguments_[1] === "submit") {
    validateOptions(arguments_, 2, ["--base-url", "--intent", "--idempotency-key"]);
    return {
      kind: "mission-submit",
      baseUrl,
      intent: boundedText(arguments_, "--intent", 4_000),
      idempotencyKey: idempotencyKey(arguments_),
    };
  }
  if (arguments_[1] === "get") {
    validateOptions(arguments_, 2, ["--base-url", "--run-id"]);
    return { kind: "mission-get", baseUrl, runId: uuid(arguments_, "--run-id") };
  }
  if (arguments_[1] === "create") {
    validateOptions(arguments_, 2, ["--base-url", "--input", "--idempotency-key"]);
    return {
      kind: "mission-create",
      baseUrl,
      input: required(arguments_, "--input"),
      idempotencyKey: idempotencyKey(arguments_),
    };
  }
  if (arguments_[1] === "cancel") {
    validateOptions(arguments_, 2, ["--base-url", "--run-id", "--reason", "--idempotency-key"]);
    return {
      kind: "mission-cancel",
      baseUrl,
      runId: uuid(arguments_, "--run-id"),
      reason: boundedText(arguments_, "--reason", 500),
      idempotencyKey: idempotencyKey(arguments_),
    };
  }
  throw new Error("Expected mission submit, get, create, or cancel");
}

export const parsePraxaCliArguments = parseAuraCliArguments;
