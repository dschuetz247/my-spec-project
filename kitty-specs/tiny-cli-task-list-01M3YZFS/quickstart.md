# Quickstart: Tiny CLI Task List

Requires Node.js 20+. Run from the repository root; there is nothing to install.

```
node src/index.js add buy milk      # Added task 1: buy milk
node src/index.js list              # 1 [ ] buy milk
node src/index.js complete 1        # Completed task 1
node src/index.js list              # 1 [x] buy milk
node src/index.js delete 1          # Deleted task 1
node src/index.js list              # No tasks.
node src/index.js complete 99       # Error: no task with id 99  (exit 1)
```

Tasks are stored in `.tinytasks/tasks.json` under your home directory. Set `TINYTASKS_FILE` to use a different file.

Run the tests: `node --test`
