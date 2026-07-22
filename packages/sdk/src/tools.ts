import type { AuraClient } from "./client.js";
import type { CreateMissionRequest, JsonObject, JsonValue, MemoryQuery } from "./generated-contracts.js";

export type PraxaAgentToolDefinition = Readonly<{
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  requiredScope: string;
  readOnly: boolean;
}>;

export type PraxaAgentTool = PraxaAgentToolDefinition & Readonly<{
  execute(input: unknown, options?: Readonly<{ signal?: AbortSignal }>): Promise<JsonValue>;
}>;

const identifier = { type: "string", minLength: 1, maxLength: 256, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$" } as const;
const idempotency = { type: "string", minLength: 16, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$" } as const;
const runId = { type: "string", format: "uuid" } as const;
const memoryClasses = ["working", "episodic", "semantic", "procedural", "prospective", "source_of_truth", "derived_hypothesis", "quarantine"] as const;
const objectSchema = (properties: Record<string, unknown> = {}, required: readonly string[] = []) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length === 0 ? {} : { required }),
}) as const;
const resourceBudgetSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    maximumSteps: { type: "integer", minimum: 1, maximum: 128 },
    maximumToolCalls: { type: "integer", minimum: 0, maximum: 4_096 },
    maximumElapsedMs: { type: "integer", minimum: 1_000, maximum: 86_400_000 },
    maximumParallelism: { type: "integer", minimum: 1, maximum: 64 },
  },
  required: ["maximumSteps", "maximumToolCalls", "maximumElapsedMs", "maximumParallelism"],
} as const;

export const PRAXA_AGENT_TOOL_DEFINITIONS = [
  {
    name: "aura_submit_intent",
    description: "Record a natural-language intent for deterministic compilation. No action or provider outcome is implied.",
    inputSchema: objectSchema({ intent: { type: "string", minLength: 1, maxLength: 4_000 }, idempotencyKey: idempotency }, ["intent", "idempotencyKey"]),
    requiredScope: "missions:write", readOnly: false,
  },
  {
    name: "aura_create_mission",
    description: "Submit a goal to Praxa policy and durable orchestration. This tool grants no action authority.",
    inputSchema: objectSchema({ goalSpec: { type: "object" }, resourceBudget: resourceBudgetSchema, idempotencyKey: idempotency }, ["goalSpec", "resourceBudget", "idempotencyKey"]),
    requiredScope: "missions:write", readOnly: false,
  },
  {
    name: "aura_get_mission",
    description: "Read an authoritative mission projection.",
    inputSchema: objectSchema({ runId }, ["runId"]),
    requiredScope: "missions:read", readOnly: true,
  },
  {
    name: "aura_signal_mission",
    description: "Record a mission signal for policy-controlled handling; it does not directly commit a provider effect.",
    inputSchema: objectSchema({ runId, signal: { type: "string", minLength: 1, maxLength: 256 }, payload: {}, idempotencyKey: idempotency }, ["runId", "signal", "payload", "idempotencyKey"]),
    requiredScope: "missions:write", readOnly: false,
  },
  {
    name: "aura_cancel_mission",
    description: "Request durable mission cancellation through the Praxa Control Plane.",
    inputSchema: objectSchema({ runId, reason: { type: "string", minLength: 1, maxLength: 500 }, idempotencyKey: idempotency }, ["runId", "reason", "idempotencyKey"]),
    requiredScope: "missions:write", readOnly: false,
  },
  {
    name: "aura_search_capabilities",
    description: "Search policy-eligible capability manifests before semantic ranking.",
    inputSchema: objectSchema({ actionFamily: { type: "string", minLength: 1, maxLength: 128 }, purpose: { type: "string", minLength: 1, maxLength: 256 }, targetType: { type: "string", minLength: 1, maxLength: 128 } }, ["actionFamily", "purpose", "targetType"]),
    requiredScope: "capabilities:read", readOnly: true,
  },
  {
    name: "aura_query_memory",
    description: "Query purpose-filtered memory through the private Control Plane.",
    inputSchema: objectSchema({
      compartment: { type: "string", minLength: 1, maxLength: 128 },
      purpose: { type: "string", minLength: 1, maxLength: 256 },
      classes: { type: "array", minItems: 1, maxItems: 64, uniqueItems: true, items: { type: "string", enum: memoryClasses } },
      queryText: { type: "string", minLength: 1, maxLength: 32_768 },
      queryEmbedding: { type: "array", minItems: 1, maxItems: 4_096, items: { type: "number" } },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      maxContextBytes: { type: "integer", minimum: 64, maximum: 1_048_576 },
      maxContextTokens: { type: "integer", minimum: 16, maximum: 262_144 },
    }, ["compartment", "purpose", "classes", "queryText"]),
    requiredScope: "memory:read", readOnly: true,
  },
  {
    name: "aura_get_skill",
    description: "Read a versioned governed skill and evidence state.",
    inputSchema: objectSchema({ skillId: identifier }, ["skillId"]),
    requiredScope: "skills:read", readOnly: true,
  },
  {
    name: "aura_get_trace",
    description: "Read a redacted causal trace.",
    inputSchema: objectSchema({ traceId: { type: "string", format: "uuid" } }, ["traceId"]),
    requiredScope: "traces:read", readOnly: true,
  },
  {
    name: "aura_list_goals",
    description: "List purpose- and compartment-filtered context goals.",
    inputSchema: objectSchema(),
    requiredScope: "context:read", readOnly: true,
  },
  {
    name: "aura_list_world_certificates",
    description: "List signed model capability certificates; certificates grant zero action authority.",
    inputSchema: objectSchema(),
    requiredScope: "world:read", readOnly: true,
  },
  {
    name: "aura_get_coverage",
    description: "Read reference coverage evidence. Coverage is not production readiness.",
    inputSchema: objectSchema(),
    requiredScope: "coverage:read", readOnly: true,
  },
] as const satisfies readonly PraxaAgentToolDefinition[];

