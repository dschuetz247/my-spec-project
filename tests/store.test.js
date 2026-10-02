import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyState, addTask, deleteTask } from "../src/core.js";
import { StoreError, defaultPath, loadState, saveState } from "../src/store.js";

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinytasks-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const storeErr = (file) => (e) =>
  e instanceof StoreError && e.message === `cannot read task file ${file}`;

function sample() {
  let s = emptyState();
  s = addTask(s, "one").state;
  s = addTask(s, "two").state;
  s = addTask(s, "three").state;
  s = { ...s, tasks: s.tasks.map((t) => (t.id === 2 ? { ...t, done: true } : t)) };
  return s;
}

test("missing file loads as empty state and is not created", (t) => {
  const file = path.join(tmpDir(t), "tasks.json");
  assert.deepEqual(loadState(file), emptyState());
  assert.equal(fs.existsSync(file), false);
});

test("round trip of several tasks, some done", (t) => {
  const file = path.join(tmpDir(t), "tasks.json");
  const s = sample();
  saveState(s, file);
  assert.deepEqual(loadState(file), s);
});

test("id counter survives delete + save + load", (t) => {
  const file = path.join(tmpDir(t), "tasks.json");
  let s = addTask(addTask(emptyState(), "a").state, "b").state;
  s = deleteTask(s, 2).state;
  saveState(s, file);
  const { task } = addTask(loadState(file), "c");
  assert.equal(task.id, 3);
});

test("overwriting an existing file works repeatedly (real platform rename)", (t) => {
  const file = path.join(tmpDir(t), "tasks.json");
  const a = addTask(emptyState(), "first").state;
  const b = addTask(a, "second").state;
  const c = addTask(b, "third").state;
  saveState(a, file);
  saveState(b, file);
  assert.deepEqual(loadState(file), b);
  saveState(c, file);
  assert.deepEqual(loadState(file), c);
});

for (const [name, content] of [
  ["malformed JSON", "{not json"],
  ["wrong shape", '{"tasks": []}'],
  ["zero-byte file", ""],
]) {
  test(`${name} throws StoreError and the file is left untouched`, (t) => {
    const file = path.join(tmpDir(t), "tasks.json");
    fs.writeFileSync(file, content);
    const before = fs.readFileSync(file);
    assert.throws(() => loadState(file), storeErr(file));
    assert.ok(fs.readFileSync(file).equals(before));
  });
}

test("a directory at the path throws StoreError", (t) => {
  const file = path.join(tmpDir(t), "tasks.json");
  fs.mkdirSync(file);
  assert.throws(() => loadState(file), storeErr(file));
});

test("no *.tmp left after successful saves", (t) => {
  const dir = tmpDir(t);
  const file = path.join(dir, "tasks.json");
  saveState(sample(), file);
  saveState(emptyState(), file);
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith(".tmp")), []);
  assert.deepEqual(fs.readdirSync(dir), ["tasks.json"]);
});

test("no *.tmp left after a forced write failure, existing file intact", (t) => {
  const dir = tmpDir(t);
  const file = path.join(dir, "tasks.json");
  const original = sample();
  saveState(original, file);
  const realRename = fs.renameSync;
  fs.renameSync = () => {
    throw Object.assign(new Error("forced"), { code: "EIO" });
  };
  try {
    assert.throws(() => saveState(emptyState(), file), /forced/);
  } finally {
    fs.renameSync = realRename;
  }
  assert.deepEqual(fs.readdirSync(dir), ["tasks.json"]);
  assert.deepEqual(loadState(file), original);
});

test("no *.tmp left when the target is a directory (real rename failure)", (t) => {
  const dir = tmpDir(t);
  const file = path.join(dir, "tasks.json");
  fs.mkdirSync(file);
  assert.throws(() => saveState(emptyState(), file));
  assert.deepEqual(fs.readdirSync(dir), ["tasks.json"]);
});

test("saveState rejects an invalid state without writing", (t) => {
  const dir = tmpDir(t);
  const file = path.join(dir, "tasks.json");
  assert.throws(() => saveState({ tasks: [] }, file));
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("defaultPath uses TINYTASKS_FILE, else ~/.tinytasks/tasks.json", (t) => {
  const saved = process.env.TINYTASKS_FILE;
  t.after(() => {
    if (saved === undefined) delete process.env.TINYTASKS_FILE;
    else process.env.TINYTASKS_FILE = saved;
  });
  process.env.TINYTASKS_FILE = path.join(os.tmpdir(), "custom-tasks.json");
  assert.equal(defaultPath(), process.env.TINYTASKS_FILE);
  delete process.env.TINYTASKS_FILE;
  assert.equal(defaultPath(), path.join(os.homedir(), ".tinytasks", "tasks.json"));
});

test("save creates a missing nested parent directory", (t) => {
  const file = path.join(tmpDir(t), "a", "b", "tasks.json");
  const s = sample();
  saveState(s, file);
  assert.deepEqual(loadState(file), s);
});
