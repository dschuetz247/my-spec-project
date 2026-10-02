---
work_package_id: WP01
title: Task List Rules
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-007
- FR-008
planning_base_branch: my-first-mission
merge_target_branch: my-first-mission
branch_strategy: Planning artifacts for this mission were generated on my-first-mission. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into my-first-mission unless the human explicitly redirects the landing branch.
subtasks:
- T001
- T002
- T003
- T004
- T005
phase: Phase 1 - Foundation
history:
- timestamp: '2026-10-02T19:31:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
agent_profile: node-norris
authoritative_surface: src/core.js
create_intent:
- package.json
- src/core.js
- tests/core.test.js
execution_mode: code_change
owned_files:
- package.json
- src/core.js
- tests/core.test.js
role: implementer
tags: []
tracker_refs: []
---

# Work Package Prompt: WP01 – Task List Rules

## ⚡ Do This First: Load Agent Profile

Before reading anything else, load the agent profile named in this file's frontmatter (`agent_profile: node-norris`) with `/ad-hoc-profile-load node-norris`. Follow its identity and boundaries for the rest of this work package.

## Objective

Create the project scaffold and the pure rules of the task list: how a task is added, completed and deleted, with no file or console access. Later packages build persistence (WP02) and the command line (WP03) on top of the API defined here, so the function names and shapes below are a contract.

## Branch Strategy

- Planning/base branch: `my-first-mission`
- Final merge target: `my-first-mission`
- Execution worktrees are allocated per computed lane from `lanes.json` after `finalize-tasks`; enter the workspace that `spec-kitty agent action implement WP01 --agent <name>` reports. This package has no dependencies.

## Context

- Spec: [spec.md](../spec.md), especially FR-001 to FR-005, FR-007, FR-008, NFR-002 and the Edge Cases section.
- Plan: [plan.md](../plan.md) (concern IC-01) and [data-model.md](../data-model.md) for the state shape, invariants and transitions.
- Runtime: Node.js 20+, ES modules, built-in modules only. Node v24 is installed. **Do not add any dependency.**

State shape (from the data model):

```js
{ next_id: 3, tasks: [{ id: 2, description: "buy milk", done: true }] }
```

Design rules to honour:
- `next_id` only increases, so a deleted task's id is never reused (FR-003).
- Functions never mutate their input and never partially apply: if they throw, the caller's state is untouched (NFR-002).
- Validate before building the new state.

## Subtasks

### T001 – Create `package.json`

**Purpose**: Make the project a zero-dependency ES-module Node project with a test script and a command name.

**Steps**:
1. Create `package.json` at the repository root:
   ```json
   {
     "name": "tinytasks",
     "version": "0.1.0",
     "description": "A tiny command-line task list",
     "type": "module",
     "bin": { "tinytasks": "src/index.js" },
     "scripts": { "test": "node --test" },
     "engines": { "node": ">=20" },
     "license": "UNLICENSED",
     "private": true
   }
   ```
2. Do not add `dependencies` or `devDependencies` keys, and no lifecycle scripts (`preinstall`, `install`, `postinstall`).
3. `src/index.js` does not exist yet; WP03 creates it. That is fine.

**Files**: `package.json` (new).

**Validation**:
- [ ] `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` succeeds.
- [ ] No dependency keys present.

### T002 – State shape, `parseId`, `addTask`

**Purpose**: The foundation: create an empty list, parse identifiers, and add tasks with a never-reused id.

**Steps**: in `src/core.js` export:

```js
export class TaskError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TaskError";
    this.code = code; // "EMPTY_DESCRIPTION" | "INVALID_ID" | "NOT_FOUND" | "INVALID_STATE"
  }
}

export function emptyState() {
  return { next_id: 1, tasks: [] };
}

// Accepts "1", " 12 ". Rejects "abc", "0", "-1", "1.5", "1e3", "", "0x10", unsafe-large numbers.
export function parseId(value) {
  const text = String(value).trim();
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new TaskError("INVALID_ID", `invalid task id '${value}'`);
  }
  return Number(text);
}

// Returns { state, task }; throws TaskError("EMPTY_DESCRIPTION") for blank input.
export function addTask(state, description) {
  const text = String(description ?? "").trim();
  if (text === "") throw new TaskError("EMPTY_DESCRIPTION", "description cannot be empty");
  const task = { id: state.next_id, description: text, done: false };
  return {
    state: { next_id: state.next_id + 1, tasks: [...state.tasks, task] },
    task,
  };
}
```

**Notes**:
- Surrounding whitespace is trimmed; everything else is stored exactly as entered (long text, quotes, unicode, emoji all survive).
- The error `message` values are used verbatim by the CLI as `Error: <message>`, so keep the wording exactly as shown (see [contracts/cli-contract.md](../contracts/cli-contract.md)).

