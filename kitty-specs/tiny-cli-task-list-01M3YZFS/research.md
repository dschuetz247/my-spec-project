# Research: Tiny CLI Task List

No `NEEDS CLARIFICATION` items remain. Decisions below record the reasoning for the choices in [plan.md](plan.md).

## Language and dependencies
- **Decision**: Python 3.10+, standard library only.
- **Rationale**: User-confirmed (decision `01M3Z15PXNPN95BC98061789YP`). Needs no install step and adds no supply-chain exposure.
- **Alternatives considered**: Node.js without dependencies (equivalent, not chosen by the user).

## Storage format
- **Decision**: One JSON file with a task array and a `next_id` counter.
- **Rationale**: Human-readable, trivially inspectable, enough for about 1,000 tasks within the 1-second budget.
- **Alternatives considered**: SQLite (more than needed for one table, harder to inspect); plain text lines (no safe place for the identifier counter).

## Identifier non-reuse
- **Decision**: Persist an ever-increasing `next_id` counter.
- **Rationale**: Using "highest existing ID + 1" would reuse an ID after the newest task is deleted, violating FR-003.

## Atomic writes
- **Decision**: Write to a temporary file in the same directory, then atomically replace the target.
- **Rationale**: Prevents half-written data on a crash and supports NFR-002.
- **Alternatives considered**: Direct overwrite (risks truncation on failure).

## Storage location
- **Decision**: `.tinytasks/tasks.json` in the user's home directory, overridable with `TINYTASKS_FILE`.
- **Rationale**: Works from any directory so the list is the same wherever the tool is run; the override keeps tests isolated from real data.
- **Alternatives considered**: File in the current directory (list would differ per directory, surprising for a single personal list).

## Supply-chain and adversarial review
- No dependencies are added, so the supply-chain checks do not apply and no adversarial squad pass is required. No contested findings exist to disposition.
