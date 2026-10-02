---
work_package_id: WP02
title: Persistence
dependencies:
- WP01
requirement_refs:
- FR-009
planning_base_branch: my-first-mission
merge_target_branch: my-first-mission
branch_strategy: Planning artifacts for this mission were generated on my-first-mission. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into my-first-mission unless the human explicitly redirects the landing branch.
subtasks:
- T006
- T007
- T008
phase: Phase 2 - Persistence
history:
- timestamp: '2026-10-02T19:31:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
agent_profile: node-norris
authoritative_surface: src/store.js
create_intent:
- src/store.js
- tests/store.test.js
execution_mode: code_change
owned_files:
- src/store.js
- tests/store.test.js
role: implementer
tags: []
tracker_refs: []
---

# Work Package Prompt: WP02 – Persistence

## ⚡ Do This First: Load Agent Profile

Before reading anything else, load the agent profile named in this file's frontmatter (`agent_profile: node-norris`) with `/ad-hoc-profile-load node-norris`. Follow its identity and boundaries for the rest of this work package.

## Objective

Save and load the task list between runs so a task added today is still there tomorrow (FR-009), without ever leaving a half-written file (NFR-002) and without ever overwriting a file that could not be read.

## Branch Strategy

- Planning/base branch: `my-first-mission`
- Final merge target: `my-first-mission`
- Execution worktrees are allocated per computed lane from `lanes.json` after `finalize-tasks`. This package depends on WP01, so implement it with `spec-kitty agent action implement WP02 --agent <name>` and make sure the workspace contains WP01's merged or based work (`src/core.js`).

## Context

- Spec: [spec.md](../spec.md) FR-009, NFR-002, C-003 (local only).
- Plan: [plan.md](../plan.md) concern IC-02; [research.md](../research.md) (storage format, atomic writes, location); [data-model.md](../data-model.md) (stored file shape).
- WP01 provides, from `src/core.js`: `emptyState()`, `validateState(value)` (returns the value or throws `TaskError("INVALID_STATE")`).
- Built-in modules only: `node:fs`, `node:os`, `node:path`.

## Subtasks

### T006 – `defaultPath` and `loadState`

**Purpose**: Find the storage file and read it, with three distinct outcomes.

**Steps**: in `src/store.js` export:

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyState, validateState } from "./core.js";

export class StoreError extends Error {
  constructor(file, cause) {
    super(`cannot read task file ${file}`);
    this.name = "StoreError";
    this.file = file;
    this.cause = cause;
  }
}

export function defaultPath() {
  return process.env.TINYTASKS_FILE || path.join(os.homedir(), ".tinytasks", "tasks.json");
}

export function loadState(file = defaultPath()) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return emptyState();   // first run: empty list
    throw new StoreError(file, err);                    // permissions, is-a-directory, ...
  }
  try {
    return validateState(JSON.parse(text));
  } catch (err) {
    throw new StoreError(file, err);                    // malformed JSON or invalid shape
  }
}
```

**Notes**:
- Missing file means an empty list; it must not be created by a read.
- An **empty (zero-byte) file** is malformed JSON, so it is a `StoreError`, not an empty list. (Writes are atomic, so the tool never produces one.)
- Read `process.env.TINYTASKS_FILE` at call time, not at import time, so tests can change it.
- The `StoreError` message is printed by the CLI as `Error: cannot read task file <path>`; keep it exactly.

**Files**: `src/store.js` (new).

**Validation**:
- [ ] Missing file returns `emptyState()` and does not create the file.
- [ ] Valid file returns the stored state.
- [ ] Invalid JSON, wrong shape, and a directory at the path each throw `StoreError`.

### T007 – `saveState` with atomic write

**Purpose**: Persist the state so a crash or error mid-write cannot corrupt the existing file.

**Steps**: export:

```js
export function saveState(state, file = defaultPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw err;
  }
}
```

**Notes**:
- The temporary file is in the same directory as the target so the rename stays on one filesystem.
- `fs.renameSync` replaces an existing file on both Windows and POSIX in current Node versions; the T008 test must exercise overwriting an existing file on the real platform.
- `saveState` should call `validateState(state)` first so a bug upstream can never write a file that `loadState` would later reject. (It throws `TaskError`, which is fine: it is a programming error, not a user error.)
- Never write if the earlier load failed: that is the CLI's job (WP03) by not reaching `saveState`, but state it in the JSDoc.

**Files**: `src/store.js`.

**Validation**:
- [ ] Round trip: save then load returns a deep-equal state.
- [ ] Parent directory is created when missing.
- [ ] No `.tmp` file remains after success or after a forced failure.

### T008 – Store unit tests

**Purpose**: Prove persistence behaviour independent of the CLI.

**Steps**: create `tests/store.test.js` with `node:test`. Use `fs.mkdtempSync(path.join(os.tmpdir(), "tinytasks-"))` per test and remove it afterwards (`t.after`).

Cover at least:
1. Missing file loads as `emptyState()` and is not created.
2. Round trip of a state with several tasks, some done.
3. **Id counter survives**: state with tasks `[1,2]`, delete 2 (via `deleteTask`), save, load, `addTask` gives id 3 (not 2). This protects FR-003 across runs.
4. Overwriting an existing file works (save twice with different content, load returns the second).
5. Corrupt content (`"{not json"`), valid JSON of wrong shape (`{"tasks": []}`), and a zero-byte file each throw `StoreError` whose message is `cannot read task file <path>`.
6. **Corrupt file is left untouched**: after the failed load, the file bytes are identical to before.
7. No leftover `*.tmp` files in the directory after saves.
8. `defaultPath()` returns the `TINYTASKS_FILE` value when set, and otherwise ends with `.tinytasks/tasks.json` under `os.homedir()` (compare using `path.join`). Restore the environment variable in `t.after`.
9. Save creates a missing nested parent directory.

**Files**: `tests/store.test.js` (new).

**Validation**:
- [ ] `node --test tests/store.test.js` passes.
- [ ] Tests never touch the real home directory.

## Definition of Done

- [ ] All three subtasks complete; `node --test` passes for the whole repository (WP01 + WP02).
- [ ] `src/store.js` exports exactly `StoreError`, `defaultPath`, `loadState`, `saveState`.
- [ ] No test reads or writes the real `~/.tinytasks`.
- [ ] A corrupt file is never modified by any code path in this package.
- [ ] Subtasks recorded: `spec-kitty agent tasks mark-status T006 T007 T008 --status done`.

## Risks

- Windows rename semantics and antivirus locking can cause intermittent `EPERM` on rename. If observed, report it rather than adding retries silently; a single short retry loop is acceptable only with a comment and a test.
- Reading the environment at import time would make tests flaky.

## Reviewer Guidance

Confirm the corrupt-file test asserts the bytes are unchanged, that `.tmp` cleanup is tested, and that the id-counter-across-runs test exists. Confirm only `src/store.js` and `tests/store.test.js` changed.

Implementation command: `spec-kitty agent action implement WP02 --agent <name>`
