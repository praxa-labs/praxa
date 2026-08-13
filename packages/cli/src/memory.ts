import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PraxaMemoryProvider } from "./arguments.js";

const schemaVersion = "praxa-memory-sources-v1" as const;
const relativeConfigPath = ".praxa/memory.json";
const providers = new Set<PraxaMemoryProvider>(["mem0", "zep", "graphiti", "langgraph", "letta", "openai_agents"]);
const lockWaitMs = 5_000;
const staleLockMs = 30_000;

type SourceConfig = Readonly<{
  id: PraxaMemoryProvider;
  provider: PraxaMemoryProvider;
  mode: "federated";
  access: "read_only";
  enabled: true;
}>;
type MemoryConfig = Readonly<{ schemaVersion: typeof schemaVersion; sources: readonly SourceConfig[] }>;

function errorCode(error: unknown): unknown {
  return error !== null && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
}

function optionsRecord(value: unknown, allowed: readonly string[], name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${name} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).find((key) => !allowed.includes(key));
  if (unexpected !== undefined) throw new Error(`${name} contains unsupported option ${unexpected}`);
  return record;
}

function projectDirectoryOption(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    throw new Error("projectDirectory must be a non-empty path");
  }
  return value;
}

function validateSourceOptions(value: unknown): Readonly<{
  projectDirectory: string;
  provider: PraxaMemoryProvider;
  mode: "federated";
  dryRun: boolean;
}> {
  const record = optionsRecord(value, ["projectDirectory", "provider", "mode", "dryRun"], "memory source options");
  if (!providers.has(record["provider"] as PraxaMemoryProvider)) throw new Error("provider is unsupported");
  if (record["mode"] !== "federated") throw new Error("mode must be federated");
  if (typeof record["dryRun"] !== "boolean") throw new Error("dryRun must be a boolean");
  return {
    projectDirectory: projectDirectoryOption(record["projectDirectory"]),
    provider: record["provider"] as PraxaMemoryProvider,
    mode: "federated",
    dryRun: record["dryRun"],
  };
}

function validatePlanOptions(value: unknown): Readonly<{ projectDirectory: string; dryRun: true }> {
  const record = optionsRecord(value, ["projectDirectory", "dryRun"], "memory sync plan options");
  if (record["dryRun"] !== true) throw new Error("dryRun must be true for memory sync planning");
  return { projectDirectory: projectDirectoryOption(record["projectDirectory"]), dryRun: true };
}

async function safeRoot(projectDirectory: string): Promise<string> {
  const root = await realpath(path.resolve(projectDirectory));
  if (!(await lstat(root)).isDirectory()) throw new Error("--project-dir must name an existing directory");
  const praxaDirectory = path.join(root, ".praxa");
  const stat = await lstat(praxaDirectory).catch((error: unknown) => errorCode(error) === "ENOENT" ? undefined : Promise.reject(error));
  if (stat?.isSymbolicLink() === true || (stat !== undefined && !stat.isDirectory())) {
    throw new Error(`Refusing unsafe project directory: ${praxaDirectory}`);
  }
  return root;
}

async function ensurePraxaDirectory(root: string): Promise<string> {
  const directory = path.join(root, ".praxa");
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Refusing unsafe project directory: ${directory}`);
  return directory;
}

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function withConfigLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const directory = await ensurePraxaDirectory(root);
  const lockPath = path.join(directory, "memory.json.lock");
  const startedAt = Date.now();
  const token = randomUUID();
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  while (handle === undefined) {
    try {
      handle = await open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(`${token}\n`, "utf8");
      } catch (error) {
        await handle.close().catch(() => undefined);
        handle = undefined;
        await unlink(lockPath).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const stat = await lstat(lockPath).catch((statError: unknown) => errorCode(statError) === "ENOENT" ? undefined : Promise.reject(statError));
      if (stat === undefined) continue;
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refusing unsafe memory config lock: ${lockPath}`);
      if (Date.now() - stat.mtimeMs > staleLockMs) {
        throw new Error(`Stale memory config lock requires manual verification before removal: ${lockPath}`);
      }
      if (Date.now() - startedAt >= lockWaitMs) throw new Error(`Timed out waiting for memory config lock: ${lockPath}`);
      await delay(20);
    }
  }
  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    const owner = await readFile(lockPath, "utf8").catch((error: unknown) => errorCode(error) === "ENOENT" ? undefined : Promise.reject(error));
    if (owner === `${token}\n`) await unlink(lockPath).catch(() => undefined);
  }
}

