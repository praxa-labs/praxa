import type {
  AuraProblem,
  AuraSseEvent,
  CreateMissionRequest,
  JsonObject,
  JsonValue,
  MemoryQuery,
  MissionProjection,
} from "./generated-contracts.js";

export type AccessTokenProvider = () => string | Promise<string>;

export type AuraClientOptions = Readonly<{
  baseUrl: string;
  accessToken: AccessTokenProvider;
  fetch?: typeof fetch;
  maximumAttempts?: number;
  retryBaseDelayMs?: number;
}>;

export class AuraClientError extends Error {
  constructor(
    readonly status: number,
    readonly problem: AuraProblem | undefined,
  ) {
    super(problem?.detail ?? `Aura request failed with HTTP ${status}`);
    this.name = "AuraClientError";
  }
}

/** Public Praxa name. Aura remains the wire-level compatibility name. */
export { AuraClientError as PraxaClientError };

type RequestOptions = Readonly<{
  method: "GET" | "POST";
  path: string;
  body?: JsonValue;
  idempotencyKey?: string;
  safeRead?: boolean;
  signal?: AbortSignal | undefined;
  headers?: HeadersInit;
}>;

const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

function assertAccessToken(token: string): string {
  if (token.length === 0 || token.length > 16_384 || /[\r\n]/u.test(token)) {
    throw new Error("OAuth access token is invalid");
  }
  return token;
}

function assertBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("Aura baseUrl must be an HTTPS origin without credentials");
  }
  return url;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

async function problemFrom(response: Response): Promise<AuraProblem | undefined> {
  if (!response.headers.get("content-type")?.includes("application/problem+json")) {
    return undefined;
  }
  try {
    return await response.json() as AuraProblem;
  } catch {
    return undefined;
  }
}

export class AuraClient {
  readonly #origin: URL;
  readonly #accessToken: AccessTokenProvider;
  readonly #fetch: typeof fetch;
  readonly #maximumAttempts: number;
  readonly #retryBaseDelayMs: number;

  constructor(options: AuraClientOptions) {
    this.#origin = assertBaseUrl(options.baseUrl);
    this.#accessToken = options.accessToken;
    this.#fetch = options.fetch ?? fetch;
    this.#maximumAttempts = Math.max(1, Math.min(options.maximumAttempts ?? 3, 4));
    this.#retryBaseDelayMs = Math.max(0, Math.min(options.retryBaseDelayMs ?? 100, 30_000));
  }

