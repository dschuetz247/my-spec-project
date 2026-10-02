import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

import * as cliCore from "../src/core.js";
import * as cliStore from "../src/store.js";

const appSource = fs.readFileSync(new URL("../web/app.js", import.meta.url), "utf8");

// Load web/app.js the way a browser would; `globals` stands in for window features such as localStorage
function loadApp(globals = {}) {
  const context = vm.createContext(globals);
  vm.runInContext(appSource, context, { filename: "web/app.js" });
  return context.TinyTasks;
}

// Values created inside the vm context have a different prototype, so copy them into this realm
const plain = (value) => JSON.parse(JSON.stringify(value));

const app = loadApp();
const { store, execute, importText, VOLATILE_WARNING } = app;

const run = (line, storage) => plain(execute(line, storage));
const say = (line, storage) => run(line, storage).lines.map((l) => l.text);

function fakeLocalStorage({ writesOk = Infinity } = {}) {
  const map = new Map();
  let writes = 0;
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (writes++ >= writesOk) throw new Error("QuotaExceededError"); map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function seeded(...descriptions) {
  const s = store.createMemoryStorage();
  for (const d of descriptions) say(`add ${d}`, s);
  return s;
}

test("export hands the console a download in the same format the command-line version writes", () => {
  const s = seeded("buy milk", "walk the dog");
  say("complete 1", s);
  const r = run("export", s);
  assert.match(r.download.filename, /^tinytasks-\d{4}-\d{2}-\d{2}\.json$/);
  assert.deepEqual(r.lines.map((l) => l.text), [`Exported 2 tasks to ${r.download.filename}`]);
  assert.equal(r.download.text, JSON.stringify({ next_id: 3, tasks: [
    { id: 1, description: "buy milk", done: true }, { id: 2, description: "walk the dog", done: false }] }, null, 2) + "\n");
  assert.doesNotThrow(() => cliCore.validateState(JSON.parse(r.download.text)));
});

test("export works on an empty list and says 0 tasks", () => {
  const r = run("export", store.createMemoryStorage());
  assert.match(r.lines[0].text, /^Exported 0 tasks to tinytasks-/);
  assert.deepEqual(JSON.parse(r.download.text), { next_id: 1, tasks: [] });
});

test("export refuses unreadable data, gives no download, and rejects extra arguments", () => {
  const s = store.createMemoryStorage();
  s.set(store.DATA_KEY, "{broken");
  const r = run("export", s);
  assert.match(r.lines[0].text, /^error: cannot read stored tasks/);
  assert.equal(r.download, undefined);
  const extra = run("export now", store.createMemoryStorage());
  assert.deepEqual(extra.lines.map((l) => l.text), ["error: unexpected argument 'now'", "usage: export"]);
  assert.equal(extra.download, undefined);
});

test("a backup made by the web app can be read by the command-line store, and the other way round", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-backup-"));
  try {
    // web -> CLI
    const web = seeded("from the browser", "second");
    say("complete 2", web);
    const file = path.join(dir, "tasks.json");
    fs.writeFileSync(file, run("export", web).download.text);
    const cliState = cliStore.loadState(file);
    assert.deepEqual(plain(cliState), { next_id: 3, tasks: [
      { id: 1, description: "from the browser", done: false }, { id: 2, description: "second", done: true }] });

    // CLI -> web
    let state = cliCore.emptyState();
    state = cliCore.addTask(state, "from the terminal").state;
    state = cliCore.addTask(state, "also terminal").state;
    state = cliCore.completeTask(state, 1).state;
    cliStore.saveState(state, file);
    const fresh = store.createMemoryStorage();
    const result = plain(importText(fs.readFileSync(file, "utf8"), "tasks.json", fresh, false));
    assert.deepEqual(result.lines.map((l) => l.text), ["Imported 2 tasks from tasks.json"]);
    assert.deepEqual(say("list", fresh), ["  ID  DONE  TASK", "  1   [x]   from the terminal", "  2   [ ]   also terminal"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("import asks the console to open the file chooser, but only when it is safe", () => {
  const empty = store.createMemoryStorage();
  assert.deepEqual(run("import", empty).pickFile, { replace: false });
  assert.deepEqual(run("import --replace", empty).pickFile, { replace: true });

  const busy = seeded("a", "b");
  const before = busy.get(store.DATA_KEY);
  const refused = run("import", busy);
  assert.equal(refused.pickFile, undefined);
  assert.deepEqual(refused.lines.map((l) => l.text), [
    "error: you have 2 tasks and import replaces them. 'export' first, then run: import --replace",
    "usage: import [--replace]"]);
  assert.equal(busy.get(store.DATA_KEY), before);
  assert.deepEqual(run("import --replace", busy).pickFile, { replace: true });

  const one = seeded("only");
  assert.match(say("import", one)[0], /^error: you have 1 task and import replaces them/);
});

test("import: unreadable stored data needs --replace, and --replace is the way out", () => {
  const s = store.createMemoryStorage();
  s.set(store.DATA_KEY, "{broken");
  const refused = run("import", s);
  assert.equal(refused.pickFile, undefined);
  assert.match(refused.lines[0].text, /^error: stored tasks are unreadable; 'import --replace' overwrites them/);
  assert.deepEqual(run("import --replace", s).pickFile, { replace: true });
  assert.equal(s.get(store.DATA_KEY), "{broken", "choosing to import does not touch anything yet");

  const backup = JSON.stringify({ next_id: 2, tasks: [{ id: 1, description: "rescued", done: false }] });
  const done = plain(importText(backup, "backup.json", s, true));
  assert.deepEqual(done.lines.map((l) => l.text), ["Imported 1 task from backup.json"]);
  assert.deepEqual(say("list", s), ["  ID  DONE  TASK", "  1   [ ]   rescued"]);
});

test("import rejects unknown options", () => {
  assert.deepEqual(say("import --merge", store.createMemoryStorage()),
    ["error: unexpected argument '--merge'", "usage: import [--replace]"]);
  assert.equal(run("import --replace now", store.createMemoryStorage()).pickFile, undefined);
});

test("importText: an invalid file changes nothing, byte for byte", () => {
  const s = seeded("keep me");
  const before = s.get(store.DATA_KEY);
  const bad = [
    ["not json", "{nope"],
    ["empty file", ""],
    ["wrong shape", '{"tasks": []}'],
    ["array", "[]"],
    ["duplicate ids", '{"next_id":3,"tasks":[{"id":1,"description":"a","done":false},{"id":1,"description":"b","done":false}]}'],
    ["id not below next_id", '{"next_id":1,"tasks":[{"id":1,"description":"a","done":false}]}'],
    ["done not boolean", '{"next_id":2,"tasks":[{"id":1,"description":"a","done":"yes"}]}'],
  ];
  for (const [name, text] of bad) {
    const out = plain(importText(text, "bad.json", s, true));
    assert.match(out.lines[0].text, /^error: cannot import bad\.json: /, name);
    assert.equal(out.lines[0].cls, "err", name);
    assert.equal(s.get(store.DATA_KEY), before, `${name} changed storage`);
  }
  assert.match(plain(importText("{nope", "bad.json", s, true)).lines[0].text, /not valid JSON$/);
  assert.match(plain(importText('{"tasks": []}', "bad.json", s, true)).lines[0].text, /invalid task state: next_id/);
});

test("importText: a file over the size limit is refused before parsing", () => {
  const s = seeded("keep me");
  const before = s.get(store.DATA_KEY);
  const huge = '{"next_id":1,"tasks":[],"pad":"' + "x".repeat(2000001) + '"}';
  const out = plain(importText(huge, "huge.json", s, true));
  assert.equal(out.lines[0].text, "error: cannot import huge.json: file is too large for a task list");
  assert.equal(s.get(store.DATA_KEY), before);
});

test("importText: a UTF-8 BOM (added by some Windows editors) is accepted", () => {
  const s = store.createMemoryStorage();
  const text = "﻿" + JSON.stringify({ next_id: 2, tasks: [{ id: 1, description: "with bom", done: false }] });
  assert.equal(plain(importText(text, "bom.json", s, false)).lines[0].text, "Imported 1 task from bom.json");
  assert.deepEqual(say("list", s), ["  ID  DONE  TASK", "  1   [ ]   with bom"]);
});

test("importText: re-checks the list when the file is chosen, in case it changed while the dialog was open", () => {
  const s = store.createMemoryStorage();
  assert.deepEqual(run("import", s).pickFile, { replace: false }); // allowed: list was empty
  say("add added meanwhile in another tab", s);
  const before = s.get(store.DATA_KEY);
  const out = plain(importText('{"next_id":1,"tasks":[]}', "late.json", s, false));
  assert.match(out.lines[0].text, /^error: you have 1 task and import replaces them/);
  assert.equal(s.get(store.DATA_KEY), before);
});

test("import keeps the backup's id counter, so ids stay unique and are not reused", () => {
  const original = seeded("a", "b", "c");
  say("delete 3", original);
  const text = run("export", original).download.text; // next_id is 4 although the highest id is 2
  const fresh = store.createMemoryStorage();
  importText(text, "backup.json", fresh, false);
  assert.deepEqual(say("add d", fresh), ["Added task 4: d"]);
});

test("export then import is a lossless round trip, including unicode and long text", () => {
  const original = seeded("café ✓ \"q\"".replace(/"/g, "'"), "z".repeat(3000), "<b>not html</b>");
  say("complete 2", original);
  const fresh = store.createMemoryStorage();
  importText(run("export", original).download.text, "x.json", fresh, false);
  assert.equal(fresh.get(store.DATA_KEY), original.get(store.DATA_KEY));
});

test("help lists export and import", () => {
  const text = say("help", store.createMemoryStorage()).join("\n");
  assert.ok(text.includes("export"));
  assert.ok(text.includes("import [--replace]"));
});

/* ---------- the storage warning ---------- */

test("browser storage that works: persistent, tasks land under the 'tinytasks' key, no warning", () => {
  const ls = fakeLocalStorage();
  const web = loadApp({ localStorage: ls });
  const s = web.store.createBrowserStorage();
  assert.equal(s.persistent(), true);
  const out = plain(web.execute("add buy milk", s));
  assert.deepEqual(out.lines.map((l) => l.text), ["Added task 1: buy milk"]);
  assert.deepEqual(JSON.parse(ls.map.get("tinytasks")), { next_id: 2, tasks: [{ id: 1, description: "buy milk", done: false }] });
  assert.equal(ls.map.has("tinytasks.probe"), false, "the probe key is cleaned up");
});

test("blocked browser storage (access throws): warns after every change, keeps working in memory", () => {
  const context = {};
  Object.defineProperty(context, "localStorage", { get() { throw new Error("SecurityError"); } });
  const web = loadApp(context);
  const s = web.store.createBrowserStorage();
  assert.equal(s.persistent(), false);

  const added = plain(web.execute("add buy milk", s)).lines;
  assert.deepEqual(added.map((l) => l.text), ["Added task 1: buy milk", VOLATILE_WARNING]);
  assert.equal(added[1].cls, "err");
  assert.match(VOLATILE_WARNING, /memory only/);
  assert.match(VOLATILE_WARNING, /export/);
  assert.equal(plain(web.execute("complete 1", s)).lines.at(-1).text, VOLATILE_WARNING);
  assert.equal(plain(web.execute("delete 1", s)).lines.at(-1).text, VOLATILE_WARNING);
  assert.equal(plain(web.execute("add x", s)).lines[0].text, "Added task 2: x"); // still works, ids keep counting
});

test("the warning is not repeated for commands that save nothing", () => {
  const s = store.createMemoryStorage({ persistent: false });
  say("add a", s);
  for (const line of ["list", "help", "export", "complete 99", "add", "nonsense"]) {
    assert.ok(!say(line, s).includes(VOLATILE_WARNING), `${line} should not warn`);
  }
  say("complete 1", s);
  assert.ok(!say("complete 1", s).includes(VOLATILE_WARNING), "already-done complete writes nothing, so no warning");
});

test("a write that fails later (quota) switches to memory, warns, and the newest data stays visible", () => {
  const ls = fakeLocalStorage({ writesOk: 2 }); // the probe write and the first add succeed; the second add's write fails
  const web = loadApp({ localStorage: ls });
  const s = web.store.createBrowserStorage();
  assert.equal(s.persistent(), true);
  assert.deepEqual(plain(web.execute("add first", s)).lines.map((l) => l.text), ["Added task 1: first"]);
  assert.equal(s.persistent(), true);
  const failing = plain(web.execute("add second", s)).lines.map((l) => l.text);
  assert.deepEqual(failing, ["Added task 2: second", VOLATILE_WARNING]);
  assert.equal(s.persistent(), false);
  const listed = plain(web.execute("list", s)).lines.map((l) => l.text);
  assert.deepEqual(listed, ["  ID  DONE  TASK", "  1   [ ]   first", "  2   [ ]   second"]);
});

test("importing while storage is unavailable also warns", () => {
  const s = store.createMemoryStorage({ persistent: false });
  const out = plain(importText('{"next_id":2,"tasks":[{"id":1,"description":"x","done":false}]}', "b.json", s, false));
  assert.deepEqual(out.lines.map((l) => l.text), ["Imported 1 task from b.json", VOLATILE_WARNING]);
});
