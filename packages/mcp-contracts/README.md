# `@praxa/mcp-contracts`

Protocol-only MCP 2025-03-26 definitions for the Praxa Integration Gateway.
Tool metadata is descriptive and contributes no authority. Every tool maps to a
versioned `/v8` route and ultimately executes, when authorized, through the
private deterministic policy, broker, and verifier path.

## Install

```sh
npm install @praxa/mcp-contracts
```

The package is registry-ready but is not claimed as published until a separate
npm release is completed and verified.

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
adapter, or action executor. Connect an MCP 2025-03-26 Streamable HTTP client to
the hosted `/mcp` endpoint and use a delegated Praxa OAuth token with the exact
scope required by each tool.
