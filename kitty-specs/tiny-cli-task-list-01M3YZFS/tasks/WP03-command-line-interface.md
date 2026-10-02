---
work_package_id: WP03
title: Command-Line Interface
dependencies:
- WP01
- WP02
requirement_refs:
- FR-006
- FR-007
- FR-010
planning_base_branch: my-first-mission
merge_target_branch: my-first-mission
branch_strategy: Planning artifacts for this mission were generated on my-first-mission. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into my-first-mission unless the human explicitly redirects the landing branch.
subtasks:
- T009
- T010
- T011
- T012
- T013
- T014
phase: Phase 3 - Interface
history:
- timestamp: '2026-10-02T19:31:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
agent_profile: node-norris
authoritative_surface: src/cli.js
create_intent:
- src/cli.js
- src/index.js
- tests/cli.test.js
execution_mode: code_change
owned_files:
- src/cli.js
- src/index.js
- tests/cli.test.js
role: implementer
tags: []
tracker_refs: []
---

# Work Package Prompt: WP03 – Command-Line Interface

## ⚡ Do This First: Load Agent Profile

Before reading anything else, load the agent profile named in this file's frontmatter (`agent_profile: node-norris`) with `/ad-hoc-profile-load node-norris`. Follow its identity and boundaries for the rest of this work package.

## Objective

Expose the four actions (`add`, `list`, `complete`, `delete`) as terminal commands with the exact messages and exit codes of the CLI contract, and prove every user scenario in the spec end to end, including persistence across separate runs.

## Branch Strategy

- Planning/base branch: `my-first-mission`
- Final merge target: `my-first-mission`
- Execution worktrees are allocated per computed lane from `lanes.json` after `finalize-tasks`. This package depends on WP01 and WP02; implement with `spec-kitty agent action implement WP03 --agent <name>` and confirm `src/core.js` and `src/store.js` are present in the workspace first.

## Context

- Spec: [spec.md](../spec.md) FR-006, FR-007, FR-010, NFR-001, NFR-003, NFR-004, all user stories and edge cases.
- **Authoritative contract**: [contracts/cli-contract.md](../contracts/cli-contract.md). Messages and exit codes there are exact.
- Plan: [plan.md](../plan.md) concern IC-03; [quickstart.md](../quickstart.md) is the acceptance walkthrough.
- Available from earlier work:
  - `src/core.js`: `TaskError` (with `.code` and `.message`), `emptyState`, `parseId`, `addTask`, `completeTask`, `deleteTask`.
  - `src/store.js`: `StoreError` (message `cannot read task file <path>`), `defaultPath`, `loadState`, `saveState`.

Exit codes: `0` success; `1` rejected action or unreadable storage; `2` usage error.

## Subtasks

### T009 – Argument parsing, dispatch, usage and help

**Purpose**: One entry function that every test and the real program share.

**Steps**: in `src/cli.js` export:

```js
export function run(argv, { stdout = process.stdout, stderr = process.stderr, file } = {}) {
  // returns an exit code (number); never calls process.exit
}
```

- `argv` is the argument list without `node` and the script path.
- `file` optionally overrides the storage path (falls back to `loadState()`/`saveState()` defaults, which honour `TINYTASKS_FILE`).
- Write with `stdout.write(line + "\n")` / `stderr.write(...)`, so tests can capture output with simple objects.
- Dispatch on `argv[0]`:
  - `add`, `list`, `complete`, `delete` → handlers (T010, T011).
  - `-h`, `--help`, or `help` → print usage to **stdout**, return 0.
  - `<action> -h/--help` (for example `add --help`) → print that action's usage to stdout, return 0.
  - No action, or an unknown action → usage to **stderr**, return 2.
  - `complete`/`delete` with a missing id, extra arguments, or `list` with extra arguments, or `add` with no words → that action's usage to stderr, return 2. (An `add` whose words are all blank is different: see T010.)
