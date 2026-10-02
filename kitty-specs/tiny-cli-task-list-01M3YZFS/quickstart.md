# Quickstart: Tiny CLI Task List

Requires Python 3.10+. Run from the repository root with `src` on the path (for example `PYTHONPATH=src`, or `$env:PYTHONPATH="src"` in PowerShell).

```
python -m tinytasks add buy milk      # Added task 1: buy milk
python -m tinytasks list              # 1 [ ] buy milk
python -m tinytasks complete 1        # Completed task 1
python -m tinytasks list              # 1 [x] buy milk
python -m tinytasks delete 1          # Deleted task 1
python -m tinytasks list              # No tasks.
python -m tinytasks complete 99       # Error: no task with id 99  (exit 1)
```

Tasks are stored in `.tinytasks/tasks.json` under your home directory. Set `TINYTASKS_FILE` to use a different file.

Run the tests: `python -m unittest discover -s tests`
