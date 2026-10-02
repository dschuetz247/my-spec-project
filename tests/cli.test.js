import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { run } from "../src/cli.js";

function tt(file, ...args) {
  const r = spawnSync(process.execPath, ["src/index.js", ...args], {
    env: { ...process.env, TINYTASKS_FILE: file },
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinytasks-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, file: path.join(dir, "tasks.json") };
}

const bytes = (file) => fs.readFileSync(file);

function capture() {
  const buf = { out: "", err: "" };
  return {
    buf,
    stdout: { write: (s) => void (buf.out += s) },
    stderr: { write: (s) => void (buf.err += s) },
  };
}

test("story 1: add and list", (t) => {
  const { file } = tmp(t);
  let r = tt(file, "add", "buy milk");
  assert.deepEqual([r.code, r.out, r.err], [0, "Added task 1: buy milk\n", ""]);
  r = tt(file, "list");
  assert.deepEqual([r.code, r.out], [0, "1 [ ] buy milk\n"]);
  r = tt(file, "add", "walk", "dog");
  assert.equal(r.out, "Added task 2: walk dog\n");
  assert.equal(tt(file, "list").out, "1 [ ] buy milk\n2 [ ] walk dog\n");
});

test("story 1: blank description rejected, file unchanged", (t) => {
  const { file } = tmp(t);
  tt(file, "add", "keep");
  const before = bytes(file);
  for (const arg of ["", "   "]) {
    const r = tt(file, "add", arg);
    assert.deepEqual([r.code, r.out, r.err], [1, "", "Error: description cannot be empty\n"]);
    assert.deepEqual(bytes(file), before);
  }
  assert.equal(tt(file, "list").out, "1 [ ] keep\n");
});

test("blank add on a missing file creates no file", (t) => {
  const { file } = tmp(t);
  assert.equal(tt(file, "add", "").code, 1);
  assert.equal(fs.existsSync(file), false);
});

test("story 2: complete, then complete again", (t) => {
  const { file } = tmp(t);
  tt(file, "add", "buy milk");
  let r = tt(file, "complete", "1");
  assert.deepEqual([r.code, r.out], [0, "Completed task 1\n"]);
  assert.equal(tt(file, "list").out, "1 [x] buy milk\n");
  const before = bytes(file);
  r = tt(file, "complete", "1");
  assert.deepEqual([r.code, r.out, r.err], [0, "Task 1 is already done\n", ""]);
  assert.deepEqual(bytes(file), before);
});

test("already-done complete does not save (mtime and bytes unchanged)", (t) => {
  const { file } = tmp(t);
  tt(file, "add", "x");
  tt(file, "complete", "1");
  const before = bytes(file);
  const mtime = fs.statSync(file).mtimeMs;
  assert.equal(tt(file, "complete", "1").code, 0);
  assert.equal(fs.statSync(file).mtimeMs, mtime);
  assert.deepEqual(bytes(file), before);
});

test("story 3: delete, and ids are never reused", (t) => {
  const { file } = tmp(t);
  tt(file, "add", "a");
  tt(file, "add", "b");
  const r = tt(file, "delete", "2");
  assert.deepEqual([r.code, r.out], [0, "Deleted task 2\n"]);
  assert.equal(tt(file, "list").out, "1 [ ] a\n");
  assert.equal(tt(file, "add", "c").out, "Added task 3: c\n");
  assert.equal(tt(file, "delete", "1").out, "Deleted task 1\n");
  assert.equal(tt(file, "list").out, "3 [ ] c\n");
});

test("story 4: persistence across separate processes", (t) => {
  const { file } = tmp(t);
  tt(file, "add", "one");
  tt(file, "add", "two");
  tt(file, "add", "three");
  tt(file, "complete", "2");
  tt(file, "delete", "1");
  tt(file, "add", "four");
  tt(file, "complete", "3");
  assert.equal(tt(file, "list").out, "2 [x] two\n3 [x] three\n4 [ ] four\n");
});

test("empty list prints No tasks. and list creates no file", (t) => {
  const { dir, file } = tmp(t);
  const r = tt(file, "list");
  assert.deepEqual([r.code, r.out, r.err], [0, "No tasks.\n", ""]);
  assert.deepEqual(fs.readdirSync(dir), []);
  tt(file, "add", "x");
  tt(file, "delete", "1");
  assert.equal(tt(file, "list").out, "No tasks.\n");
});

test("unknown id on complete and delete: exit 1, file byte-identical", (t) => {
  const { file } = tmp(t);
  tt(file, "add", "a");
  const before = bytes(file);
  for (const action of ["complete", "delete"]) {
    const r = tt(file, action, "99");
    assert.deepEqual([r.code, r.out, r.err], [1, "", "Error: no task with id 99\n"]);
    assert.deepEqual(bytes(file), before);
  }
});

test("unknown id on a missing file creates no file", (t) => {
  const { file } = tmp(t);
  assert.equal(tt(file, "complete", "99").code, 1);
  assert.equal(tt(file, "delete", "99").code, 1);
  assert.equal(fs.existsSync(file), false);
});

test("non-numeric id: exit 1, file untouched", (t) => {
  const { file } = tmp(t);
  tt(file, "add", "a");
  const before = bytes(file);
  for (const action of ["complete", "delete"]) {
    for (const bad of ["abc", "0", "-1", "1.5", ""]) {
      const r = tt(file, action, bad);
      assert.deepEqual([r.code, r.out, r.err], [1, "", `Error: invalid task id '${bad}'\n`]);
      assert.deepEqual(bytes(file), before);
    }
  }
});

test("invalid id never touches storage, even a corrupt file", (t) => {
  const { file } = tmp(t);
  fs.writeFileSync(file, "{broken");
  for (const action of ["complete", "delete"]) {
    const r = tt(file, action, "abc");
    assert.equal(r.err, "Error: invalid task id 'abc'\n");
    assert.equal(r.code, 1);
  }
});

test("usage errors: exit 2, usage on stderr, nothing on stdout", (t) => {
  const { file } = tmp(t);
  const cases = [[], ["frobnicate"], ["complete"], ["delete"], ["complete", "1", "2"], ["delete", "1", "2"], ["list", "extra"], ["add"], ["add", "--"]];
  for (const args of cases) {
    const r = tt(file, ...args);
    assert.equal(r.code, 2, JSON.stringify(args));
    assert.equal(r.out, "");
    assert.match(r.err, /^Usage: tinytasks/);
  }
  assert.equal(fs.existsSync(file), false);
});

test("descriptions round-trip: quotes, unicode, 2000 chars, leading dash", (t) => {
  const { file } = tmp(t);
  const long = "x".repeat(2000);
  const items = [`say "hi" and 'bye'`, "café ✓", long, "a & b | c > d"];
  for (const d of items) assert.equal(tt(file, "add", d).code, 0);
  const lines = tt(file, "list").out.trimEnd().split("\n");
  items.forEach((d, i) => assert.equal(lines[i], `${i + 1} [ ] ${d}`));
  const r = tt(file, "add", "--", "-urgent", "call");
  assert.equal(r.out, "Added task 5: -urgent call\n");
});

test("help goes to stdout with exit 0", (t) => {
  const { file } = tmp(t);
  for (const args of [["--help"], ["-h"], ["help"], ["add", "--help"], ["list", "-h"], ["complete", "--help"], ["delete", "--help"]]) {
    const r = tt(file, ...args);
    assert.equal(r.code, 0, JSON.stringify(args));
    assert.equal(r.err, "");
    assert.match(r.out, /Usage: tinytasks/);
  }
  const top = tt(file, "--help").out;
  for (const word of ["add", "list", "complete", "delete"]) assert.ok(top.includes(word));
  assert.match(tt(file, "add", "--help").out, /tinytasks add/);
  assert.equal(fs.existsSync(file), false);
});

test("corrupt file: every action exits 1 and the file is never overwritten", (t) => {
  const { file } = tmp(t);
  fs.writeFileSync(file, "{broken");
  const before = bytes(file);
  for (const args of [["list"], ["add", "x"], ["complete", "1"], ["delete", "1"]]) {
    const r = tt(file, ...args);
    assert.equal(r.code, 1, JSON.stringify(args));
    assert.equal(r.out, "");
    assert.equal(r.err, `Error: cannot read task file ${file}\n`);
    assert.deepEqual(bytes(file), before);
  }
  assert.equal(tt(file, "--help").code, 0);
});

test("structurally invalid file is treated as unreadable", (t) => {
  const { file } = tmp(t);
  fs.writeFileSync(file, '{"next_id":1,"tasks":[{"id":5}]}');
  const before = bytes(file);
  const r = tt(file, "add", "x");
  assert.equal(r.code, 1);
  assert.match(r.err, /^Error: cannot read task file /);
  assert.deepEqual(bytes(file), before);
});

test("run() works in-process and returns codes without exiting", (t) => {
  const { file } = tmp(t);
  const c = capture();
  assert.equal(run([], c), 2);
  assert.match(c.buf.err, /Usage/);
  const d = capture();
  assert.equal(run(["--help"], d), 0);
  assert.match(d.buf.out, /Usage/);
  const e = capture();
  assert.equal(run(["add", "hello"], { ...e, file }), 0);
  assert.equal(e.buf.out, "Added task 1: hello\n");
  assert.equal(run(["frobnicate"], capture()), 2);
});

test("performance: each action under 1000 ms with 1000 tasks", (t) => {
  const { file } = tmp(t);
  const tasks = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, description: `task number ${i + 1}`, done: false }));
  fs.writeFileSync(file, JSON.stringify({ next_id: 1001, tasks }, null, 2) + "\n");
  const timings = {};
  const steps = [["list", ["list"]], ["add", ["add", "one more"]], ["complete", ["complete", "500"]], ["delete", ["delete", "500"]]];
  for (const [name, args] of steps) {
    const start = performance.now();
    const r = tt(file, ...args);
    timings[name] = Math.round(performance.now() - start);
    assert.equal(r.code, 0, `${name}: ${r.err}`);
    assert.ok(timings[name] < 1000, `${name} took ${timings[name]} ms`);
  }
  console.log(`# perf (ms): ${JSON.stringify(timings)}`);
});