- Usage text must list all four actions with one-line descriptions and an example, so a new user can add, complete and delete from help alone (NFR-004). Example shape:

```
Usage: tinytasks <action> [arguments]

Actions:
  add <description>   Add a task
  list                Show all tasks
  complete <id>       Mark a task as done
  delete <id>         Permanently delete a task

Example: tinytasks add buy milk
```

**Files**: `src/cli.js` (new).

**Validation**:
- [ ] `run([])` returns 2 with usage on stderr; `run(["--help"])` returns 0 with usage on stdout.
- [ ] `run(["frobnicate"])` returns 2.

### T010 – `add` and `list`

**Purpose**: Capture and review tasks.

**Steps**:
- `add`: join the remaining arguments with a single space as the description, then `loadState` → `addTask` → `saveState`, printing `Added task <id>: <description>` (use the stored, trimmed description) to stdout, return 0.
  - Joined description empty or whitespace only (for example `add ""`) → `Error: description cannot be empty` on stderr, return 1, nothing written.
- `list`: `loadState`, then one line per task in ascending id order:
  - `1 [ ] buy milk` for not done, `1 [x] buy milk` for done.
  - Empty list → `No tasks.`
  - `list` never writes to storage, even when the file does not exist yet.

**Notes**: shell quoting means `tinytasks add buy milk` and `tinytasks add "buy milk"` produce the same description. Arguments after a literal `--` are treated as description words so a description can start with `-` (for example `add -- -urgent call`). Handle `--` by dropping only the first occurrence.

**Files**: `src/cli.js`.

**Validation**:
- [ ] Output lines match the contract exactly (including the `Added task 1: buy milk` form).
- [ ] `list` on a fresh machine prints `No tasks.` and creates no file.

### T011 – `complete` and `delete`, error mapping, exit codes

**Purpose**: Mutating actions that never partially apply.

**Steps**:
- Shared pattern, in this order: `parseId(arg)` → `loadState()` → core function → `saveState` only if something changed → message.
- `complete <id>`:
  - success: `Completed task <id>`, return 0, saved.
  - already done: `Task <id> is already done`, return 0, **no save**.
- `delete <id>`: `Deleted task <id>`, return 0, saved.
- Central error handling: wrap each action in one `try/catch`:
  - `TaskError` with code `EMPTY_DESCRIPTION`, `INVALID_ID`, `NOT_FOUND` → stderr `Error: <message>`, return 1.
  - `StoreError` → stderr `Error: <message>`, return 1 (the message already contains the path).
  - Any other error → rethrow (it is a bug; let it surface with a stack trace).
- Expected messages: `Error: no task with id 99`, `Error: invalid task id 'abc'`, `Error: description cannot be empty`, `Error: cannot read task file <path>`.

**Files**: `src/cli.js`.

**Validation**:
- [ ] Unknown id on `complete` and on `delete` returns 1 and leaves the file byte-identical.
- [ ] Non-numeric id returns 1 with the `invalid task id` message and does not read or write storage.
- [ ] A corrupt storage file makes every action except `--help` return 1 and leaves the file unchanged.

### T012 – Entry point

**Purpose**: The thin executable shell around `run`.

**Steps**: create `src/index.js`:

```js
#!/usr/bin/env node
import { run } from "./cli.js";

process.exitCode = run(process.argv.slice(2));
```

Use `process.exitCode` rather than `process.exit()` so buffered output is flushed. `package.json` (WP01) already points `bin` here.

**Files**: `src/index.js` (new).

**Validation**:
- [ ] `node src/index.js add buy milk` prints `Added task 1: buy milk` (with `TINYTASKS_FILE` set to a temporary file).
- [ ] The exit code seen by the shell matches the contract.

### T013 – End-to-end tests

**Purpose**: Prove each acceptance scenario through the real executable, in separate processes.

**Steps**: create `tests/cli.test.js`. Helper:

