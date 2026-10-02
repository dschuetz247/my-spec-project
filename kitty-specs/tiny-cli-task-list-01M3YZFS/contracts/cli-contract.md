# CLI Contract: tinytasks

Invocation: `node src/index.js <action> [arguments]`

Success messages go to standard output; error messages go to standard error.

| Action | Arguments | Success output (stdout) | Exit |
|--------|-----------|-------------------------|------|
| `add` | `<description>` (one or more words, joined) | `Added task <id>: <description>` | 0 |
| `list` | none | One line per task: `<id> [x] <description>` for done, `<id> [ ] <description>` for not done. If empty: `No tasks.` | 0 |
| `complete` | `<id>` | `Completed task <id>` ; if already done: `Task <id> is already done` | 0 |
| `delete` | `<id>` | `Deleted task <id>` | 0 |

## Errors (stderr, list unchanged)

| Condition | Message | Exit |
|-----------|---------|------|
| `add` with empty or whitespace-only description | `Error: description cannot be empty` | 1 |
| `complete`/`delete` with unknown id | `Error: no task with id <id>` | 1 |
| `complete`/`delete` with a non-numeric id | `Error: invalid task id '<value>'` | 1 |
| Storage file unreadable or malformed | `Error: cannot read task file <path>` | 1 |
| No action, unknown action, or missing arguments | Brief usage help | 2 |

`-h` / `--help` on the tool or any action prints usage and exits 0 (NFR-004).