export type PraxaAgentToolName = (typeof PRAXA_AGENT_TOOL_DEFINITIONS)[number]["name"];

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Praxa tool input must be an object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`Unexpected Praxa tool input: ${unexpected.sort().join(", ")}`);
  for (const key of required) {
    if (value[key] === undefined) throw new Error(`Missing Praxa tool input: ${key}`);
  }
}

function requiredString(value: Record<string, unknown>, key: string, maximumLength = 32_768): string {
  const found = value[key];
  if (typeof found !== "string" || found.trim().length === 0 || found.length > maximumLength) {
    throw new Error(`Invalid Praxa tool input: ${key}`);
  }
  return found;
}

function requiredUuid(value: Record<string, unknown>, key: string): string {
  const found = requiredString(value, key, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(found)) {
    throw new Error(`Invalid Praxa tool input: ${key}`);
  }
  return found;
}

function requiredIdentifier(value: Record<string, unknown>, key: string): string {
  const found = requiredString(value, key, 256);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(found)) {
    throw new Error(`Invalid Praxa tool input: ${key}`);
  }
  return found;
}

function assertBoundedJsonBytes(value: unknown): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("Praxa tool input must be bounded JSON");
  }
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > 240_000) {
    throw new Error("Praxa tool input exceeds the byte limit");
  }
}

function idempotencyKey(value: Record<string, unknown>): string {
  const found = requiredString(value, "idempotencyKey");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u.test(found)) {
    throw new Error("Invalid Praxa tool input: idempotencyKey");
  }
  return found;
}

function jsonValue(value: unknown, depth = 0, entries = { count: 0 }): JsonValue {
  entries.count += 1;
  if (depth > 32 || entries.count > 32_768) throw new Error("Praxa tool JSON input exceeds the structural limit");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((entry) => jsonValue(entry, depth + 1, entries));
  if (value !== null && typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) result[key] = jsonValue(entry, depth + 1, entries);
    return result;
  }
  throw new Error("Praxa tool input must contain only finite JSON values");
}