```js
import { spawnSync } from "node:child_process";
function tt(file, ...args) {
  const r = spawnSync(process.execPath, ["src/index.js", ...args], {
    env: { ...process.env, TINYTASKS_FILE: file },
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
```

Use a fresh temp directory per test (`fs.mkdtempSync`, cleaned in `t.after`). Run with the repository root as the working directory (`node --test` does this by default).

Cover, mapping to the spec:
1. **Story 1**: add "buy milk" → code 0, out `Added task 1: buy milk`; list shows `1 [ ] buy milk`. A second add gets id 2. `add ""` and `add "   "` → code 1, `Error: description cannot be empty`, list unchanged.
2. **Story 2**: complete 1 → `Completed task 1`, list shows `1 [x] buy milk`. Complete again → `Task 1 is already done`, code 0.
3. **Story 3**: delete 1 → `Deleted task 1`, list no longer shows it. After deleting the newest task and adding another, the new id is **not** the deleted one.
4. **Story 4 (persistence)**: every command above is a separate process and the assertions rely on state from earlier processes; add one explicit test that adds, completes and deletes across several processes and compares final `list` output to the expected text.
5. **Edge cases**: `complete 99` and `delete 99` → code 1, `Error: no task with id 99`, file bytes unchanged; `complete abc` → code 1, `Error: invalid task id 'abc'`; empty list → `No tasks.`; no action → code 2 with usage on stderr; unknown action → code 2; missing id → code 2.
6. Description edge cases: quotes, unicode (for example `café ✓`) and a 2,000-character description come back from `list` exactly as entered.
7. Help: `--help` and `add --help` → code 0, usage on stdout containing `add`, `complete`, `delete`.
8. Corrupt file: write `{broken` to the file, run `list` → code 1, stderr starts `Error: cannot read task file`, file contents unchanged.
9. Failed actions leave the file byte-identical (compare `fs.readFileSync` before/after) for every error case above (NFR-002).

**Files**: `tests/cli.test.js` (new).

**Validation**:
- [ ] `node --test` passes on Windows.
- [ ] No test touches the real home directory.

### T014 – Performance check

**Purpose**: Show NFR-001 / SC-004: each action completes in under 1 second with 1,000 tasks, including process start-up.

**Steps**: in `tests/cli.test.js`, seed the temporary file directly with a valid state of 1,000 tasks (`next_id: 1001`), then time `list`, `add`, `complete 500` and `delete 500` with `performance.now()` around each `spawnSync`, asserting each is under 1,000 ms. If the measured time is regularly above ~500 ms on a normal machine, report it instead of loosening the threshold.

**Files**: `tests/cli.test.js`.

**Validation**:
- [ ] All four actions finish under 1,000 ms each.

## Definition of Done

- [ ] All six subtasks complete; `node --test` passes for the whole repository.
- [ ] Every message and exit code matches [contracts/cli-contract.md](../contracts/cli-contract.md).
- [ ] The [quickstart.md](../quickstart.md) sequence produces exactly the documented output when run manually.
- [ ] `run` never calls `process.exit`; `src/index.js` is the only file touching `process.argv`/`process.exitCode`.
- [ ] No dependencies added; only owned files changed (`package.json` is untouched).
- [ ] Subtasks recorded: `spec-kitty agent tasks mark-status T009 T010 T011 T012 T013 T014 --status done`.

## Risks

- Output wording drift from the contract; tests compare exact strings, so copy them from the contract.
- Saving after a failed or no-op action would break NFR-002; check the "file unchanged" assertions.
- Process-start-up time on slow antivirus-scanned machines can make the performance test flaky; see T014.

## Reviewer Guidance

Run the quickstart by hand. Check that each spec acceptance scenario has a matching test and that error-path tests assert byte-identical files, not just exit codes. Confirm `--help` reaches stdout with code 0 while usage errors go to stderr with code 2.

Implementation command: `spec-kitty agent action implement WP03 --agent <name>`
