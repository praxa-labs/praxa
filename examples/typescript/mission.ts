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

const submission = await praxa.submitIntent(
  "Prepare the weekly review",
  crypto.randomUUID(),
);

console.log({
  submissionId: submission.submissionId,
  disposition: submission.disposition,
  message: submission.message,
});
