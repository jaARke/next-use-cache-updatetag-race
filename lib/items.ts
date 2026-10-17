import { cacheTag } from "next/cache";
import { setTimeout as sleep } from "node:timers/promises";

// Stand-in for a database: the pages, the action and the reset route share it.
const db = globalThis as typeof globalThis & { items?: string[] };

export function readItems(): string[] {
  db.items ??= ["a", "b", "c"];
  return [...db.items];
}

export function writeItems(items: string[]) {
  db.items = items;
}

// Stand-in for a slow query: the rows are read first and arrive 1.5 s later.
const queryLatencyMs = 1500;

export async function getItems() {
  "use cache";
  cacheTag("items");
  const items = readItems();
  await sleep(queryLatencyMs);
  return items;
}

// The same function with the remote cache handler, shown on /remote.
export async function getItemsRemote() {
  "use cache: remote";
  cacheTag("items");
  const items = readItems();
  await sleep(queryLatencyMs);
  return items;
}
