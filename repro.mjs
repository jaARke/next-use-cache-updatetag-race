// Deletes b while another request's read of the list is still in flight, then checks
// what the deleting user sees. Plain Node, no dependencies.
//
// Usage: node repro.mjs [--base http://localhost:3100] [--path / | /remote] [--runs 10] [--alone]
//   --alone  skips the concurrent reader (the control case)
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3100" },
    path: { type: "string", default: "/" },
    runs: { type: "string", default: "10" },
    alone: { type: "boolean", default: false },
  },
});
const { base, path, alone } = values;
const runs = Number(values.runs);

// How long after the reader's request the delete is sent: its read has started
// by then, and its 1.5 s query has not finished.
const deleteDelayMs = 300;
const expected = ["a", "c"];

function listIn(html) {
  const list = html.match(/<ul id="list">(.*?)<\/ul>/s);
  if (!list) throw new Error("no #list in the response");
  return [...list[1].matchAll(/<li>(.*?)<\/li>/g)].map((match) => match[1]);
}

async function getList() {
  const response = await fetch(base + path);
  return listIn(await response.text());
}

async function reset() {
  const response = await fetch(base + "/api/reset", { method: "POST" });
  if (!response.ok) throw new Error(`reset failed: ${response.status}`);
}

// The delete form's action id, from its progressively enhanced markup.
async function deleteActionField() {
  const html = await (await fetch(base + "/edit")).text();
  const field = html.match(/name="(\$ACTION_ID_[^"]+)"/);
  if (!field) throw new Error("no server action field on /edit");
  return field[1];
}

// Submits the delete form as a browser does without JavaScript, then follows the
// action's redirect to the list.
async function deleteB(actionField) {
  const form = new FormData();
  form.append(actionField, "");
  form.append("to", path);
  const response = await fetch(base + "/edit", {
    method: "POST",
    body: form,
    headers: { origin: base },
  });
  return listIn(await response.text());
}

async function run(actionField) {
  await reset();
  let reader;
  if (!alone) {
    // Another user's read of the list: a cache miss, so it starts the fill.
    reader = getList();
    await sleep(deleteDelayMs);
  }
  const afterDelete = await deleteB(actionField);
  await reader;
  const afterReload = await getList();
  return { afterDelete, afterReload };
}

const same = (list) => list.join() === expected.join();
const show = (list) => `[${list.join(", ")}]`;

const actionField = await deleteActionField();
await run(actionField); // warm-up, not counted: compiles the routes in next dev

const mode = alone ? "without a concurrent reader" : "with a concurrent reader";
console.log(`${base}${path}, ${mode}, ${runs} runs, expecting ${show(expected)}`);
let deleteFailures = 0;
let reloadFailures = 0;
for (let i = 1; i <= runs; i++) {
  const { afterDelete, afterReload } = await run(actionField);
  if (!same(afterDelete)) deleteFailures++;
  if (!same(afterReload)) reloadFailures++;
  console.log(
    `run ${i}: after the delete ${show(afterDelete)} ${same(afterDelete) ? "PASS" : "FAIL"}, ` +
      `after a reload ${show(afterReload)} ${same(afterReload) ? "PASS" : "FAIL"}`,
  );
}
const tally = (failures) => (failures === 0 ? `PASS ${runs}/${runs}` : `FAIL ${failures}/${runs}`);
console.log(`after the delete: ${tally(deleteFailures)}`);
console.log(`after a reload:   ${tally(reloadFailures)}`);
process.exitCode = deleteFailures + reloadFailures === 0 ? 0 : 1;
