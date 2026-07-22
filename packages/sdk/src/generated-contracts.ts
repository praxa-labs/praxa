/**
 * GENERATED FILE. DO NOT EDIT.
 * Source: openapi/v8/frontier-agent-os-api.yaml
 * Generator: scripts/generate-integration-sdk.ts
 */

export const AURA_OPENAPI_VERSION = "8.1.0" as const;
export const AURA_CONTRACT_VERSION = "aura-integration-gateway-v8.1" as const;
export const AURA_CONTRACT_FINGERPRINT = "7afed65f7a8de5a07d974f729675419e4d99c93d1ada26353bd7844efd43a98e" as const;
export const AURA_OPENAPI_SOURCE_DIGEST: string = AURA_CONTRACT_FINGERPRINT;
export const AURA_OPENAPI_SHA256: string = AURA_CONTRACT_FINGERPRINT;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type AuraRouteContract = Readonly<{
  operationId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  scope: string;
  idempotency: "required" | "safe-read" | "none";
  response: "json" | "sse" | "mcp";
}>;

export const AURA_ROUTE_CONTRACTS = [
  { operationId: "createMission", method: "POST", path: "/v8/missions", scope: "missions:write", idempotency: "required", response: "json" },
  { operationId: "getMission", method: "GET", path: "/v8/missions/{runId}", scope: "missions:read", idempotency: "safe-read", response: "json" },
  { operationId: "streamMissionEvents", method: "GET", path: "/v8/missions/{runId}/events", scope: "missions:read", idempotency: "safe-read", response: "sse" },
  { operationId: "signalMission", method: "POST", path: "/v8/missions/{runId}/signals", scope: "missions:write", idempotency: "required", response: "json" },
  { operationId: "cancelMission", method: "POST", path: "/v8/missions/{runId}/cancel", scope: "missions:write", idempotency: "required", response: "json" },
  { operationId: "searchCapabilities", method: "POST", path: "/v8/capabilities/search", scope: "capabilities:read", idempotency: "safe-read", response: "json" },
  { operationId: "queryMemory", method: "POST", path: "/v8/memory/query", scope: "memory:read", idempotency: "safe-read", response: "json" },
  { operationId: "getSkill", method: "GET", path: "/v8/skills/{skillId}", scope: "skills:read", idempotency: "safe-read", response: "json" },
  { operationId: "getTrace", method: "GET", path: "/v8/traces/{traceId}", scope: "traces:read", idempotency: "safe-read", response: "json" },
  { operationId: "listGoals", method: "GET", path: "/v8/context-twin/goals", scope: "context:read", idempotency: "safe-read", response: "json" },
  { operationId: "listWorldModelCertificates", method: "GET", path: "/v8/world-model/certificates", scope: "world:read", idempotency: "safe-read", response: "json" },
  { operationId: "getReferenceCoverage", method: "GET", path: "/v8/coverage", scope: "coverage:read", idempotency: "safe-read", response: "json" },
  { operationId: "handleMcpGet", method: "GET", path: "/mcp", scope: "mcp:invoke", idempotency: "none", response: "mcp" },
  { operationId: "handleMcpPost", method: "POST", path: "/mcp", scope: "mcp:invoke", idempotency: "none", response: "mcp" },
] as const satisfies readonly AuraRouteContract[];

