# Implementation Plan: Tiny CLI Task List

**Branch**: `my-first-mission` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/tiny-cli-task-list-01M3YZFS/spec.md`

## Summary

A single-user command-line tool with four actions (`add`, `list`, `complete`, `delete`) that persists tasks between runs. Approach: a small Node.js program using only built-in modules, a JSON file for storage written atomically, and a thin argument-parsing layer over a storage-agnostic task-list core. Engineering alignment confirmed with the user: Node.js, no dependencies (decision `01M3Z1EKXDZD57XW5TXR3ZVRDH`, which supersedes the earlier Python 3 choice `01M3Z15PXNPN95BC98061789YP`).

## Technical Context

**Language/Version**: Node.js 20+ (ES modules; developed and tested on the user's installed Node.js v24)
**Primary Dependencies**: None (built-in modules only: `node:util` `parseArgs`, `node:fs`, `node:os`, `node:path`)
**Storage**: One local JSON file holding the tasks and a "next identifier" counter. Default location is `.tinytasks/tasks.json` under the user's home directory, overridable by the `TINYTASKS_FILE` environment variable (used by tests)
**Testing**: Built-in `node:test` runner, run with `node --test`; core logic unit tested, CLI tested end-to-end through a child process against a temporary storage file
**Target Platform**: Any OS with Node.js 20+ (verified on Windows 11)
**Project Type**: single
**Performance Goals**: Each action under 1 second for up to 1,000 tasks (NFR-001, SC-004)
**Constraints**: Failed actions never change stored data (NFR-002); exit status 0 on success, non-zero on failure (NFR-003); local only, no network (C-003)
**Scale/Scope**: One user, one list, up to roughly 1,000 tasks

## Charter Check

Skipped: no charter exists (`.kittify/charter/charter.yaml` not found). Built-in directives were considered: locality of change and specification fidelity (DIRECTIVE_010) are satisfied by the traceability map below; the test quality gate (DIRECTIVE_030) is satisfied by the testing approach. Re-check after design: no conflicts.

**Supply-chain note**: the plan adds no third-party dependencies, so registry authenticity, freshness and install-script (`preinstall`/`postinstall`) concerns do not apply; `package.json` declares none. Node.js 24 is an Active LTS line, and the plan requires only 20+. No adversarial squad pass is required because no security-impacting dependency decision was made.

## Project Structure

### Documentation (this mission)

```
kitty-specs/tiny-cli-task-list-01M3YZFS/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli-contract.md
└── tasks.md             # Created later by /spec-kitty.tasks
```

### Source Code (repository root)

```
package.json             # "type": "module", "bin", "test" script; no dependencies
src/
├── core.js              # Task, TaskList: add / complete / delete rules, no I/O
├── store.js             # load/save JSON file, atomic write
├── cli.js               # argument parsing, messages, exit codes
└── index.js             # entry point (`node src/index.js <action>`; also the `tinytasks` bin)

tests/
├── core.test.js
├── store.test.js
└── cli.test.js
```

**Structure Decision**: Single project. Rules (core) are separated from persistence (store) and presentation (cli) so each is independently testable and the storage format can change without touching the rules.

## Design Decisions

- **Identifiers**: positive integers from a persisted counter that only increases, so deleted identifiers are never reused (FR-003).
- **Atomic persistence**: write to a temporary file in the same directory, then rename it over the real file, so a crash or rejected action cannot leave partial data (NFR-002).
- **Validate before mutate**: all input checks (empty description, invalid or unknown identifier) happen before any write, so failures write nothing (FR-002, FR-007).
- **Exit codes**: 0 success; 1 rejected action (unknown ID, empty description); 2 usage error (no or unknown action, bad arguments) (NFR-003).
- **Idempotent completion**: completing a done task prints "already done", exits 0, writes nothing (FR-008).
- **Missing or empty storage file**: treated as an empty list. A corrupt file is reported as an error and never overwritten.
- **Deletion**: immediate, no prompt (spec assumption).

## Requirement Traceability

| Requirement | Where addressed |
|-------------|-----------------|
| FR-001, FR-002, FR-003 | `core.js` add; counter in `store.js` |
| FR-004, FR-008 | `core.js` complete |
| FR-005 | `core.js` delete |
| FR-006, FR-010 | `cli.js` list and messages |
| FR-007 | `core.js` lookup errors; `cli.js` exit codes |
| FR-009 | `store.js` |
| NFR-001 | Single read/write of one small file; checked by a 1,000-task test |
| NFR-002 | Validate-before-mutate; atomic write |
| NFR-003 | `cli.js` exit codes |
| NFR-004 | Built-in usage/help output in `cli.js` |
| C-001 to C-003 | No accounts, no editing features, no network code |

## Complexity Tracking

No charter violations; nothing to justify.

## Implementation Concern Map

### IC-01 — Task list rules

- **Purpose**: Define tasks and the add, complete and delete rules independent of storage and display.
- **Relevant requirements**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, NFR-002
- **Affected surfaces**: `src/core.js`, `tests/core.test.js`
- **Sequencing/depends-on**: none
- **Risks**: Identifier non-reuse must survive deleting the highest-numbered task, which is why the counter is stored separately from the tasks.

### IC-02 — Persistence

- **Purpose**: Save and load the task list between runs without ever leaving partial data.
- **Relevant requirements**: FR-009, NFR-002, C-003
- **Affected surfaces**: `src/store.js`, `tests/store.test.js`
- **Sequencing/depends-on**: IC-01 (needs the data shape)
- **Risks**: Atomic replace behaviour differs slightly across operating systems; test on Windows. Corrupt files must not be silently overwritten.

### IC-03 — Command-line interface

- **Purpose**: Expose the actions as commands with clear messages and correct exit codes.
- **Relevant requirements**: FR-006, FR-007, FR-010, NFR-001, NFR-003, NFR-004
- **Affected surfaces**: `src/cli.js`, `src/index.js`, `package.json`, `tests/cli.test.js`
- **Sequencing/depends-on**: IC-01, IC-02
- **Risks**: Exit codes and the empty-list message must match the contract in `contracts/cli-contract.md`.
