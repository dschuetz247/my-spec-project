// Pure task list rules. No I/O, no imports. Functions never mutate their input.

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

function findIndex(state, id) {
  const index = state.tasks.findIndex((t) => t.id === id);
  if (index === -1) throw new TaskError("NOT_FOUND", `no task with id ${id}`);
  return index;
}

// Returns { state, task, alreadyDone }. Unknown id -> TaskError("NOT_FOUND").
// If already done, returns the SAME state object and alreadyDone: true.
export function completeTask(state, id) {
  const index = findIndex(state, id);
  const existing = state.tasks[index];
  if (existing.done) return { state, task: existing, alreadyDone: true };
  const task = { ...existing, done: true };
  const tasks = state.tasks.map((t, i) => (i === index ? task : t));
  return { state: { next_id: state.next_id, tasks }, task, alreadyDone: false };
}

// Returns { state, task } where task is the removed task. next_id is unchanged.
export function deleteTask(state, id) {
  const index = findIndex(state, id);
  const task = state.tasks[index];
  const tasks = state.tasks.filter((_, i) => i !== index);
  return { state: { next_id: state.next_id, tasks }, task };
}

function invalid(reason) {
  return new TaskError("INVALID_STATE", `invalid task state: ${reason}`);
}

// Returns value if valid, otherwise throws TaskError("INVALID_STATE").
export function validateState(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("state must be an object");
  }
  if (!Number.isInteger(value.next_id) || value.next_id < 1) {
    throw invalid("next_id must be an integer >= 1");
  }
  if (!Array.isArray(value.tasks)) throw invalid("tasks must be an array");
  const seen = new Set();
  for (const task of value.tasks) {
    if (task === null || typeof task !== "object" || Array.isArray(task)) {
      throw invalid("each task must be an object");
    }
    if (!Number.isInteger(task.id) || task.id < 1) throw invalid("task id must be an integer >= 1");
    if (typeof task.description !== "string" || task.description === "") {
      throw invalid("task description must be a non-empty string");
    }
    if (typeof task.done !== "boolean") throw invalid("task done must be a boolean");
    if (seen.has(task.id)) throw invalid(`duplicate task id ${task.id}`);
    if (task.id >= value.next_id) throw invalid("task id must be less than next_id");
    seen.add(task.id);
  }
  return value;
}