**Files**: `src/core.js` (new).

**Validation**:
- [ ] `addTask(emptyState(), "buy milk")` gives id 1 and `next_id` 2.
- [ ] Whitespace-only and empty descriptions throw `EMPTY_DESCRIPTION`.
- [ ] The input state object is unchanged after any call.

### T003 – `completeTask` and `deleteTask`

**Purpose**: The remaining two actions with unknown-id handling and idempotent completion.

**Steps**: export:

```js
// Returns { state, task, alreadyDone }. Unknown id -> TaskError("NOT_FOUND", `no task with id ${id}`).
// If the task is already done, return the SAME state object and alreadyDone: true (callers skip saving).
export function completeTask(state, id) { /* ... */ }

// Returns { state, task } where task is the removed task. next_id is unchanged.
export function deleteTask(state, id) { /* ... */ }
```

- `id` is a number (already parsed by `parseId`).
- Do not renumber remaining tasks and do not lower `next_id`.
- Keep task order by id ascending (new tasks are appended, so it stays ordered).

**Files**: `src/core.js`.

**Validation**:
- [ ] Complete marks only the targeted task done.
- [ ] Completing a done task returns `alreadyDone: true` and the identical state reference.
- [ ] Delete of the highest id followed by add yields a **new, larger** id (FR-003).
- [ ] Unknown id throws `NOT_FOUND` for both actions.

### T004 – `validateState`

**Purpose**: Let WP02 reject malformed stored data without guessing at its shape.

**Steps**: export `validateState(value)` that returns `value` if valid and otherwise throws `TaskError("INVALID_STATE", "...")`. A valid state:
- is a non-null object with an integer `next_id >= 1` and an array `tasks`;
- every task has an integer `id >= 1`, a non-empty string `description`, and a boolean `done`;
- ids are unique, and every id is `< next_id`.

**Files**: `src/core.js`.

**Validation**:
- [ ] Accepts `emptyState()` and the example from the data model.
- [ ] Rejects: `null`, arrays, missing `next_id`, string ids, duplicate ids, `next_id` not greater than the largest id, non-boolean `done`, empty description.

### T005 – Core unit tests

**Purpose**: Pin every rule so the later packages can rely on them.

**Steps**: create `tests/core.test.js` using `node:test` and `node:assert/strict`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, addTask, completeTask, deleteTask, parseId, validateState, TaskError } from "../src/core.js";
```

Cover at least:
1. Add to empty list: id 1, `done: false`, `next_id` 2.
2. Two adds give distinct, increasing ids.
3. Delete the newest, add again: id is **not** reused.
4. Empty and whitespace-only descriptions throw `EMPTY_DESCRIPTION` and leave the original state deep-equal to a snapshot taken before the call.
5. Special characters and a 5,000-character description are stored as entered (after trimming).
6. Complete sets `done`; completing again reports `alreadyDone` and returns the same state object.
7. Complete and delete of an unknown id throw `NOT_FOUND` with message `no task with id 99`.
8. `parseId` accepts `"1"` and `" 7 "`; rejects `"abc"`, `"0"`, `"-3"`, `"1.5"`, `"1e3"`, `""`, `"99999999999999999999"`, each with code `INVALID_ID` and message `invalid task id '<value>'`.
9. `validateState` accept/reject cases from T004.

Use `assert.throws(fn, (e) => e instanceof TaskError && e.code === "...")`.

**Files**: `tests/core.test.js` (new).

**Validation**:
- [ ] `node --test tests/core.test.js` passes with no skipped tests.

## Definition of Done

- [ ] All five subtasks complete; `node --test` passes.
- [ ] `src/core.js` imports nothing (pure functions, no `fs`, no `console`).
- [ ] Exported names exactly: `TaskError`, `emptyState`, `parseId`, `addTask`, `completeTask`, `deleteTask`, `validateState`.
- [ ] No input state is ever mutated; no function applies a change and then throws.
- [ ] `package.json` has no dependencies and no lifecycle scripts.
- [ ] Subtasks recorded: `spec-kitty agent tasks mark-status T001 T002 T003 T004 T005 --status done`.

## Risks

- Computing the next id from the highest existing id would reuse ids after deletes. Always use `next_id`.
- A `validateState` that is too loose lets corrupt files through; too strict breaks real files. Mirror the data model exactly.

## Reviewer Guidance

Check the "failure leaves state unchanged" property directly in the tests (deep-equal before and after). Confirm error messages match the CLI contract character for character. Confirm nothing outside the owned files was touched.

Implementation command: `spec-kitty agent action implement WP01 --agent <name>`
