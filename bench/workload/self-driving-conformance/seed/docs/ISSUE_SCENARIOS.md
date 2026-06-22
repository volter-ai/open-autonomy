# Issue Scenarios

Use this repository for disposable live issues that prove open-autonomy behavior.
The canonical matrix is in `docs/TEST_MATRIX.md`; completed runs are recorded in
`docs/TEST_RUNS.md`.

## Seeding Issues

Preview the standard scenarios:

```bash
bun run testbed:seed
```

Create every scenario in the live testbed:

```bash
bun run testbed:seed -- --apply --all
```

Create one scenario:

```bash
bun run testbed:seed -- --apply --scenario pm-needs-info
```

The seed script writes issue bodies with expected outcomes so the issue itself
is the live test checklist.

## Current Priority

1. Risky workflow escalation.
2. Human follow-up after `needs-info`.
3. PM review routing when an agent PR is already open.
4. Issue-level pause/status/resume.
5. Repo-level pause/resume.
6. Synthetic CI and reviewer retry loops.
