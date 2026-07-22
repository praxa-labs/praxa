# Framework integrations

All examples keep provider credentials and action authority behind the Praxa
gateway. The caller supplies only a short-lived delegated Praxa token.

## Shared client

```ts
import { createPraxaAgentTools, PraxaClient } from "@praxa/sdk";

const praxa = new PraxaClient({
  baseUrl: process.env.PRAXA_BASE_URL!,
  accessToken: () => process.env.PRAXA_ACCESS_TOKEN!,
});
const praxaTools = createPraxaAgentTools(praxa);
```

## Vercel AI SDK

```ts
import { jsonSchema, tool, ToolLoopAgent } from "ai";

const tools = Object.fromEntries(praxaTools.map((definition) => [
  definition.name,
  tool({
    description: definition.description,
    inputSchema: jsonSchema(definition.inputSchema),
    execute: definition.execute,
  }),
]));

const agent = new ToolLoopAgent({ model, tools });
```

Keep framework-level approval enabled for mutations. Praxa still performs the
authoritative server-side scope, consent, purpose, target, budget, and
revocation checks.

## OpenAI Responses or Agents

Use Praxa as a remote MCP server when the runtime supports remote MCP:

```ts
const response = await openai.responses.create({
  model: "your-reviewed-model",
  input: "Prepare the weekly review",
  tools: [{
    type: "mcp",
    server_label: "praxa",
    server_url: `${process.env.PRAXA_BASE_URL}/mcp`,
    authorization: process.env.PRAXA_ACCESS_TOKEN,
    require_approval: "always",
  }],
});
```

For a function-calling loop, import `PRAXA_OPENAI_FUNCTION_TOOLS` and dispatch
returned calls to the matching item from `createPraxaAgentTools(praxa)`.

## LangChain

```ts
import { tool } from "@langchain/core/tools";

const tools = praxaTools.map((definition) => tool(
  definition.execute,
  {
    name: definition.name,
    description: definition.description,
    schema: definition.inputSchema,
  },
));
```

## Codex, Claude Code, Cursor, and VS Code

Run `npx @praxa/cli@0.2.0 init`. These clients connect directly to `/mcp`, so
no framework adapter is needed. Review the generated `.praxa/SETUP.md`, inject
or acquire a delegated token, restart the client, and ask it to list tools
before invoking a mutation.
