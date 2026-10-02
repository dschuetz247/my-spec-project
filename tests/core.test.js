import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, addTask, completeTask, deleteTask, parseId, validateState, TaskError } from "../src/core.js";

const isErr = (code, message) => (e) =>
  e instanceof TaskError && e.code === code && (message === undefined || e.message === message);

test("add to empty list gives id 1, done false, next_id 2", () => {
  const { state, task } = addTask(emptyState(), "buy milk");
  assert.deepEqual(task, { id: 1, description: "buy milk", done: false });
  assert.equal(state.next_id, 2);
  assert.deepEqual(state.tasks, [task]);
});

test("two adds give distinct increasing ids", () => {
  const a = addTask(emptyState(), "a");
  const b = addTask(a.state, "b");
  assert.ok(b.task.id > a.task.id);
  assert.deepEqual(b.state.tasks.map((t) => t.id), [1, 2]);
});

test("add does not mutate input state", () => {
  const s = emptyState();
  const snap = structuredClone(s);
  addTask(s, "x");
  assert.deepEqual(s, snap);
});

test("deleting the newest then adding does not reuse the id", () => {
  const a = addTask(emptyState(), "a");
  const b = addTask(a.state, "b");
  const d = deleteTask(b.state, 2);
  assert.equal(d.state.next_id, 3);
  const c = addTask(d.state, "c");
  assert.equal(c.task.id, 3);
});

test("empty and whitespace-only descriptions throw and leave state unchanged", () => {
  const s = addTask(emptyState(), "keep").state;
  const snap = structuredClone(s);
  for (const bad of ["", "   ", "\t\n", undefined, null]) {
    assert.throws(() => addTask(s, bad), isErr("EMPTY_DESCRIPTION", "description cannot be empty"));
    assert.deepEqual(s, snap);
  }
});

test("special characters and 5000-char description are stored as entered after trimming", () => {
  const special = `He said "hi" & <b>'q'</b> \\ café 日本語 \u{1F600}`;
  assert.equal(addTask(emptyState(), `  ${special}  `).task.description, special);
  const long = "x".repeat(5000);
  assert.equal(addTask(emptyState(), long).task.description, long);
});

test("complete sets done on only the targeted task", () => {
  let s = addTask(emptyState(), "a").state;
  s = addTask(s, "b").state;
  const snap = structuredClone(s);
  const r = completeTask(s, 2);
  assert.equal(r.alreadyDone, false);
  assert.deepEqual(r.state.tasks.map((t) => t.done), [false, true]);
  assert.equal(r.task.id, 2);
  assert.equal(r.state.next_id, s.next_id);
  assert.deepEqual(s, snap);
});

test("completing a done task reports alreadyDone and returns the same state object", () => {
  const s1 = addTask(emptyState(), "a").state;
  const { state: s2 } = completeTask(s1, 1);
  const again = completeTask(s2, 1);
  assert.equal(again.alreadyDone, true);
  assert.equal(again.state, s2);
});

test("delete removes the task, keeps others and next_id, and does not mutate input", () => {
  let s = addTask(emptyState(), "a").state;
  s = addTask(s, "b").state;
  const snap = structuredClone(s);
  const r = deleteTask(s, 1);
  assert.deepEqual(r.task, { id: 1, description: "a", done: false });
  assert.deepEqual(r.state.tasks.map((t) => t.id), [2]);
  assert.equal(r.state.next_id, 3);
  assert.deepEqual(s, snap);
});

test("complete and delete of unknown id throw NOT_FOUND and leave state unchanged", () => {
  const s = addTask(emptyState(), "a").state;
  const snap = structuredClone(s);
  assert.throws(() => completeTask(s, 99), isErr("NOT_FOUND", "no task with id 99"));
  assert.throws(() => deleteTask(s, 99), isErr("NOT_FOUND", "no task with id 99"));
  assert.deepEqual(s, snap);
});

test("parseId accepts valid ids", () => {
  assert.equal(parseId("1"), 1);
  assert.equal(parseId(" 7 "), 7);
});

test("parseId rejects invalid ids with INVALID_ID", () => {
  for (const bad of ["abc", "0", "-3", "1.5", "1e3", "", "0x10", "99999999999999999999"]) {
    assert.throws(() => parseId(bad), isErr("INVALID_ID", `invalid task id '${bad}'`));
  }
});

test("validateState accepts valid states", () => {
  const ex = { next_id: 3, tasks: [{ id: 2, description: "buy milk", done: true }] };
  assert.equal(validateState(ex), ex);
  const e = emptyState();
  assert.equal(validateState(e), e);
});

test("validateState rejects malformed states", () => {
  const t = (over = {}) => ({ id: 1, description: "a", done: false, ...over });
  const bad = [
    null,
    [],
    "str",
    { tasks: [] },
    { next_id: 0, tasks: [] },
    { next_id: 1.5, tasks: [] },
    { next_id: 2 },
    { next_id: 2, tasks: {} },
    { next_id: 3, tasks: [t({ id: "1" })] },
    { next_id: 3, tasks: [t({ id: 0 })] },
    { next_id: 3, tasks: [t(), t()] },
    { next_id: 1, tasks: [t()] },
    { next_id: 2, tasks: [t({ id: 5 })] },
    { next_id: 2, tasks: [t({ done: "no" })] },
    { next_id: 2, tasks: [t({ description: "" })] },
    { next_id: 2, tasks: [t({ description: 5 })] },
    { next_id: 2, tasks: [null] },
  ];
  for (const b of bad) {
    assert.throws(() => validateState(b), isErr("INVALID_STATE"), JSON.stringify(b));
  }
});