  async #request<T>(options: RequestOptions): Promise<T> {
    const mayRetry = options.safeRead === true || options.idempotencyKey !== undefined;
    const attempts = mayRetry ? this.#maximumAttempts : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const token = assertAccessToken(await this.#accessToken());
        const headers = new Headers(options.headers);
        headers.set("accept", "application/json");
        headers.set("authorization", `Bearer ${token}`);
        headers.set("x-aura-contract-version", "aura-integration-gateway-v8.1");
        if (options.body !== undefined) headers.set("content-type", "application/json");
        if (options.idempotencyKey !== undefined) {
          headers.set("idempotency-key", options.idempotencyKey);
        }
        const response = await this.#fetch(new URL(options.path, this.#origin), {
          method: options.method,
          headers,
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        if (response.ok) return await response.json() as T;
        if (!retryableStatuses.has(response.status) || attempt === attempts) {
          throw new AuraClientError(response.status, await problemFrom(response));
        }
      } catch (error) {
        lastError = error;
        if (error instanceof AuraClientError || attempt === attempts) throw error;
      }
      await delay(this.#retryBaseDelayMs * 2 ** (attempt - 1), options.signal);
    }
    throw lastError;
  }

  createMission(input: CreateMissionRequest, idempotencyKey: string, signal?: AbortSignal) {
    return this.#request<MissionProjection>({ method: "POST", path: "/v8/missions", body: input as unknown as JsonValue, idempotencyKey, signal });
  }

  getMission(runId: string, signal?: AbortSignal) {
    return this.#request<MissionProjection>({ method: "GET", path: `/v8/missions/${encodeURIComponent(runId)}`, safeRead: true, signal });
  }

  signalMission(runId: string, signalName: string, payload: JsonValue, idempotencyKey: string, signal?: AbortSignal) {
    return this.#request<JsonObject>({ method: "POST", path: `/v8/missions/${encodeURIComponent(runId)}/signals`, body: { signal: signalName, payload }, idempotencyKey, signal });
  }

  cancelMission(runId: string, reason: string, idempotencyKey: string, signal?: AbortSignal) {
    return this.#request<JsonObject>({ method: "POST", path: `/v8/missions/${encodeURIComponent(runId)}/cancel`, body: { reason }, idempotencyKey, signal });
  }

  searchCapabilities(requirement: JsonObject, signal?: AbortSignal) {
    return this.#request<readonly JsonObject[]>({ method: "POST", path: "/v8/capabilities/search", body: requirement, safeRead: true, signal });
  }

  queryMemory(query: MemoryQuery, signal?: AbortSignal) {
    return this.#request<JsonObject>({ method: "POST", path: "/v8/memory/query", body: query as unknown as JsonObject, safeRead: true, signal });
  }

  getSkill(skillId: string, signal?: AbortSignal) {
    return this.#request<JsonObject>({ method: "GET", path: `/v8/skills/${encodeURIComponent(skillId)}`, safeRead: true, signal });
  }

  getTrace(traceId: string, signal?: AbortSignal) {
    return this.#request<JsonObject>({ method: "GET", path: `/v8/traces/${encodeURIComponent(traceId)}`, safeRead: true, signal });
  }

  listGoals(signal?: AbortSignal) {
    return this.#request<readonly JsonObject[]>({ method: "GET", path: "/v8/context-twin/goals", safeRead: true, signal });
  }

  listWorldModelCertificates(signal?: AbortSignal) {
    return this.#request<readonly JsonObject[]>({ method: "GET", path: "/v8/world-model/certificates", safeRead: true, signal });
  }

  getReferenceCoverage(signal?: AbortSignal) {
    return this.#request<JsonObject>({ method: "GET", path: "/v8/coverage", safeRead: true, signal });
  }

  async *missionEvents(runId: string, options: Readonly<{ lastEventId?: string; signal?: AbortSignal }> = {}): AsyncGenerator<AuraSseEvent> {
    const token = assertAccessToken(await this.#accessToken());
    const headers = new Headers({
      accept: "text/event-stream",
      authorization: `Bearer ${token}`,
      "x-aura-contract-version": "aura-integration-gateway-v8.1",
    });
    if (options.lastEventId !== undefined) {
      if (!/^[\x21-\x7e]{1,256}$/u.test(options.lastEventId)) throw new Error("Last-Event-ID is invalid");
      headers.set("last-event-id", options.lastEventId);
    }
    const response = await this.#fetch(new URL(`/v8/missions/${encodeURIComponent(runId)}/events`, this.#origin), {
      headers,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!response.ok || response.body === null) throw new AuraClientError(response.status, await problemFrom(response));
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
      await response.body.cancel();
      throw new AuraClientError(response.status, undefined);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const maximumLineCharacters = 1_048_576;
    const maximumEventCharacters = 1_048_576;
    let buffered = "";
    let id = "";
    let event = "message";
    let data: string[] = [];
    let dataCharacters = 0;
    const dispatch = (): AuraSseEvent | undefined => {
      if (data.length === 0) {
        id = "";
        event = "message";
        return undefined;
      }
      if (!/^[\x21-\x7e]{1,256}$/u.test(id) || event.length === 0 || event.length > 256) {
        throw new Error("Aura SSE event metadata is invalid");
      }
      let parsed: JsonValue;
      try {
        parsed = JSON.parse(data.join("\n")) as JsonValue;
      } catch {
        throw new Error("Aura SSE event data is not valid JSON");
      }
      const value = { id, event, data: parsed };
      id = "";
      event = "message";
      data = [];
      dataCharacters = 0;
      return value;
    };
    const consumeLine = (line: string): AuraSseEvent | undefined => {
      if (line.length > maximumLineCharacters) throw new Error("Aura SSE line exceeds the client limit");
      if (line.length === 0) return dispatch();
      if (line.startsWith(":")) return undefined;
      const separator = line.indexOf(":");
      const field = separator < 0 ? line : line.slice(0, separator);
      let value = separator < 0 ? "" : line.slice(separator + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "id") {
        if (value.includes("\0")) throw new Error("Aura SSE event ID is invalid");
        id = value;
      } else if (field === "event") {
        event = value;
      } else if (field === "data") {
        dataCharacters += value.length;
        if (dataCharacters > maximumEventCharacters) throw new Error("Aura SSE event exceeds the client limit");
        data.push(value);
      }
      return undefined;
    };
    const nextLine = (final: boolean): string | undefined => {
      for (let index = 0; index < buffered.length; index += 1) {
        const character = buffered[index];
        if (character === "\n") {
          const line = buffered.slice(0, index);
          buffered = buffered.slice(index + 1);
          return line;
        }
        if (character === "\r") {
          if (index + 1 === buffered.length && !final) return undefined;
          const consumed = buffered[index + 1] === "\n" ? index + 2 : index + 1;
          const line = buffered.slice(0, index);
          buffered = buffered.slice(consumed);
          return line;
        }
      }
      if (!final || buffered.length === 0) return undefined;
      const line = buffered;
      buffered = "";
      return line;
    };
    let completed = false;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          try {
            buffered += decoder.decode();
          } catch {
            throw new Error("Aura SSE stream is not valid UTF-8");
          }
          let finalLine: string | undefined;
          while ((finalLine = nextLine(true)) !== undefined) {
            const value = consumeLine(finalLine);
            if (value !== undefined) yield value;
          }
          const finalEvent = dispatch();
          if (finalEvent !== undefined) yield finalEvent;
          completed = true;
          return;
        }
        try {
          buffered += decoder.decode(chunk.value, { stream: true });
        } catch {
          throw new Error("Aura SSE stream is not valid UTF-8");
        }
        if (buffered.length > maximumLineCharacters && !/[\r\n]/u.test(buffered)) {
          throw new Error("Aura SSE line exceeds the client limit");
        }
        let line: string | undefined;
        while ((line = nextLine(false)) !== undefined) {
          const value = consumeLine(line);
          if (value !== undefined) yield value;
        }
      }
    } finally {
      if (!completed) {
        try {
          await reader.cancel();
        } catch {
          // Early consumer cancellation is best effort.
        }
      }
      reader.releaseLock();
    }
  }
}

/** Public Praxa name. Aura remains the wire-level compatibility name. */
export { AuraClient as PraxaClient };
export type PraxaClientOptions = AuraClientOptions;
