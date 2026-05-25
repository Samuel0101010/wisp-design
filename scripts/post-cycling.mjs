#!/usr/bin/env node
// Post a cycling event (3 variants) back to the wisp-design bridge.
// Usage: node scripts/post-cycling.mjs <path-to-cycling.json>
// Reads .wisp/live/port.lock for token+port.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const lockPath = resolve(projectRoot, ".wisp/live/port.lock");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/post-cycling.mjs <cycling.json>");
  process.exit(2);
}

const body = JSON.parse(readFileSync(resolve(file), "utf8"));
if (body.kind !== "cycling") {
  console.error(`expected kind=cycling, got kind=${body.kind}`);
  process.exit(2);
}
// Ensure sessionId is present (bridge schema requires it).
if (!body.sessionId) body.sessionId = lock.sessionId ?? "external";

const url = `http://127.0.0.1:${lock.port}/events?token=${lock.token}`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error(`POST failed: ${res.status} ${text}`);
  process.exit(1);
}
console.log(`OK ${res.status} → ${text}`);
console.log(`${body.variants.length} variants delivered to bridge (cycling event).`);
