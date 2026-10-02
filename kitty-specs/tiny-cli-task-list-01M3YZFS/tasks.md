# Tasks: Tiny CLI Task List

**Mission**: `tiny-cli-task-list-01M3YZFS` | **Branch**: `my-first-mission` (planning base and merge target)
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Subtask rows below are reference rows. Completion is recorded with `spec-kitty agent tasks mark-status T001 T002 --status done`, not by ticking boxes.

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | Create `package.json` (ES modules, no dependencies, `test` script, `bin`) | WP01 | |
| T002 | Core: state shape, `parseId`, `addTask` with counter and empty-description rejection | WP01 | |
| T003 | Core: `completeTask` (idempotent) and `deleteTask` with not-found errors | WP01 | |
| T004 | Core: `validateState` for stored data | WP01 | |
| T005 | Core unit tests | WP01 | |
| T006 | Store: `defaultPath` and `loadState` (missing file = empty list, malformed = error) | WP02 | |
| T007 | Store: `saveState` with atomic temp-file-then-rename write | WP02 | |
| T008 | Store unit tests (round trip, missing, corrupt, atomicity, id counter survives) | WP02 | |
| T009 | CLI: argument parsing, dispatch, usage and `--help` | WP03 | |
| T010 | CLI: `add` and `list` actions with contract messages | WP03 | |
| T011 | CLI: `complete` and `delete` actions, error mapping and exit codes | WP03 | |
| T012 | Entry point `src/index.js` | WP03 | |
| T013 | End-to-end CLI tests (every spec scenario, persistence, errors, exit codes) | WP03 | |
| T014 | Performance check: 1,000-task list under 1 second per action | WP03 | |

## Work Package WP01: Task List Rules (Priority: P1, foundation)

**Goal**: Define tasks and the add, complete and delete rules as pure functions with no file or console access, plus the project scaffold.
**Independent test**: `node --test tests/core.test.js` passes; a rejected action returns or throws without producing a changed state.
**Prompt**: [tasks/WP01-task-list-rules.md](tasks/WP01-task-list-rules.md) (~220 lines)
**Requirements**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008

Included subtasks:
T001 Create `package.json` (WP01)
T002 Core: state shape, `parseId`, `addTask` (WP01)
T003 Core: `completeTask` and `deleteTask` (WP01)
T004 Core: `validateState` (WP01)
T005 Core unit tests (WP01)

Implementation sketch: scaffold `package.json`, then `core.js` with state shape and `addTask`, then complete/delete, then `validateState`, then tests covering every rule.
Parallel opportunities: none; this is the foundation.
Dependencies: none.
Risks: the identifier counter must be separate from the task array so deleting the newest task never frees its id.

## Work Package WP02: Persistence (Priority: P1)

**Goal**: Save and load the task list between runs, never leaving partial or overwritten-corrupt data.
**Independent test**: `node --test tests/store.test.js` passes, including a corrupt-file case where the file is left untouched.
**Prompt**: [tasks/WP02-persistence.md](tasks/WP02-persistence.md) (~200 lines)
**Requirements**: FR-009

Included subtasks:
T006 Store: `defaultPath` and `loadState` (WP02)
T007 Store: `saveState` atomic write (WP02)
T008 Store unit tests (WP02)

Implementation sketch: path resolution with the environment override, load with the three outcomes (missing, valid, malformed), atomic save, tests against a temporary directory.
Parallel opportunities: none within the package.
Dependencies: WP01 (state shape, `emptyState`, `validateState`).
Risks: rename-over-existing-file behaviour on Windows; the test must run on the real platform. A corrupt file must never be overwritten by a later save.

## Work Package WP03: Command-Line Interface (Priority: P1, MVP completion)

**Goal**: Expose `add`, `list`, `complete` and `delete` with the exact messages and exit codes in the CLI contract, and prove every spec scenario end to end.
**Independent test**: `node --test` passes (all suites); the quickstart sequence behaves as documented.
**Prompt**: [tasks/WP03-command-line-interface.md](tasks/WP03-command-line-interface.md) (~260 lines)
**Requirements**: FR-006, FR-007, FR-010

Included subtasks:
T009 CLI: parsing, dispatch, usage (WP03)
T010 CLI: `add` and `list` (WP03)
T011 CLI: `complete` and `delete`, errors, exit codes (WP03)
T012 Entry point `src/index.js` (WP03)
T013 End-to-end CLI tests (WP03)
T014 Performance check (WP03)

Implementation sketch: `run(argv, io)` function returning an exit code, thin `index.js`, then end-to-end tests through a child process using a temporary storage file.
Parallel opportunities: none.
Dependencies: WP01, WP02.
Risks: messages and exit codes must match [contracts/cli-contract.md](contracts/cli-contract.md) exactly; failing actions must not write.

## Dependency and MVP Summary

```
WP01 → WP02 → WP03
```

All three packages are required for a usable tool, so the MVP is WP01 to WP03 together. Work proceeds strictly in order because each package builds on the previous one's API.
