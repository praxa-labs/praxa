export const MCP_PROTOCOL_VERSION = "2025-11-25" as const;
export const MCP_LEGACY_PROTOCOL_VERSION = "2025-03-26" as const;
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_PROTOCOL_VERSION,
  MCP_LEGACY_PROTOCOL_VERSION,
] as const;
export const MCP_SERVER_NAME = "aura-agent-os" as const;
export const MCP_SERVER_VERSION = "0.2.0" as const;

export type JsonRpcId = string | number;
export type JsonRpcRequest = Readonly<{
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}>;

export type JsonRpcResponse = Readonly<{
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  result?: unknown;
  error?: Readonly<{ code: number; message: string; data?: unknown }>;
}>;

export type AuraMcpTool = Readonly<{
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  operationId: string;
  method: "GET" | "POST";
  path: string;
  requiredScope: string;
  idempotency: "required" | "safe-read";
  annotations: Readonly<{
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  }>;
  pathArgument?: string;
}>;

const objectSchema = (properties: Record<string, unknown> = {}, required: readonly string[] = []) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length === 0 ? {} : { required }),
}) as const;
const identifier = { type: "string", minLength: 1, maxLength: 256, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$" } as const;
const idempotency = { type: "string", minLength: 16, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$" } as const;
const runId = { type: "string", format: "uuid" } as const;
const memoryClasses = ["working", "episodic", "semantic", "procedural", "prospective", "source_of_truth", "derived_hypothesis", "quarantine"] as const;
const resourceBudget = {
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
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const governedMutation = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export const AURA_MCP_TOOLS = [
  {
    name: "aura_submit_intent",
    description: "Record a natural-language intent for deterministic compilation. No action or provider outcome is implied.",
    inputSchema: objectSchema({ intent: { type: "string", minLength: 1, maxLength: 4_000 }, idempotencyKey: idempotency }, ["intent", "idempotencyKey"]),
    operationId: "submitIntent", method: "POST", path: "/v8/intents", requiredScope: "missions:write", idempotency: "required", annotations: governedMutation,
  },
  {
    name: "aura_create_mission",
    description: "Submit a goal to Praxa policy and durable orchestration. This tool grants no action authority.",
    inputSchema: objectSchema({ goalSpec: { type: "object" }, resourceBudget, idempotencyKey: idempotency }, ["goalSpec", "resourceBudget", "idempotencyKey"]),
    operationId: "createMission", method: "POST", path: "/v8/missions", requiredScope: "missions:write", idempotency: "required", annotations: governedMutation,
  },
  {
    name: "aura_get_mission",
    description: "Read an authoritative mission projection.",
    inputSchema: objectSchema({ runId }, ["runId"]),
    operationId: "getMission", method: "GET", path: "/v8/missions/{runId}", requiredScope: "missions:read", idempotency: "safe-read", annotations: readOnly, pathArgument: "runId",
  },
  {
    name: "aura_signal_mission",
    description: "Record a mission signal for policy-controlled handling; it does not directly commit a provider effect.",
    inputSchema: objectSchema({ runId, signal: { type: "string", minLength: 1, maxLength: 256 }, payload: {}, idempotencyKey: idempotency }, ["runId", "signal", "payload", "idempotencyKey"]),
    operationId: "signalMission", method: "POST", path: "/v8/missions/{runId}/signals", requiredScope: "missions:write", idempotency: "required", annotations: governedMutation, pathArgument: "runId",
  },
  {
    name: "aura_cancel_mission",
    description: "Request durable mission cancellation through the Praxa Control Plane.",
    inputSchema: objectSchema({ runId, reason: { type: "string", minLength: 1, maxLength: 500 }, idempotencyKey: idempotency }, ["runId", "reason", "idempotencyKey"]),
    operationId: "cancelMission", method: "POST", path: "/v8/missions/{runId}/cancel", requiredScope: "missions:write", idempotency: "required", annotations: { ...governedMutation, destructiveHint: true }, pathArgument: "runId",
  },
  {
    name: "aura_search_capabilities",
    description: "Search policy-eligible capability manifests before semantic ranking.",
    inputSchema: objectSchema({ actionFamily: { type: "string", minLength: 1, maxLength: 128 }, purpose: { type: "string", minLength: 1, maxLength: 256 }, targetType: { type: "string", minLength: 1, maxLength: 128 } }, ["actionFamily", "purpose", "targetType"]),
    operationId: "searchCapabilities", method: "POST", path: "/v8/capabilities/search", requiredScope: "capabilities:read", idempotency: "safe-read", annotations: readOnly,
  },
  {
    name: "aura_query_memory",
    description: "Query purpose-filtered memory through the private Control Plane.",
    inputSchema: objectSchema({ compartment: { type: "string", minLength: 1, maxLength: 128 }, purpose: { type: "string", minLength: 1, maxLength: 256 }, classes: { type: "array", minItems: 1, maxItems: 64, uniqueItems: true, items: { type: "string", enum: memoryClasses } }, queryText: { type: "string", minLength: 1, maxLength: 32768 }, queryEmbedding: { type: "array", minItems: 1, maxItems: 4096, items: { type: "number" } }, limit: { type: "integer", minimum: 1, maximum: 50, default: 10 }, maxContextBytes: { type: "integer", minimum: 64, maximum: 1_048_576 }, maxContextTokens: { type: "integer", minimum: 16, maximum: 262_144 } }, ["compartment", "purpose", "classes", "queryText"]),
    operationId: "queryMemory", method: "POST", path: "/v8/memory/query", requiredScope: "memory:read", idempotency: "safe-read", annotations: readOnly,
  },
  {
    name: "aura_get_skill",
    description: "Read a versioned governed skill and evidence state.",
    inputSchema: objectSchema({ skillId: identifier }, ["skillId"]),
    operationId: "getSkill", method: "GET", path: "/v8/skills/{skillId}", requiredScope: "skills:read", idempotency: "safe-read", annotations: readOnly, pathArgument: "skillId",
  },
  {
    name: "aura_get_trace",
    description: "Read a redacted causal trace.",
    inputSchema: objectSchema({ traceId: { type: "string", format: "uuid" } }, ["traceId"]),
    operationId: "getTrace", method: "GET", path: "/v8/traces/{traceId}", requiredScope: "traces:read", idempotency: "safe-read", annotations: readOnly, pathArgument: "traceId",
  },
  {
    name: "aura_list_goals",
    description: "List purpose- and compartment-filtered context goals.",
    inputSchema: objectSchema(),
    operationId: "listGoals", method: "GET", path: "/v8/context-twin/goals", requiredScope: "context:read", idempotency: "safe-read", annotations: readOnly,
  },
  {
    name: "aura_list_world_certificates",
    description: "List signed model capability certificates; certificates grant zero action authority.",
    inputSchema: objectSchema(),
    operationId: "listWorldModelCertificates", method: "GET", path: "/v8/world-model/certificates", requiredScope: "world:read", idempotency: "safe-read", annotations: readOnly,
  },
  {
    name: "aura_get_coverage",
    description: "Read reference coverage evidence. Coverage is not production readiness.",
    inputSchema: objectSchema(),
    operationId: "getReferenceCoverage", method: "GET", path: "/v8/coverage", requiredScope: "coverage:read", idempotency: "safe-read", annotations: readOnly,
  },
] as const satisfies readonly AuraMcpTool[];

export function auraMcpTool(name: string): AuraMcpTool | undefined {
  return AURA_MCP_TOOLS.find((tool) => tool.name === name);
}

/** Public Praxa aliases. Aura names remain stable wire-contract identifiers. */
export const PRAXA_MCP_TOOLS = AURA_MCP_TOOLS;
export const praxaMcpTool = auraMcpTool;
export type PraxaMcpTool = AuraMcpTool;
