# Data Model: Tiny CLI Task List

## Task
| Field | Type | Rules |
|-------|------|-------|
| id | positive integer | Unique; assigned from the counter; never reused (FR-003) |
| description | text | Non-empty after trimming surrounding whitespace (FR-002); stored as entered otherwise |
| done | boolean | `false` on creation; becomes `true` on complete; never returns to `false` |

## TaskList
| Field | Type | Rules |
|-------|------|-------|
| tasks | ordered list of Task | Ordered by identifier ascending |
| next_id | positive integer | Starts at 1; increases by 1 on every add; never decreases, including after deletes |

## State transitions
```mermaid
stateDiagram-v2
    [*] --> NotDone: add
    NotDone --> Done: complete
    Done --> Done: complete (reports already done)
    NotDone --> [*]: delete
    Done --> [*]: delete
```

## Invariants
- Every task id is less than `next_id`.
- No two tasks share an id.
- A rejected action leaves tasks and `next_id` byte-for-byte unchanged (NFR-002).

## Stored file shape (illustrative)
```json
{"next_id": 3, "tasks": [{"id": 2, "description": "buy milk", "done": true}]}
```
A missing file means an empty list with `next_id` 1. An unreadable or malformed file is an error and is never overwritten.
