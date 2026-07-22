# `@praxa/mcp-contracts`

Protocol-only Model Context Protocol (MCP) 2025-11-25 contracts for the Praxa
agentic harness, with negotiated 2025-03-26 compatibility. Use the package to discover governed tools, required OAuth
scopes, idempotency rules, JSON-RPC types, and versioned Integration Gateway
routes from TypeScript.

Tool metadata is descriptive and contributes no authority. Every tool maps to
a versioned `/v8` route and ultimately executes, when authorized, through the
private deterministic policy, broker, and independent verifier path.

## Install

```sh
npm install @praxa/mcp-contracts
```

Node.js 20 or newer is supported. The package is ESM, contains no runtime
dependencies, and includes TypeScript declarations.

## Use the contracts

```ts
import {
  MCP_PROTOCOL_VERSION,
  PRAXA_MCP_TOOLS,
  praxaMcpTool,
} from "@praxa/mcp-contracts";

console.log(MCP_PROTOCOL_VERSION);
console.log(PRAXA_MCP_TOOLS.map((tool) => tool.name));
console.log(praxaMcpTool("aura_create_mission")?.requiredScope);
```

The `aura_*` tool names are stable wire identifiers retained for compatibility.
The public package name and TypeScript aliases use the Praxa brand.

The package does not implement an MCP server, OAuth authority, provider
adapter, or action executor. Connect an MCP Streamable HTTP client to `/mcp`
and use a delegated Praxa OAuth token with the exact scope required by each
tool. Current clients negotiate 2025-11-25; legacy 2025-03-26 clients remain
supported.

Repository: [praxa-labs/praxa](https://github.com/praxa-labs/praxa)
