export const MCP_PROTOCOL_VERSION = "2025-03-26" as const;
export const MCP_SERVER_NAME = "aura-agent-os" as const;
export const MCP_SERVER_VERSION = "0.1.0" as const;

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
  pathArgument?: string;
}>;

const objectSchema = (properties: Record<string, unknown> = {}, required: readonly string[] = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length === 0 ? {} : { required }),
}) as const;
const string = { type: "string", minLength: 1 } as const;

export const AURA_MCP_TOOLS = [
  {
    name: "aura_create_mission",
    description: "Submit a goal to Aura policy and broker orchestration. This tool grants no action authority.",
    inputSchema: objectSchema({ goalSpec: { type: "object" }, resourceBudget: { type: "object" }, idempotencyKey: string }, ["goalSpec", "resourceBudget", "idempotencyKey"]),
    operationId: "createMission", method: "POST", path: "/v8/missions", requiredScope: "missions:write", idempotency: "required",
  },
  {
    name: "aura_get_mission",
    description: "Read an authoritative mission projection.",
    inputSchema: objectSchema({ runId: string }, ["runId"]),
    operationId: "getMission", method: "GET", path: "/v8/missions/{runId}", requiredScope: "missions:read", idempotency: "safe-read", pathArgument: "runId",
  },
  {
    name: "aura_signal_mission",
    description: "Record a mission signal for policy-controlled handling; it does not directly commit a provider effect.",
    inputSchema: objectSchema({ runId: string, signal: string, payload: {}, idempotencyKey: string }, ["runId", "signal", "payload", "idempotencyKey"]),
    operationId: "signalMission", method: "POST", path: "/v8/missions/{runId}/signals", requiredScope: "missions:write", idempotency: "required", pathArgument: "runId",
  },
  {
    name: "aura_cancel_mission",
    description: "Request durable mission cancellation through the Control Plane.",
    inputSchema: objectSchema({ runId: string, reason: string, idempotencyKey: string }, ["runId", "reason", "idempotencyKey"]),
    operationId: "cancelMission", method: "POST", path: "/v8/missions/{runId}/cancel", requiredScope: "missions:write", idempotency: "required", pathArgument: "runId",
  },
  {
    name: "aura_search_capabilities",
    description: "Search policy-eligible capability manifests before semantic ranking.",
    inputSchema: objectSchema({ actionFamily: string, purpose: string, targetType: string }, ["actionFamily", "purpose", "targetType"]),
    operationId: "searchCapabilities", method: "POST", path: "/v8/capabilities/search", requiredScope: "capabilities:read", idempotency: "safe-read",
  },
  {
    name: "aura_query_memory",
    description: "Query purpose-filtered memory through the private Control Plane.",
    inputSchema: objectSchema({ compartment: string, purpose: string, classes: { type: "array", items: string }, queryText: { type: "string", minLength: 1, maxLength: 32768 }, queryEmbedding: { type: "array", minItems: 1, maxItems: 4096, items: { type: "number" } }, limit: { type: "integer", minimum: 1, maximum: 50, default: 10 }, maxContextBytes: { type: "integer", minimum: 64, maximum: 1_048_576 }, maxContextTokens: { type: "integer", minimum: 16, maximum: 262_144 } }, ["compartment", "purpose", "classes", "queryText"]),
    operationId: "queryMemory", method: "POST", path: "/v8/memory/query", requiredScope: "memory:read", idempotency: "safe-read",
  },
  {
    name: "aura_get_skill",
    description: "Read a versioned governed skill and evidence state.",
    inputSchema: objectSchema({ skillId: string }, ["skillId"]),
    operationId: "getSkill", method: "GET", path: "/v8/skills/{skillId}", requiredScope: "skills:read", idempotency: "safe-read", pathArgument: "skillId",
  },
  {
    name: "aura_get_trace",
    description: "Read a redacted causal trace.",
    inputSchema: objectSchema({ traceId: string }, ["traceId"]),
    operationId: "getTrace", method: "GET", path: "/v8/traces/{traceId}", requiredScope: "traces:read", idempotency: "safe-read", pathArgument: "traceId",
  },
  {
    name: "aura_list_goals",
    description: "List purpose- and compartment-filtered context goals.",
    inputSchema: objectSchema(),
    operationId: "listGoals", method: "GET", path: "/v8/context-twin/goals", requiredScope: "context:read", idempotency: "safe-read",
  },
  {
    name: "aura_list_world_certificates",
    description: "List signed model capability certificates; certificates grant zero action authority.",
    inputSchema: objectSchema(),
    operationId: "listWorldModelCertificates", method: "GET", path: "/v8/world-model/certificates", requiredScope: "world:read", idempotency: "safe-read",
  },
  {
    name: "aura_get_coverage",
    description: "Read reference coverage evidence. Coverage is not production readiness.",
    inputSchema: objectSchema(),
    operationId: "getReferenceCoverage", method: "GET", path: "/v8/coverage", requiredScope: "coverage:read", idempotency: "safe-read",
  },
] as const satisfies readonly AuraMcpTool[];

export function auraMcpTool(name: string): AuraMcpTool | undefined {
  return AURA_MCP_TOOLS.find((tool) => tool.name === name);
}

/** Public Praxa aliases. Aura names remain stable wire-contract identifiers. */
export const PRAXA_MCP_TOOLS = AURA_MCP_TOOLS;
export const praxaMcpTool = auraMcpTool;
export type PraxaMcpTool = AuraMcpTool;