function jsonObject(value: unknown, key: string): JsonObject {
  const parsed = jsonValue(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid Praxa tool input: ${key}`);
  }
  return parsed as JsonObject;
}

function boundedInteger(value: Record<string, unknown>, key: string, minimum: number, maximum: number): number | undefined {
  const found = value[key];
  if (found === undefined) return undefined;
  if (!Number.isSafeInteger(found) || Number(found) < minimum || Number(found) > maximum) {
    throw new Error(`Invalid Praxa tool input: ${key}`);
  }
  return Number(found);
}

function resourceBudget(value: unknown): CreateMissionRequest["resourceBudget"] {
  const input = record(value);
  const keys = ["maximumSteps", "maximumToolCalls", "maximumElapsedMs", "maximumParallelism"];
  exactKeys(input, keys, keys);
  return {
    maximumSteps: boundedInteger(input, "maximumSteps", 1, 128)!,
    maximumToolCalls: boundedInteger(input, "maximumToolCalls", 0, 4_096)!,
    maximumElapsedMs: boundedInteger(input, "maximumElapsedMs", 1_000, 86_400_000)!,
    maximumParallelism: boundedInteger(input, "maximumParallelism", 1, 64)!,
  };
}

function memoryQuery(input: Record<string, unknown>): MemoryQuery {
  const allowed = ["compartment", "purpose", "classes", "queryText", "queryEmbedding", "limit", "maxContextBytes", "maxContextTokens"];
  exactKeys(input, allowed, ["compartment", "purpose", "classes", "queryText"]);
  const classes = input["classes"];
  if (
    !Array.isArray(classes)
    || classes.length < 1
    || classes.length > 64
    || !classes.every((entry) => typeof entry === "string" && memoryClasses.includes(entry as typeof memoryClasses[number]))
    || new Set(classes).size !== classes.length
  ) {
    throw new Error("Invalid Praxa tool input: classes");
  }
  const embedding = input["queryEmbedding"];
  if (embedding !== undefined && (!Array.isArray(embedding) || embedding.length < 1 || embedding.length > 4_096 || !embedding.every((entry) => typeof entry === "number" && Number.isFinite(entry)))) {
    throw new Error("Invalid Praxa tool input: queryEmbedding");
  }
  return {
    compartment: requiredString(input, "compartment", 128),
    purpose: requiredString(input, "purpose", 256),
    classes,
    queryText: requiredString(input, "queryText"),
    ...(embedding === undefined ? {} : { queryEmbedding: embedding }),
    ...(input["limit"] === undefined ? {} : { limit: boundedInteger(input, "limit", 1, 50)! }),
    ...(input["maxContextBytes"] === undefined ? {} : { maxContextBytes: boundedInteger(input, "maxContextBytes", 64, 1_048_576)! }),
    ...(input["maxContextTokens"] === undefined ? {} : { maxContextTokens: boundedInteger(input, "maxContextTokens", 16, 262_144)! }),
  };
}

function asJson(value: unknown): JsonValue {
  return jsonValue(value);
}

export function assertPraxaAgentToolInput(name: PraxaAgentToolName, rawInput: unknown): void {
  assertBoundedJsonBytes(rawInput);
  const input = record(rawInput);
  if (name === "aura_submit_intent") {
    exactKeys(input, ["intent", "idempotencyKey"], ["intent", "idempotencyKey"]);
    requiredString(input, "intent", 4_000);
    idempotencyKey(input);
    return;
  }
  if (name === "aura_create_mission") {
    exactKeys(input, ["goalSpec", "resourceBudget", "idempotencyKey"], ["goalSpec", "resourceBudget", "idempotencyKey"]);
    jsonObject(input["goalSpec"], "goalSpec");
    resourceBudget(input["resourceBudget"]);
    idempotencyKey(input);
    return;
  }
  if (name === "aura_get_mission") {
    exactKeys(input, ["runId"], ["runId"]);
    requiredUuid(input, "runId");
    return;
  }
  if (name === "aura_signal_mission") {
    exactKeys(input, ["runId", "signal", "payload", "idempotencyKey"], ["runId", "signal", "payload", "idempotencyKey"]);
    requiredUuid(input, "runId");
    requiredString(input, "signal", 256);
    jsonValue(input["payload"]);
    idempotencyKey(input);
    return;
  }
  if (name === "aura_cancel_mission") {
    exactKeys(input, ["runId", "reason", "idempotencyKey"], ["runId", "reason", "idempotencyKey"]);
    requiredUuid(input, "runId");
    requiredString(input, "reason", 500);
    idempotencyKey(input);
    return;
  }
  if (name === "aura_search_capabilities") {
    const keys = ["actionFamily", "purpose", "targetType"];
    exactKeys(input, keys, keys);
    requiredString(input, "actionFamily", 128);
    requiredString(input, "purpose", 256);
    requiredString(input, "targetType", 128);
    return;
  }
  if (name === "aura_query_memory") {
    memoryQuery(input);
    return;
  }
  if (name === "aura_get_skill" || name === "aura_get_trace") {
    const key = name === "aura_get_skill" ? "skillId" : "traceId";
    exactKeys(input, [key], [key]);
    if (key === "traceId") requiredUuid(input, key);
    else requiredIdentifier(input, key);
    return;
  }
  exactKeys(input, [], []);
}

export async function executePraxaAgentTool(
  client: AuraClient,
  name: PraxaAgentToolName,
  rawInput: unknown,
  options: Readonly<{ signal?: AbortSignal }> = {},
): Promise<JsonValue> {
  assertPraxaAgentToolInput(name, rawInput);
  const input = record(rawInput);
  const signal = options.signal;
  if (name === "aura_submit_intent") {
    return asJson(await client.submitIntent(requiredString(input, "intent", 4_000), idempotencyKey(input), signal));
  }
  if (name === "aura_create_mission") {
    exactKeys(input, ["goalSpec", "resourceBudget", "idempotencyKey"], ["goalSpec", "resourceBudget", "idempotencyKey"]);
    return asJson(await client.createMission({ goalSpec: jsonObject(input["goalSpec"], "goalSpec"), resourceBudget: resourceBudget(input["resourceBudget"]) }, idempotencyKey(input), signal));
  }
  if (name === "aura_get_mission") {
    exactKeys(input, ["runId"], ["runId"]);
    return asJson(await client.getMission(requiredUuid(input, "runId"), signal));
  }
  if (name === "aura_signal_mission") {
    exactKeys(input, ["runId", "signal", "payload", "idempotencyKey"], ["runId", "signal", "payload", "idempotencyKey"]);
    return asJson(await client.signalMission(requiredUuid(input, "runId"), requiredString(input, "signal", 256), jsonValue(input["payload"]), idempotencyKey(input), signal));
  }
  if (name === "aura_cancel_mission") {
    exactKeys(input, ["runId", "reason", "idempotencyKey"], ["runId", "reason", "idempotencyKey"]);
    return asJson(await client.cancelMission(requiredUuid(input, "runId"), requiredString(input, "reason", 500), idempotencyKey(input), signal));
  }
  if (name === "aura_search_capabilities") {
    const keys = ["actionFamily", "purpose", "targetType"];
    exactKeys(input, keys, keys);
    return asJson(await client.searchCapabilities({ actionFamily: requiredString(input, "actionFamily"), purpose: requiredString(input, "purpose"), targetType: requiredString(input, "targetType") }, signal));
  }
  if (name === "aura_query_memory") return asJson(await client.queryMemory(memoryQuery(input), signal));
  if (name === "aura_get_skill") {
    exactKeys(input, ["skillId"], ["skillId"]);
    return asJson(await client.getSkill(requiredIdentifier(input, "skillId"), signal));
  }
  if (name === "aura_get_trace") {
    exactKeys(input, ["traceId"], ["traceId"]);
    return asJson(await client.getTrace(requiredUuid(input, "traceId"), signal));
  }
  exactKeys(input, [], []);
  if (name === "aura_list_goals") return asJson(await client.listGoals(signal));
  if (name === "aura_list_world_certificates") return asJson(await client.listWorldModelCertificates(signal));
  return asJson(await client.getReferenceCoverage(signal));
}

export function createPraxaAgentTools(client: AuraClient): readonly PraxaAgentTool[] {
  return PRAXA_AGENT_TOOL_DEFINITIONS.map((definition) => ({
    ...definition,
    execute: (input: unknown, options?: Readonly<{ signal?: AbortSignal }>) =>
      executePraxaAgentTool(client, definition.name, input, options),
  }));
}

export const PRAXA_OPENAI_FUNCTION_TOOLS = PRAXA_AGENT_TOOL_DEFINITIONS.map((definition) => ({
  type: "function" as const,
  name: definition.name,
  description: definition.description,
  parameters: definition.inputSchema,
  strict: false as const,
}));