export type AuraOperationMap = Readonly<{
  readonly createMission: Readonly<{
    method: "POST";
    path: "/v8/missions";
    scope: "missions:write";
    requestBody: CreateMissionRequest;
    responseBody: MissionProjection;
  }>;
  readonly getMission: Readonly<{
    method: "GET";
    path: "/v8/missions/{runId}";
    scope: "missions:read";
    requestBody: never;
    responseBody: MissionProjection;
  }>;
  readonly streamMissionEvents: Readonly<{
    method: "GET";
    path: "/v8/missions/{runId}/events";
    scope: "missions:read";
    requestBody: never;
    responseBody: string;
  }>;
  readonly signalMission: Readonly<{
    method: "POST";
    path: "/v8/missions/{runId}/signals";
    scope: "missions:write";
    requestBody: SignalMissionRequest;
    responseBody: JsonValue;
  }>;
  readonly cancelMission: Readonly<{
    method: "POST";
    path: "/v8/missions/{runId}/cancel";
    scope: "missions:write";
    requestBody: CancelMissionRequest;
    responseBody: JsonValue;
  }>;
  readonly searchCapabilities: Readonly<{
    method: "POST";
    path: "/v8/capabilities/search";
    scope: "capabilities:read";
    requestBody: CapabilityRequirement;
    responseBody: readonly (CapabilityManifest)[];
  }>;
  readonly queryMemory: Readonly<{
    method: "POST";
    path: "/v8/memory/query";
    scope: "memory:read";
    requestBody: MemoryQuery;
    responseBody: JsonValue;
  }>;
  readonly getSkill: Readonly<{
    method: "GET";
    path: "/v8/skills/{skillId}";
    scope: "skills:read";
    requestBody: never;
    responseBody: JsonValue;
  }>;
  readonly getTrace: Readonly<{
    method: "GET";
    path: "/v8/traces/{traceId}";
    scope: "traces:read";
    requestBody: never;
    responseBody: JsonValue;
  }>;
  readonly listGoals: Readonly<{
    method: "GET";
    path: "/v8/context-twin/goals";
    scope: "context:read";
    requestBody: never;
    responseBody: JsonValue;
  }>;
  readonly listWorldModelCertificates: Readonly<{
    method: "GET";
    path: "/v8/world-model/certificates";
    scope: "world:read";
    requestBody: never;
    responseBody: JsonValue;
  }>;
  readonly getReferenceCoverage: Readonly<{
    method: "GET";
    path: "/v8/coverage";
    scope: "coverage:read";
    requestBody: never;
    responseBody: JsonValue;
  }>;
  readonly handleMcpGet: Readonly<{
    method: "GET";
    path: "/mcp";
    scope: "mcp:invoke";
    requestBody: never;
    responseBody: never;
  }>;
  readonly handleMcpPost: Readonly<{
    method: "POST";
    path: "/mcp";
    scope: "mcp:invoke";
    requestBody: JsonRpcMessage;
    responseBody: JsonRpcMessage;
  }>;
}>;

export type AuraOperationId = keyof AuraOperationMap;
export type AuraOperationRequest<Operation extends AuraOperationId> = AuraOperationMap[Operation]["requestBody"];
export type AuraOperationResponse<Operation extends AuraOperationId> = AuraOperationMap[Operation]["responseBody"];

export type CancelMissionRequest = Readonly<{
  readonly reason: string;
}>;

export type CapabilityManifest = Readonly<{
  readonly capabilityId: string;
  readonly contractHash: string;
  readonly healthState: "healthy" | "degraded" | "unavailable" | "quarantined";
  readonly kind: "api" | "mcp" | "a2a_agent" | "browser" | "device" | "skill" | "human";
  readonly version: string;
}>;

export type CapabilityRequirement = Readonly<{
  readonly actionFamily: string;
  readonly purpose: string;
  readonly targetType: string;
}>;

export type CreateMissionRequest = Readonly<{
  readonly goalSpec: JsonObject;
  readonly resourceBudget: ResourceBudget;
}>;

export type JsonRpcMessage = Readonly<{
  readonly error?: JsonObject;
  readonly id?: string | number | null;
  readonly jsonrpc: "2.0";
  readonly method?: string;
  readonly params?: JsonValue;
  readonly result?: JsonValue;
}>;

export type MemoryQuery = Readonly<{
  readonly classes: readonly (string)[];
  readonly compartment: string;
  readonly limit?: number;
  readonly maxContextBytes?: number;
  readonly maxContextTokens?: number;
  readonly purpose: string;
  readonly queryEmbedding?: readonly (number)[];
  readonly queryText: string;
}>;

export type MissionProjection = Readonly<{
  readonly runId: string;
  readonly sequence: number;
  readonly status: "running" | "waiting" | "succeeded" | "failed" | "cancelled";
  readonly steps: readonly (Readonly<{
    readonly status: string;
    readonly stepId: string;
  }>)[];
}>;

export type Problem = Readonly<{
  readonly code: string;
  readonly detail: string;
  readonly requestId: string;
  readonly status: number;
  readonly title: string;
  readonly type: string;
}>;

export type ResourceBudget = Readonly<{
  readonly maximumElapsedMs: number;
  readonly maximumParallelism: number;
  readonly maximumSteps: number;
  readonly maximumToolCalls: number;
}>;

export type SignalMissionRequest = Readonly<{
  readonly payload: JsonValue;
  readonly signal: string;
}>;

export type AuraProblem = Problem;

export type AuraSseEvent = Readonly<{
  id: string;
  event: string;
  data: JsonValue;
}>;
