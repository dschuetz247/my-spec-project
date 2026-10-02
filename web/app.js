/* TinyTasks: a terminal-style task list. Plain script, no modules (works on file://).
 *
 * Three layers, so the first two run (and are tested) in Node without a browser:
 *   1. Rules    - the same task rules as src/core.js (tests/web.test.js keeps them in step)
 *   2. Commands - execute(line, storage) -> lines to print; no DOM involved
 *   3. Console  - prompt, typewriter output, scrollbar, floppy-drive LED (only when a document exists)
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 1. Rules (mirror of src/core.js)                                    */
  /* ------------------------------------------------------------------ */

  class TaskError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "TaskError";
      this.code = code; // "EMPTY_DESCRIPTION" | "INVALID_ID" | "NOT_FOUND" | "INVALID_STATE"
    }
  }

  function emptyState() {
    return { next_id: 1, tasks: [] };
  }

  // Accepts "1", " 12 ". Rejects "abc", "0", "-1", "1.5", "1e3", "", "0x10", unsafe-large numbers.
  function parseId(value) {
    const text = String(value).trim();
    if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) {
      throw new TaskError("INVALID_ID", "invalid task id '" + value + "'");
    }
    return Number(text);
  }

  function addTask(state, description) {
    const text = String(description == null ? "" : description).trim();
    if (text === "") throw new TaskError("EMPTY_DESCRIPTION", "description cannot be empty");
    const task = { id: state.next_id, description: text, done: false };
    return { state: { next_id: state.next_id + 1, tasks: state.tasks.concat([task]) }, task: task };
  }

  function findIndex(state, id) {
    const index = state.tasks.findIndex(function (t) { return t.id === id; });
    if (index === -1) throw new TaskError("NOT_FOUND", "no task with id " + id);
    return index;
  }

  // Already done: returns the SAME state object and alreadyDone: true (callers skip saving).
  function completeTask(state, id) {
    const index = findIndex(state, id);
    const existing = state.tasks[index];
    if (existing.done) return { state: state, task: existing, alreadyDone: true };
    const task = Object.assign({}, existing, { done: true });
    const tasks = state.tasks.map(function (t, i) { return i === index ? task : t; });
    return { state: { next_id: state.next_id, tasks: tasks }, task: task, alreadyDone: false };
  }

  function deleteTask(state, id) {
    const index = findIndex(state, id);
    const task = state.tasks[index];
    const tasks = state.tasks.filter(function (_, i) { return i !== index; });
    return { state: { next_id: state.next_id, tasks: tasks }, task: task };
  }

  function invalid(reason) {
    return new TaskError("INVALID_STATE", "invalid task state: " + reason);
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function validateState(value) {
    if (!isObject(value)) throw invalid("state must be an object");
    if (!Number.isInteger(value.next_id) || value.next_id < 1) throw invalid("next_id must be an integer >= 1");
    if (!Array.isArray(value.tasks)) throw invalid("tasks must be an array");
    const seen = new Set();
    for (const task of value.tasks) {
      if (!isObject(task)) throw invalid("each task must be an object");
      if (!Number.isInteger(task.id) || task.id < 1) throw invalid("task id must be an integer >= 1");
      if (typeof task.description !== "string" || task.description === "") {
        throw invalid("task description must be a non-empty string");
      }
      if (typeof task.done !== "boolean") throw invalid("task done must be a boolean");
      if (seen.has(task.id)) throw invalid("duplicate task id " + task.id);
      if (task.id >= value.next_id) throw invalid("task id must be less than next_id");
      seen.add(task.id);
    }
    return value;
  }

  /* ------------------------------------------------------------------ */
  /* Storage: the task list lives in localStorage, same shape as the CLI */
  /* ------------------------------------------------------------------ */

  const DATA_KEY = "tinytasks";

  class StoreError extends Error {
    constructor(cause) {
      super("cannot read stored tasks (left as is). Restore a backup with 'import --replace', or delete the '" +
        DATA_KEY + "' entry under DevTools > Application > Local Storage");
      this.name = "StoreError";
      this.cause = cause;
    }
  }

  // localStorage with an in-memory fallback for browsers where it is blocked (private mode, file:// policies).
  // persistent() tells the console whether tasks really survive a reload, so it can warn when they will not.
  function createBrowserStorage() {
    const memory = {};
    let memoryOnly = false;
    try { // probe: some browsers throw on any access, others only when writing
      root.localStorage.setItem(DATA_KEY + ".probe", "1");
      root.localStorage.removeItem(DATA_KEY + ".probe");
    } catch (e) {
      memoryOnly = true;
    }
    return {
      get: function (key) {
        if (key in memory) return memory[key]; // a failed write stays visible, never shadowed by older stored data
        try { return root.localStorage.getItem(key); } catch (e) { return null; }
      },
      set: function (key, value) {
        if (!memoryOnly) {
          try { root.localStorage.setItem(key, value); delete memory[key]; return; } catch (e) { memoryOnly = true; }
        }
        memory[key] = value;
      },
      persistent: function () { return !memoryOnly; }
    };
  }

  // Test double; pass { persistent: false } to behave like a browser that cannot store anything
  function createMemoryStorage(options) {
    const memory = {};
    const persistent = !(options && options.persistent === false);
    return {
      get: function (key) { return key in memory ? memory[key] : null; },
      set: function (key, value) { memory[key] = value; },
      persistent: function () { return persistent; }
    };
  }

  // Missing entry: empty list. Unreadable, malformed or invalid entry: StoreError, never overwritten.
  function loadState(storage) {
    const raw = storage.get(DATA_KEY);
    if (raw === null || raw === undefined) return emptyState();
    try {
      return validateState(JSON.parse(raw));
    } catch (e) {
      throw new StoreError(e);
    }
  }

  function saveState(storage, state) {
    validateState(state);
    storage.set(DATA_KEY, JSON.stringify(state));
  }

  /* ------------------------------------------------------------------ */
  /* 2. Commands: execute(line, storage) -> { lines, clear }             */
  /* ------------------------------------------------------------------ */

  class UsageError extends Error {}

  // Splits a line into tokens, keeping "double quoted strings" together.
  function tokenize(line) {
    const tokens = [];
    const re = /"([^"]*)"|(\S+)/g;
    let m;
    while ((m = re.exec(line)) !== null) tokens.push(m[1] !== undefined ? m[1] : m[2]);
    return tokens;
  }

  function pad(text, width) {
    text = String(text);
    while (text.length < width) text += " ";
    return text;
  }

  const MAX_IMPORT_CHARS = 2000000;

  function serialize(state) { // identical to what the command-line version writes to its file
    return JSON.stringify(state, null, 2) + "\n";
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function localDate() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function plural(n) { return n + (n === 1 ? " task" : " tasks"); }

  // Importing replaces the list, so refuse (with a hint) unless the user said --replace.
  // An unreadable stored list also needs --replace: importing is the way out of that state.
  function importBlocker(storage, replace) {
    let current = null;
    try { current = loadState(storage); } catch (e) { if (!(e instanceof StoreError)) throw e; }
    if (replace) return null;
    if (current === null) return "stored tasks are unreadable; 'import --replace' overwrites them with the backup";
    if (current.tasks.length) {
      return "you have " + plural(current.tasks.length) + " and import replaces them. 'export' first, then run: import --replace";
    }
    return null;
  }

  // Applies the text of a chosen backup file. Nothing is changed unless the whole file is valid.
  function importText(text, filename, storage, replace) {
    const lines = [];
    const print = function (t, cls) { lines.push({ text: t, cls: cls || null }); };
    const fail = function (why) { print("error: cannot import " + filename + ": " + why, "err"); return { lines: lines }; };

    const problem = importBlocker(storage, replace); // the list may have changed while the dialog was open
    if (problem) { print("error: " + problem, "err"); return { lines: lines }; }
    if (text.length > MAX_IMPORT_CHARS) return fail("file is too large for a task list");
    let state;
    try {
      state = validateState(JSON.parse(text.replace(/^\uFEFF/, ""))); // editors on Windows may add a BOM
    } catch (e) {
      return fail(e instanceof TaskError ? e.message : "not valid JSON");
    }
    saveState(storage, state);
    print("Imported " + plural(state.tasks.length) + " from " + filename, "bright");
    const warning = volatileWarning(storage);
    if (warning) print(warning, "err");
    return { lines: lines };
  }

  const VOLATILE_WARNING = "warning: browser storage is unavailable, so tasks are kept in memory only and " +
    "will be lost when you close or reload this page. Use 'export' to save them.";

  function volatileWarning(storage) {
    return typeof storage.persistent === "function" && !storage.persistent() ? VOLATILE_WARNING : null;
  }

  const commands = {
    help: {
      usage: "help",
      description: "show this help",
      example: "help",
      run: function (args, ctx) {
        ctx.print("commands:", "bright");
        Object.keys(commands).forEach(function (name) {
          const c = commands[name];
          ctx.print("  " + c.usage);
          ctx.print("      " + c.description + "  --  e.g. " + c.example, "dim");
        });
        ctx.print("keys:", "bright");
        ctx.print("  Up / Down");
        ctx.print("      recall earlier commands", "dim");
        ctx.print("  PgUp / PgDn");
        ctx.print("      scroll the output one page up / down", "dim");
      }
    },

    add: {
      usage: "add <description>",
      description: "add a task (quotes are optional)",
      example: "add buy milk",
      run: function (args, ctx) {
        if (!args.length) throw new UsageError("missing description");
        const state = loadState(ctx.storage);
        const result = addTask(state, args.join(" "));
        saveState(ctx.storage, result.state);
        ctx.saved();
        ctx.print("Added task " + result.task.id + ": " + result.task.description, "bright");
      }
    },

    list: {
      usage: "list",
      description: "show all tasks (alias: ls)",
      example: "list",
      run: function (args, ctx) {
        if (args.length) throw new UsageError("unexpected argument '" + args[0] + "'");
        const tasks = loadState(ctx.storage).tasks;
        if (!tasks.length) { ctx.print("No tasks."); return; }
        const rows = [["ID", "DONE", "TASK"]].concat(tasks.map(function (t) {
          return [String(t.id), t.done ? "[x]" : "[ ]", t.description];
        }));
        const widths = [0, 0];
        rows.forEach(function (r) {
          for (let i = 0; i < widths.length; i++) widths[i] = Math.max(widths[i], r[i].length);
        });
        rows.forEach(function (r, idx) {
          ctx.print("  " + pad(r[0], widths[0]) + "  " + pad(r[1], widths[1]) + "  " + r[2], idx === 0 ? "bright" : null);
        });
      }
    },

    complete: {
      usage: "complete <id>",
      description: "mark a task as done",
      example: "complete 1",
      run: function (args, ctx) {
        if (args.length !== 1) throw new UsageError(args.length ? "too many arguments" : "missing task id");
        const id = parseId(args[0]); // before any storage access
        const result = completeTask(loadState(ctx.storage), id);
        if (result.alreadyDone) { ctx.print("Task " + id + " is already done", "dim"); return; }
        saveState(ctx.storage, result.state);
        ctx.saved();
        ctx.print("Completed task " + id, "bright");
      }
    },

    "delete": {
      usage: "delete <id>",
      description: "permanently delete a task",
      example: "delete 1",
      run: function (args, ctx) {
        if (args.length !== 1) throw new UsageError(args.length ? "too many arguments" : "missing task id");
        const id = parseId(args[0]); // before any storage access
        const result = deleteTask(loadState(ctx.storage), id);
        saveState(ctx.storage, result.state);
        ctx.saved();
        ctx.print("Deleted task " + id, "bright");
      }
    },

    "export": {
      usage: "export",
      description: "download your tasks as a backup file (same format as the command-line version)",
      example: "export",
      run: function (args, ctx) {
        if (args.length) throw new UsageError("unexpected argument '" + args[0] + "'");
        const state = loadState(ctx.storage);
        const filename = "tinytasks-" + localDate() + ".json";
        ctx.download({ filename: filename, text: serialize(state) });
        ctx.print("Exported " + plural(state.tasks.length) + " to " + filename, "bright");
      }
    },

    "import": {
      usage: "import [--replace]",
      description: "restore tasks from a backup file; --replace is needed if you already have tasks",
      example: "import --replace",
      run: function (args, ctx) {
        const bad = args.find(function (a) { return a !== "--replace"; });
        if (bad !== undefined) throw new UsageError("unexpected argument '" + bad + "'");
        const replace = args.length > 0;
        const problem = importBlocker(ctx.storage, replace);
        if (problem) throw new UsageError(problem);
        ctx.pickFile({ replace: replace });
        ctx.print("choose a backup file to import (cancel the dialog to abort)", "dim");
      }
    },

    clear: {
      usage: "clear",
      description: "clear the screen",
      example: "clear",
      run: function (args, ctx) { ctx.clear(); }
    }
  };

  const aliases = { ls: "list" };

  // Result: { lines, clear, download?, pickFile? }. download and pickFile are requests for the console
  // to hand a file to the user / open the file chooser; the command layer itself never touches the DOM.
  function execute(line, storage) {
    const lines = [];
    let clear = false;
    let saved = false;
    let download = null;
    let pickFile = null;
    const ctx = {
      storage: storage,
      print: function (text, cls) { lines.push({ text: String(text), cls: cls || null }); },
      clear: function () { clear = true; },
      saved: function () { saved = true; },
      download: function (file) { download = file; },
      pickFile: function (options) { pickFile = options; }
    };
    const tokens = tokenize(line);
    if (!tokens.length) return { lines: lines, clear: false };

    const typed = tokens[0].toLowerCase();
    const name = Object.prototype.hasOwnProperty.call(aliases, typed) ? aliases[typed] : typed;
    const command = Object.prototype.hasOwnProperty.call(commands, name) ? commands[name] : null;
    if (!command) {
      ctx.print("command not found: " + tokens[0], "err");
      ctx.print("type 'help' to see available commands", "dim");
      return { lines: lines, clear: false };
    }
    try {
      command.run(tokens.slice(1), ctx);
      const warning = saved ? volatileWarning(storage) : null;
      if (warning) ctx.print(warning, "err");
    } catch (e) {
      const expected = e instanceof UsageError || e instanceof StoreError ||
        (e instanceof TaskError && e.code !== "INVALID_STATE"); // INVALID_STATE here would be a bug
      if (!expected) throw e;
      ctx.print("error: " + e.message, "err");
      if (e instanceof UsageError) ctx.print("usage: " + command.usage, "dim");
      download = null; // a failed command hands out nothing
      pickFile = null;
    }
    const result = { lines: lines, clear: clear };
    if (download) result.download = download;
    if (pickFile) result.pickFile = pickFile;
    return result;
  }

  // Exposed for tests (Node) and for poking at from the DevTools console
  root.TinyTasks = {
    core: { TaskError: TaskError, emptyState: emptyState, parseId: parseId, addTask: addTask,
      completeTask: completeTask, deleteTask: deleteTask, validateState: validateState },
    store: { DATA_KEY: DATA_KEY, StoreError: StoreError, loadState: loadState, saveState: saveState,
      createMemoryStorage: createMemoryStorage, createBrowserStorage: createBrowserStorage },
    execute: execute,
    importText: importText,
    VOLATILE_WARNING: VOLATILE_WARNING
  };

  if (typeof document === "undefined") return; // running under Node: no console to build

  /* ------------------------------------------------------------------ */
  /* 3. Console: prompt, rendering, typewriter output                    */
  /* ------------------------------------------------------------------ */

  const VERSION = "v0.1";
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const storage = createBrowserStorage();

  const headerSysEl = document.getElementById("header-sys");
  const headerUserEl = document.getElementById("header-user");
  const terminalEl = document.getElementById("terminal");
  const outputEl = document.getElementById("output");
  const inputEl = document.getElementById("cmd");
  const mirrorEl = document.getElementById("mirror");

  const history = [];
  let historyIndex = 0;

  /* Typewriter output: print() queues lines, a rAF loop types them at ~CHAR_MS per character */

  const CHAR_MS = 4;
  const LOAD_MIN_MS = 250;   // "disk load" pause before each block of output
  const LOAD_MAX_MS = 450;
  let queue = [];            // lines waiting to be typed: { el, text }; el joins the DOM when its typing starts
  let typedChars = 0;        // characters of queue[0] already written
  let lastFrame = 0;
  let holdUntil = 0;         // nothing is typed before this time (the disk-load pause)
  let frameRequested = false;

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  /* Floppy drive activity light: flickers at random while output is pending */

  const driveLedEl = document.getElementById("drive-led");
  let driveTimer = null;
  let driveActive = false;

  // Mostly short flashes, now and then a longer one, like a drive reading several sectors
  function driveStep() {
    const lit = driveLedEl.classList.toggle("on");
    const delay = lit
      ? (Math.random() < 0.2 ? random(120, 260) : random(15, 70))
      : (Math.random() < 0.15 ? random(90, 200) : random(10, 60));
    driveTimer = setTimeout(driveStep, delay);
  }

  function setDriveActive(active) {
    if (active === driveActive) return;
    driveActive = active;
    if (active) {
      driveStep();
    } else {
      clearTimeout(driveTimer);
      driveTimer = null;
      driveLedEl.classList.remove("on");
    }
  }

  // Not user-switchable: only a system request for reduced motion turns typing off
  function typingEnabled() {
    return !(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function createLine(cls) {
    const line = document.createElement("div");
    line.className = "line" + (cls ? " " + cls : "");
    return line;
  }

  function scrollToBottom() {
    terminalEl.scrollTop = terminalEl.scrollHeight;
    renderScrollbar();
  }

  /* Vintage scrollbar: #terminal scrolls natively (its own bar hidden), #scrollbar mirrors it */

  const scrollbarEl = document.getElementById("scrollbar");
  const thumbEl = document.getElementById("thumb");
  const THUMB_INSET = 2;
  const THUMB_MIN = 16;

  function thumbGeometry() {
    const track = scrollbarEl.clientHeight - 2 * THUMB_INSET;
    const height = Math.max(THUMB_MIN, track * terminalEl.clientHeight / terminalEl.scrollHeight);
    return { track: track, height: height, travel: Math.max(0, track - height) };
  }

  function renderScrollbar() {
    const range = terminalEl.scrollHeight - terminalEl.clientHeight;
    const overflowing = range > 1;
    scrollbarEl.classList.toggle("visible", overflowing);
    if (!overflowing) return;
    const g = thumbGeometry();
    thumbEl.style.height = g.height + "px";
    thumbEl.style.top = (THUMB_INSET + g.travel * terminalEl.scrollTop / range) + "px";
  }

  function lineHeight() {
    return parseFloat(getComputedStyle(terminalEl).lineHeight) || 20;
  }

  // One page = the visible height minus one line, so a line of context stays in view
  function scrollPage(direction) {
    terminalEl.scrollTop += direction * (terminalEl.clientHeight - lineHeight());
  }

  terminalEl.addEventListener("scroll", renderScrollbar);
  root.addEventListener("resize", renderScrollbar);

  // mousedown is prevented so the prompt keeps focus
  scrollbarEl.addEventListener("mousedown", function (e) {
    e.preventDefault();
    if (e.target === thumbEl) {
      const startY = e.clientY;
      const startTop = terminalEl.scrollTop;
      const g = thumbGeometry();
      const ratio = (terminalEl.scrollHeight - terminalEl.clientHeight) / Math.max(1, g.travel);
      const onMove = function (ev) { terminalEl.scrollTop = startTop + (ev.clientY - startY) * ratio; };
      const onUp = function () {
        root.removeEventListener("mousemove", onMove);
        root.removeEventListener("mouseup", onUp);
      };
      root.addEventListener("mousemove", onMove);
      root.addEventListener("mouseup", onUp);
    } else {
      scrollPage(e.clientY < thumbEl.getBoundingClientRect().top ? -1 : 1);
    }
  });

  // Instant output, used for the user's own echo and with reduced motion
  function printNow(text, cls) {
    const line = createLine(cls);
    line.textContent = text;
    outputEl.appendChild(line);
  }

  function print(text, cls) {
    if (!typingEnabled()) { printNow(text, cls); return; }
    if (!queue.length) {
      // First line of a new block: "load it from disk" before typing starts
      holdUntil = performance.now() + random(LOAD_MIN_MS, LOAD_MAX_MS);
      setDriveActive(true);
    }
    queue.push({ el: createLine(cls), text: String(text) });
    if (!frameRequested) {
      frameRequested = true;
      lastFrame = performance.now();
      requestAnimationFrame(typeFrame);
    }
  }

  function typeFrame(now) {
    frameRequested = false;
    if (queue.length && now < holdUntil) {
      // Still "loading": type nothing yet, and start counting characters only after the pause
      lastFrame = now;
      frameRequested = true;
      requestAnimationFrame(typeFrame);
      return;
    }
    let budget = Math.floor((now - lastFrame) / CHAR_MS);
    lastFrame += budget * CHAR_MS;
    while (queue.length) {
      const head = queue[0];
      if (!head.el.parentNode) outputEl.appendChild(head.el);
      const take = Math.min(budget, head.text.length - typedChars);
      typedChars += take;
      budget -= take;
      head.el.textContent = head.text.slice(0, typedChars);
      if (typedChars < head.text.length) break;
      queue.shift();
      typedChars = 0;
    }
    scrollToBottom();
    if (queue.length) {
      frameRequested = true;
      requestAnimationFrame(typeFrame);
    } else {
      setDriveActive(false);
    }
  }

  // Writes all pending output at once
  function flush() {
    queue.forEach(function (item) {
      if (!item.el.parentNode) outputEl.appendChild(item.el);
      item.el.textContent = item.text;
    });
    cancel();
    scrollToBottom();
  }

  // Drops pending output without writing it
  function cancel() {
    queue = [];
    typedChars = 0;
    holdUntil = 0;
    setDriveActive(false);
    renderScrollbar();
  }

  function today() {
    const d = new Date();
    return DAYS[d.getDay()] + " " + d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function summary() {
    try {
      const tasks = loadState(storage).tasks;
      const done = tasks.filter(function (t) { return t.done; }).length;
      return (tasks.length - done) + " open, " + done + " done" + (storage.persistent() ? "" : "  (not saved)");
    } catch (e) {
      return "tasks unreadable";
    }
  }

  function renderHeader() {
    // Split so the summary can move to its own line on narrow screens (see style.css)
    headerSysEl.textContent = "TINYTASKS/OS " + VERSION + "  |  " + today();
    headerUserEl.textContent = summary();
  }

  // Keeps the visible text + block cursor in sync with the (invisible) real input
  function renderMirror() {
    const value = inputEl.value;
    const pos = inputEl.selectionStart == null ? value.length : inputEl.selectionStart;
    mirrorEl.textContent = "";
    mirrorEl.appendChild(document.createTextNode(value.slice(0, pos)));
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = value.charAt(pos) || " ";
    mirrorEl.appendChild(cursor);
    mirrorEl.appendChild(document.createTextNode(value.slice(pos + 1)));
  }

  function printWelcome() {
    print("TINYTASKS/OS " + VERSION + " - type 'help'", "bright");
    let count;
    try { count = loadState(storage).tasks.length; } catch (e) { count = null; }
    if (count === null) print("warning: the stored task list is unreadable; run any command for details", "dim");
    else if (count === 0) print("no tasks yet. try: add buy milk", "dim");
    else print(count + (count === 1 ? " task" : " tasks") + " stored. try: list", "dim");
    if (!storage.persistent()) print(VOLATILE_WARNING, "err");
  }

  function run(line) {
    let result;
    try {
      result = execute(line, storage);
    } catch (e) {
      if (root.console) console.error(e);
      print("error: something went wrong (see the browser console)", "err");
      return;
    }
    if (result.clear) {
      cancel();
      outputEl.textContent = "";
      printWelcome();
    }
    result.lines.forEach(function (l) { print(l.text, l.cls); });
    if (result.download) triggerDownload(result.download);
    if (result.pickFile) openFilePicker(result.pickFile); // still inside the Enter keypress, as browsers require
    renderHeader();
  }

  /* Backup files: export downloads one, import reads one chosen in the browser's file dialog */

  const fileInputEl = document.getElementById("import-file");
  const MAX_IMPORT_BYTES = 2000000;
  let pendingImport = null;

  function triggerDownload(file) {
    const url = URL.createObjectURL(new Blob([file.text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function openFilePicker(options) {
    pendingImport = options;
    fileInputEl.value = ""; // so choosing the same file twice still fires "change"
    fileInputEl.click();
  }

  fileInputEl.addEventListener("change", function () {
    const file = fileInputEl.files && fileInputEl.files[0];
    const options = pendingImport || { replace: false };
    pendingImport = null;
    inputEl.focus();
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      print("error: cannot import " + file.name + ": file is too large for a task list", "err");
      return;
    }
    file.text().then(function (text) {
      let result;
      try {
        result = importText(text, file.name, storage, options.replace);
      } catch (e) {
        if (root.console) console.error(e);
        print("error: something went wrong (see the browser console)", "err");
        return;
      }
      result.lines.forEach(function (l) { print(l.text, l.cls); });
      renderHeader();
    }, function () {
      print("error: cannot read " + file.name, "err");
    });
  });
  fileInputEl.addEventListener("cancel", function () {
    pendingImport = null;
    inputEl.focus();
    print("import cancelled", "dim");
  });

  function submit() {
    const line = inputEl.value;
    inputEl.value = "";
    if (line.trim()) {
      printNow("> " + line, "echo");
      history.push(line);
      run(line);
    } else {
      printNow(">", "echo");
    }
    historyIndex = history.length;
    renderMirror();
    scrollToBottom();
  }

  // Any key finishes pending output; capture phase so it runs before Enter submits, and the key still reaches the input
  document.addEventListener("keydown", function () {
    if (queue.length) flush();
  }, true);
  // Paste and on-screen keyboards change the input without a keydown
  inputEl.addEventListener("input", function () {
    if (queue.length) flush();
  });

  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      // Scrolls the output only; the prompt's text and cursor stay as they are
      e.preventDefault();
      scrollPage(e.key === "PageUp" ? -1 : 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (!history.length) return;
      historyIndex += e.key === "ArrowUp" ? -1 : 1;
      historyIndex = Math.max(0, Math.min(history.length, historyIndex));
      inputEl.value = historyIndex < history.length ? history[historyIndex] : "";
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
      renderMirror();
    }
  });
  ["input", "keyup", "click", "select", "focus", "blur"].forEach(function (evt) {
    inputEl.addEventListener(evt, renderMirror);
  });
  // A selection-safe "click anywhere to focus"
  document.addEventListener("mouseup", function () {
    const selection = root.getSelection ? root.getSelection().toString() : "";
    if (!selection) inputEl.focus();
  });

  renderHeader();
  printWelcome();
  renderMirror();
  inputEl.focus();
})(typeof window !== "undefined" ? window : globalThis);
