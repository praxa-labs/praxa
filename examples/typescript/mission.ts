import { PraxaClient } from "@praxa/sdk";

const baseUrl = process.env.PRAXA_BASE_URL;
const accessToken = process.env.PRAXA_ACCESS_TOKEN;

if (baseUrl === undefined || accessToken === undefined) {
  throw new Error("Set PRAXA_BASE_URL and PRAXA_ACCESS_TOKEN");
}

const praxa = new PraxaClient({
  baseUrl,
  accessToken: () => accessToken,
});

const mission = await praxa.createMission(
  {
    goalSpec: { task: "Prepare the weekly review" },
    resourceBudget: {
      maximumSteps: 12,
      maximumToolCalls: 8,
      maximumElapsedMs: 120_000,
      maximumParallelism: 2,
    },
  },
  crypto.randomUUID(),
);

console.log({ runId: mission.runId, status: mission.status });

for await (const event of praxa.missionEvents(mission.runId)) {
  console.log(event.id, event.event, event.data);
}