function parseConfig(source: string, filePath: string): MemoryConfig {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error(`${filePath} is not valid JSON; no files were changed`); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${filePath} is not a memory config; no files were changed`);
  const record = value as Record<string, unknown>;
  if (record["schemaVersion"] !== schemaVersion || !Array.isArray(record["sources"]) || Object.keys(record).some((key) => !["schemaVersion", "sources"].includes(key))) {
    throw new Error(`${filePath} is not a ${schemaVersion} config; no files were changed`);
  }
  if (record["sources"].length > 16) throw new Error(`${filePath} exceeds 16 memory sources`);
  const sources = record["sources"].map((source, index) => {
    if (source === null || typeof source !== "object" || Array.isArray(source)) throw new Error(`${filePath} source ${index} is invalid`);
    const entry = source as Record<string, unknown>;
    if (
      !providers.has(entry["provider"] as PraxaMemoryProvider)
      || entry["id"] !== entry["provider"]
      || entry["mode"] !== "federated"
      || entry["access"] !== "read_only"
      || entry["enabled"] !== true
      || Object.keys(entry).some((key) => !["id", "provider", "mode", "access", "enabled"].includes(key))
    ) throw new Error(`${filePath} source ${index} is invalid`);
    return entry as SourceConfig;
  });
  if (new Set(sources.map((source) => source.id)).size !== sources.length) throw new Error(`${filePath} contains duplicate source ids`);
  return { schemaVersion, sources };
}

async function readConfig(root: string): Promise<MemoryConfig> {
  const filePath = path.join(root, relativeConfigPath);
  try {
    const stat = await lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refusing to replace non-regular file: ${filePath}`);
    return parseConfig(await readFile(filePath, "utf8"), filePath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { schemaVersion, sources: [] };
    throw error;
  }
}

async function atomicWrite(root: string, config: MemoryConfig): Promise<void> {
  await ensurePraxaDirectory(root);
  const filePath = path.join(root, relativeConfigPath);
  const temporary = `${filePath}.praxa-${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, filePath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function addPraxaMemorySource(options: Readonly<{
  projectDirectory: string;
  provider: PraxaMemoryProvider;
  mode: "federated";
  dryRun: boolean;
}>): Promise<unknown> {
  const validated = validateSourceOptions(options);
  const root = await safeRoot(validated.projectDirectory);
  const configure = async (): Promise<unknown> => {
    const current = await readConfig(root);
    const existing = current.sources.find((source) => source.id === validated.provider);
    const source: SourceConfig = { id: validated.provider, provider: validated.provider, mode: "federated", access: "read_only", enabled: true };
    const config = existing === undefined ? { schemaVersion, sources: [...current.sources, source] } : current;
    if (!validated.dryRun && existing === undefined) await atomicWrite(root, config);
    return {
      schemaVersion: "praxa-memory-source-plan-v1",
      projectDirectory: root,
      dryRun: validated.dryRun,
      file: { path: relativeConfigPath, action: existing === undefined ? "create_or_update" : "unchanged" },
      source,
      execution: "local_configuration_only",
      notice: "No provider connection, credential, sync, mirror, cutover, write, or migration was executed.",
    };
  };
  return validated.dryRun ? configure() : withConfigLock(root, configure);
}

export async function planPraxaMemorySync(options: Readonly<{ projectDirectory: string; dryRun: true }>): Promise<unknown> {
  const validated = validatePlanOptions(options);
  const root = await safeRoot(validated.projectDirectory);
  const config = await readConfig(root);
  return {
    schemaVersion: "praxa-memory-sync-plan-v1",
    projectDirectory: root,
    dryRun: true,
    executable: false,
    sources: config.sources,
    operations: [],
    notice: "Sync, mirror, cutover, provider writes, and migration execution are not implemented.",
  };
}
