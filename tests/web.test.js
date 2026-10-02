import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import * as cliCore from "../src/core.js";

// web/app.js is a plain script (it must work from file://), so load it the way a browser would:
// run its source in a fresh context. With no `document` it only exposes window.TinyTasks.
const appSource = fs.readFileSync(new URL("../web/app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");

function loadApp() {
  const context = vm.createContext({});
  vm.runInContext(appSource, context, { filename: "web/app.js" });
  return context.TinyTasks;
}

const app = loadApp();
const { core, store, execute } = app;

// Runs a command line and returns just the printed text (and classes) for easy assertions
// Values created inside the vm context have a different Array prototype, so strict deepEqual would
// reject them; plain() copies them into this realm first.
const plain = (value) => JSON.parse(JSON.stringify(value));

function say(line, storage) {
  return plain(execute(line, storage).lines.map((l) => l.text));
}

function outcome(fn) {
  try {
    return { ok: plain(fn()) };
  } catch (e) {
    return { error: { code: e.code, message: e.message } };
  }
}

test("web page: no modules, so it works when opened from file://", () => {
  assert.doesNotMatch(htmlSource, /type\s*=\s*["']module["']/);
  assert.doesNotMatch(appSource, /^\s*(import|export)\s/m);
  assert.match(htmlSource, /<script src="app\.js"><\/script>/);
  assert.match(htmlSource, /<link rel="stylesheet" href="style\.css">/);
});

test("web page: every element id the script looks up exists in index.html", () => {
  const wanted = [...appSource.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(wanted.length >= 8);
  for (const id of wanted) assert.match(htmlSource, new RegExp(`id="${id}"`), `missing #${id}`);
});

test("web rules behave exactly like src/core.js (differential test)", () => {
  // Same script of operations through both implementations; every result and every error must match
  const steps = [
    (c, s) => c.addTask(s, "buy milk"),
    (c, s) => c.addTask(s, "  walk the dog  "),
    (c, s) => c.addTask(s, ""),
    (c, s) => c.addTask(s, "   "),
    (c, s) => c.addTask(s, "café ✓ \"quoted\" 'single'"),
    (c, s) => c.addTask(s, "x".repeat(5000)),
    (c, s) => c.completeTask(s, 1),
    (c, s) => c.completeTask(s, 1),
    (c, s) => c.completeTask(s, 99),
    (c, s) => c.deleteTask(s, 99),
    (c, s) => c.deleteTask(s, 3),
    (c, s) => c.addTask(s, "after delete"),
    (c, s) => c.deleteTask(s, 1),
  ];
  let a = cliCore.emptyState();
  let b = core.emptyState();
  for (const [i, step] of steps.entries()) {
    const ra = outcome(() => step(cliCore, a));
    const rb = outcome(() => step(core, b));
    assert.deepEqual(rb, ra, `step ${i} differs`);
    if (ra.ok) {
      a = step(cliCore, a).state;
      b = step(core, b).state;
      assert.deepEqual(plain(b), plain(a), `state after step ${i} differs`);
    }
  }
});

test("web parseId and validateState agree with src/core.js on many inputs", () => {
  const ids = ["1", " 7 ", "12", "abc", "0", "-3", "1.5", "1e3", "", "0x10", "+1", "007", "99999999999999999999",
    "１２", "1\n", 5, 0, null, undefined];
  for (const v of ids) assert.deepEqual(outcome(() => core.parseId(v)), outcome(() => cliCore.parseId(v)), `parseId(${String(v)})`);

  const states = [
    cliCore.emptyState(),
    { next_id: 3, tasks: [{ id: 2, description: "buy milk", done: true }] },
    null, [], "x", {}, { next_id: 0, tasks: [] }, { next_id: 1.5, tasks: [] }, { next_id: 1 },
    { next_id: 2, tasks: [{ id: "1", description: "a", done: false }] },
    { next_id: 2, tasks: [{ id: 1, description: "a", done: "no" }] },
    { next_id: 2, tasks: [{ id: 1, description: "", done: false }] },
    { next_id: 3, tasks: [{ id: 1, description: "a", done: false }, { id: 1, description: "b", done: false }] },
    { next_id: 2, tasks: [{ id: 2, description: "a", done: false }] },
    { next_id: 2, tasks: [null] },
  ];
  for (const s of states) {
    assert.deepEqual(outcome(() => core.validateState(plain(s))), outcome(() => cliCore.validateState(s)), JSON.stringify(s));
  }
});

test("quickstart sequence prints the same messages as the CLI contract", () => {
  const s = store.createMemoryStorage();
  assert.deepEqual(say("add buy milk", s), ["Added task 1: buy milk"]);
  assert.deepEqual(say("list", s), ["  ID  DONE  TASK", "  1   [ ]   buy milk"]);
  assert.deepEqual(say("complete 1", s), ["Completed task 1"]);
  assert.deepEqual(say("list", s), ["  ID  DONE  TASK", "  1   [x]   buy milk"]);
  assert.deepEqual(say("complete 1", s), ["Task 1 is already done"]);
  assert.deepEqual(say("delete 1", s), ["Deleted task 1"]);
  assert.deepEqual(say("list", s), ["No tasks."]);
  assert.deepEqual(say("complete 99", s), ["error: no task with id 99"]);
});

test("list pads columns when ids and descriptions have different widths; ls is an alias", () => {
  const s = store.createMemoryStorage();
  for (let i = 1; i <= 10; i++) say(`add task number ${i}`, s);
  say("complete 10", s);
  const out = say("ls", s);
  assert.equal(out[0], "  ID  DONE  TASK");
  assert.equal(out[1], "  1   [ ]   task number 1");
  assert.equal(out[10], "  10  [x]   task number 10");
});

test("add: quotes optional, extra spaces collapse like a shell, blank description rejected", () => {
  const s = store.createMemoryStorage();
  assert.deepEqual(say('add "buy  milk"', s), ["Added task 1: buy  milk"]);
  assert.deepEqual(say("add walk the dog", s), ["Added task 2: walk the dog"]);
  assert.deepEqual(say('add ""', s), ["error: description cannot be empty"]);
  assert.deepEqual(say('add "   "', s), ["error: description cannot be empty"]);
  assert.deepEqual(say("add", s), ["error: missing description", "usage: add <description>"]);
});

test("descriptions with HTML-looking text, unicode and long text round-trip as plain text", () => {
  const s = store.createMemoryStorage();
  const tricky = '<img src=x onerror=alert(1)> café ✓ "q"';
  say(`add ${tricky.replace(/"/g, "'")}`, s);
  assert.ok(say("list", s)[1].endsWith(tricky.replace(/"/g, "'")));
  const long = "y".repeat(2000);
  say(`add ${long}`, s);
  assert.ok(say("list", s).at(-1).endsWith(long));
});

test("ids are never reused, even after deleting the newest task", () => {
  const s = store.createMemoryStorage();
  say("add a", s);
  say("add b", s);
  say("delete 2", s);
  assert.deepEqual(say("add c", s), ["Added task 3: c"]);
});

test("errors: unknown and invalid ids, usage, unknown command; storage unchanged by every failure", () => {
  const s = store.createMemoryStorage();
  say("add keep me", s);
  const before = s.get(store.DATA_KEY);
  const cases = [
    ["complete 99", ["error: no task with id 99"]],
    ["delete 99", ["error: no task with id 99"]],
    ["complete abc", ["error: invalid task id 'abc'"]],
    ["delete x", ["error: invalid task id 'x'"]],
    ["complete", ["error: missing task id", "usage: complete <id>"]],
    ["delete 1 2", ["error: too many arguments", "usage: delete <id>"]],
    ["list now", ["error: unexpected argument 'now'", "usage: list"]],
    ["frobnicate", ["command not found: frobnicate", "type 'help' to see available commands"]],
    ["constructor", ["command not found: constructor", "type 'help' to see available commands"]],
    ["__proto__", ["command not found: __proto__", "type 'help' to see available commands"]],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(say(line, s), expected, line);
    assert.equal(s.get(store.DATA_KEY), before, `${line} changed storage`);
  }
});

test("already-done complete and list never write", () => {
  const writes = [];
  const base = store.createMemoryStorage();
  const s = { get: (k) => base.get(k), set: (k, v) => { writes.push(k); base.set(k, v); } };
  say("add a", s);
  say("complete 1", s);
  const n = writes.length;
  say("complete 1", s);
  say("list", s);
  say("help", s);
  say("complete 99", s);
  assert.equal(writes.length, n);
});

test("persistence: a new session over the same storage sees earlier changes", () => {
  const s = store.createMemoryStorage();
  say("add first", s);
  say("add second", s);
  say("complete 2", s);
  const reloaded = loadApp(); // a fresh page load: new script, same storage
  assert.deepEqual(plain(reloaded.execute("list", s).lines.map((l) => l.text)),
    ["  ID  DONE  TASK", "  1   [ ]   first", "  2   [x]   second"]);
});

test("the stored shape is the same as the CLI file, so data can be copied across", () => {
  const s = store.createMemoryStorage();
  say("add buy milk", s);
  say("complete 1", s);
  assert.deepEqual(JSON.parse(s.get(store.DATA_KEY)), { next_id: 2, tasks: [{ id: 1, description: "buy milk", done: true }] });
  assert.doesNotThrow(() => cliCore.validateState(JSON.parse(s.get(store.DATA_KEY))));
});

test("corrupt stored data is reported and never overwritten", () => {
  for (const bad of ["{broken", "", "null", "[]", '{"tasks":[]}', '{"next_id":2,"tasks":[{"id":5,"description":"x","done":false}]}']) {
    const s = store.createMemoryStorage();
    s.set(store.DATA_KEY, bad);
    for (const line of ["list", "add x", "complete 1", "delete 1"]) {
      const out = say(line, s);
      assert.match(out[0], /^error: cannot read stored tasks/, `${line} on ${JSON.stringify(bad)}`);
      assert.equal(s.get(store.DATA_KEY), bad, `${line} overwrote ${JSON.stringify(bad)}`);
    }
    assert.ok(say("help", s).length > 3, "help still works");
  }
});

test("an invalid id never touches storage, even corrupt storage", () => {
  const s = store.createMemoryStorage();
  s.set(store.DATA_KEY, "{broken");
  assert.deepEqual(say("complete abc", s), ["error: invalid task id 'abc'"]);
});

test("help lists every command; clear asks the console to clear", () => {
  const s = store.createMemoryStorage();
  const text = say("help", s).join("\n");
  for (const name of ["add <description>", "list", "complete <id>", "delete <id>", "clear", "help"]) {
    assert.ok(text.includes(name), `help is missing ${name}`);
  }
  assert.equal(execute("clear", s).clear, true);
  assert.equal(execute("list", s).clear, false);
  assert.deepEqual(plain(execute("   ", s)), { lines: [], clear: false });
});

test("output lines carry the same style classes as lunch-match (bright / dim / err)", () => {
  const s = store.createMemoryStorage();
  assert.equal(execute("add a", s).lines[0].cls, "bright");
  assert.equal(execute("complete 1", s).lines[0].cls, "bright");
  assert.equal(execute("complete 1", s).lines[0].cls, "dim");
  assert.equal(execute("complete 9", s).lines[0].cls, "err");
  assert.equal(execute("nope", s).lines[0].cls, "err");
});
