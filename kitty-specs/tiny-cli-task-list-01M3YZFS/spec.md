# Mission Specification: Tiny CLI Task List

**Mission Branch**: `my-first-mission`  
**Created**: 2026-10-02  
**Status**: Draft  
**Input**: User description: "Build a tiny command-line task list app with add, complete, and delete actions."

## Domain Language

- **Task**: a single to-do item with a description, a completion state, and a unique identifier.
- **Task list**: the single collection of all tasks belonging to the user.
- **Complete** (verb): mark a task as done. Avoid the synonyms "finish", "close", "check off".
- **Delete** (verb): permanently remove a task. Avoid "remove", "archive".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add and see tasks (Priority: P1)

A person runs a command in their terminal to add a task by description, and a command to list their tasks, so they can capture and review what they need to do.

**Why this priority**: Without adding and viewing tasks, nothing else has value. This is the MVP.

**Independent Test**: Add a task, list tasks, and confirm the task appears as not done with an identifier.

**Acceptance Scenarios**:

1. **Given** an empty task list, **When** the user adds "buy milk", **Then** the tool confirms the addition, shows the new task's identifier, and the task appears in the list as not done.
2. **Given** a task list with existing tasks, **When** the user adds another task, **Then** it receives an identifier different from every existing task.
3. **Given** any task list, **When** the user adds a task with an empty description, **Then** the tool rejects it with a clear message and the list is unchanged.

---

### User Story 2 - Complete a task (Priority: P2)

A person marks a task as done by its identifier so they can track progress.

**Why this priority**: Completion is the core purpose of a task list after capture.

**Independent Test**: With one task present, complete it and confirm the list shows it as done.

**Acceptance Scenarios**:

1. **Given** a not-done task with identifier 1, **When** the user completes 1, **Then** the tool confirms and the list shows task 1 as done.
2. **Given** an already-done task, **When** the user completes it again, **Then** the tool reports it was already done and the list is unchanged.

---

### User Story 3 - Delete a task (Priority: P3)

A person permanently removes a task by its identifier so the list stays relevant.

**Why this priority**: Useful housekeeping, but the list is usable without it.

**Independent Test**: With one task present, delete it and confirm the list is empty.

**Acceptance Scenarios**:

1. **Given** a task with identifier 1, **When** the user deletes 1, **Then** the tool confirms and the task no longer appears in the list.
2. **Given** a task was deleted, **When** the user adds a new task, **Then** the new task does not reuse the deleted task's identifier.

---

### User Story 4 - Tasks survive between runs (Priority: P1)

A person closes the terminal and returns later to find their task list exactly as they left it.

**Why this priority**: A task list that forgets its contents is not useful.

**Independent Test**: Add and complete tasks, end the session, start a new run, list tasks, and compare.

**Acceptance Scenarios**:

1. **Given** tasks were added, completed, or deleted in an earlier run, **When** the user lists tasks in a new run, **Then** the list reflects every earlier change.

---

### Edge Cases

- Completing or deleting an identifier that does not exist: the tool shows a clear error, signals failure to the shell, and leaves the list unchanged.
- An identifier that is not a valid number: rejected with a clear message; the list is unchanged.
- Listing when no tasks exist: the tool states the list is empty rather than printing nothing.
- A very long or special-character description: stored and displayed as entered.
- Running with no or an unrecognized action: the tool shows brief usage help and signals failure.

## Requirements *(mandatory)*

### Functional Requirements

| ID | Title | User Story | Priority | Status |
|----|-------|------------|----------|--------|
| FR-001 | Add task | As a user, I want to add a task with a description so that I can capture something I need to do. | High | Open |
| FR-002 | Reject empty description | As a user, I want an empty description rejected so that my list contains no blank tasks. | Medium | Open |
| FR-003 | Unique identifiers | As a user, I want every task to have an identifier that is never reused within the list so that I can refer to it unambiguously. | High | Open |
| FR-004 | Complete task | As a user, I want to mark a task done by its identifier so that I can track progress. | High | Open |
| FR-005 | Delete task | As a user, I want to permanently delete a task by its identifier so that my list stays relevant. | High | Open |
| FR-006 | List tasks | As a user, I want to see all tasks with their identifier, description, and done/not-done state so that I can review and verify my list. | High | Open |
| FR-007 | Unknown identifier handling | As a user, I want an error for a nonexistent or invalid identifier, with the list unchanged, so that mistakes do not corrupt my list. | High | Open |
| FR-008 | Idempotent completion | As a user, I want completing an already-done task to report so without error side effects so that repeated commands are harmless. | Low | Open |
| FR-009 | Persistence | As a user, I want my tasks saved between runs so that they are still there when I return. | High | Open |
| FR-010 | Action feedback | As a user, I want each action to print a clear confirmation or error message so that I know what happened. | Medium | Open |

### Non-Functional Requirements

| ID | Title | Requirement | Category | Priority | Status |
|----|-------|-------------|----------|----------|--------|
| NFR-001 | Responsiveness | Each action completes and prints its result in under 1 second for a list of up to 1,000 tasks. | Performance | Medium | Open |
| NFR-002 | Data safety | A failed or rejected action leaves 100% of existing tasks unchanged. | Reliability | High | Open |
| NFR-003 | Scriptable outcome | Every successful action exits with a success status and every failed action with a non-success status. | Usability | Medium | Open |
| NFR-004 | Learnability | A new user can perform add, complete, and delete from the built-in usage help alone, with no other documentation. | Usability | Low | Open |

### Constraints

| ID | Title | Constraint | Category | Priority | Status |
|----|-------|------------|----------|----------|--------|
| C-001 | Single user, single list | No accounts, sharing, or multiple lists. | Business | High | Open |
| C-002 | Out of scope | No editing, due dates, priorities, tags, or undo. | Business | Medium | Open |
| C-003 | Local only | No network access is required or used. | Technical | Medium | Open |

### Key Entities

- **Task**: a description, a done/not-done state, and a unique identifier that is never reused.
- **Task list**: the user's single collection of tasks, preserved between runs.

## Assumptions

- Single local user; the list is private to them.
- Deleting requires no confirmation prompt.
- A `list` action is included beyond the three requested actions because the others cannot be verified without it.
- Identifiers are positive whole numbers assigned in increasing order.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can add, complete, and delete a task in under 2 minutes using only the built-in help.
- **SC-002**: 100% of changes made in one run are visible in the next run.
- **SC-003**: 100% of invalid-identifier and empty-description attempts leave the list unchanged and show an error.
- **SC-004**: Each action responds in under 1 second for lists up to 1,000 tasks.
