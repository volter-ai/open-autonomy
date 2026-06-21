# Goal: a command-line todo app people would actually use

Build a small but real CLI todo application in this repository.

A user should be able to:

- add a task with a short description
- list their tasks, seeing which are done
- mark a task complete
- delete a task

Tasks must persist between runs (so a task added now is still there next invocation). The tool should
have a helpful `--help`, behave sanely on bad input (unknown commands, missing arguments, unknown task
ids, an empty store), and never crash with a raw stack trace.

Treat this as production work, not a demo: include automated tests that exercise the real commands, keep
the code readable and cohesive, and keep the scope tight — don't gold-plate with features nobody asked
for. "Done" means a reviewer can clone the repo, follow the README, and use every command successfully.

The language/runtime and storage format are your call; pick something simple and justify it briefly in
the README.
