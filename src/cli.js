// Command-line interface: argument parsing, dispatch, messages and exit codes.
// run() returns an exit code and never calls process.exit.
import { TaskError, parseId, addTask, completeTask, deleteTask } from "./core.js";
import { StoreError, loadState, saveState } from "./store.js";

const ACTION_USAGE = {
  add: "Usage: tinytasks add <description>\n\nAdd a task. Example: tinytasks add buy milk\nUse -- before a description that starts with '-'.",
  list: "Usage: tinytasks list\n\nShow all tasks, one per line. Example: tinytasks list",
  complete: "Usage: tinytasks complete <id>\n\nMark a task as done. Example: tinytasks complete 1",
  delete: "Usage: tinytasks delete <id>\n\nPermanently delete a task. Example: tinytasks delete 1",
};

const USAGE = `Usage: tinytasks <action> [arguments]

Actions:
  add <description>   Add a task
  list                Show all tasks
  complete <id>       Mark a task as done
  delete <id>         Permanently delete a task

Example: tinytasks add buy milk
         tinytasks complete 1
         tinytasks delete 1`;

const isHelp = (arg) => arg === "-h" || arg === "--help";

export function run(argv, { stdout = process.stdout, stderr = process.stderr, file } = {}) {
  const out = (text) => stdout.write(text + "\n");
  const err = (text) => stderr.write(text + "\n");
  const usageError = (text) => {
    err(text);
    return 2;
  };

  const [action, ...args] = argv;
  if (action === undefined) return usageError(USAGE);
  if (isHelp(action) || action === "help") {
    out(USAGE);
    return 0;
  }
  if (!Object.hasOwn(ACTION_USAGE, action)) return usageError(USAGE);

  const usage = ACTION_USAGE[action];
  const dash = args.indexOf("--");
  const beforeDashes = dash === -1 ? args : args.slice(0, dash);
  if (beforeDashes.some(isHelp)) {
    out(usage);
    return 0;
  }

  let words = args;
  if (action === "add") {
    if (dash !== -1) words = [...args.slice(0, dash), ...args.slice(dash + 1)];
    if (words.length === 0) return usageError(usage);
  } else if (action === "list") {
    if (args.length !== 0) return usageError(usage);
  } else if (args.length !== 1) {
    return usageError(usage);
  }

  try {
    switch (action) {
      case "add": {
        const { state, task } = addTask(loadState(file), words.join(" "));
        saveState(state, file);
        out(`Added task ${task.id}: ${task.description}`);
        return 0;
      }
      case "list": {
        const { tasks } = loadState(file);
        if (tasks.length === 0) out("No tasks.");
        else for (const t of tasks) out(`${t.id} [${t.done ? "x" : " "}] ${t.description}`);
        return 0;
      }
      case "complete": {
        const id = parseId(args[0]); // before any storage access
        const { state, alreadyDone } = completeTask(loadState(file), id);
        if (alreadyDone) {
          out(`Task ${id} is already done`);
          return 0;
        }
        saveState(state, file);
        out(`Completed task ${id}`);
        return 0;
      }
      case "delete": {
        const id = parseId(args[0]); // before any storage access
        const { state } = deleteTask(loadState(file), id);
        saveState(state, file);
        out(`Deleted task ${id}`);
        return 0;
      }
    }
  } catch (e) {
    const expected = e instanceof TaskError && e.code !== "INVALID_STATE"; // INVALID_STATE here would be a bug
    if (expected || e instanceof StoreError) {
      err(`Error: ${e.message}`);
      return 1;
    }
    throw e;
  }
}
