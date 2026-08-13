import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertReleaseRefMatchesVersion, publishRequestedFromEnvironment } from "./release-context.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

assertReleaseRefMatchesVersion({
  eventName: process.env.GITHUB_EVENT_NAME,
  refName: process.env.GITHUB_REF_NAME,
  version: manifest.version,
  publishRequested: publishRequestedFromEnvironment(process.env.PRAXA_RELEASE_PUBLISH_REQUESTED),
});

console.log(`Release context accepted for ${manifest.version}.`);
