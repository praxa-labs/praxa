# Read-only memory federation

```ts
import {
  MemoryFederation,
  createMem0MemorySource,
  createOpenAIAgentsSessionSource,
} from "@praxa/sdk/memory";

const federation = new MemoryFederation({
  sources: [
    createMem0MemorySource({
      client: mem0Client,
      mapNamespace: ({ subjectId }) => ({ userId: subjectId }),
    }),
    createOpenAIAgentsSessionSource({
      sessionForNamespace: ({ subjectId }) => sessions.forSubject(subjectId),
    }),
  ],
  maxConcurrency: 2,
});

const result = await federation.recall({
  query: "What should the assistant remember?",
  namespace: { tenantId: "tenant-1", subjectId: "person-1" },
  limit: 10,
  timeoutMs: 3_000,
});

for (const item of result.items) {
  console.log(item.kind, item.text, item.ranking.score);
  for (const match of item.matches) {
    console.log(match.provider, match.sourceRecordId, match.provenance);
  }
}
```

Both `mem0Client` and `sessions` are application-owned. This example provides
no credential, endpoint, provider write, or live Praxa backend.
