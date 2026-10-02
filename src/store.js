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

/** Storage location; the environment is read at call time, not import time. */
export function defaultPath() {
  return process.env.TINYTASKS_FILE || path.join(os.homedir(), ".tinytasks", "tasks.json");
}

/**
 * Load the task state.
 * - missing file: returns an empty state (the file is NOT created)
 * - unreadable, empty, malformed or invalid file: throws StoreError
 */
export function loadState(file = defaultPath()) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return emptyState(); // first run: empty list
    throw new StoreError(file, err); // permissions, is-a-directory, ...
  }
  try {
    return validateState(JSON.parse(text));
  } catch (err) {
    throw new StoreError(file, err); // malformed JSON, zero bytes, or invalid shape
  }
}

/**
 * Atomically persist the state (write temp file in the same directory, then rename).
 * Callers must NEVER call this after a failed loadState: a file that could not
 * be read must not be overwritten.
 */
export function saveState(state, file = defaultPath()) {
  validateState(state);
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
