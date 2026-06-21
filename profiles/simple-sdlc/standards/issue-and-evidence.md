# Issue And Evidence Standard

Read this from every simple-sdlc skill.

## Issue Shape

- Work ztrack validates has `type:case` or `type:bug`.
- Non-canceled issues have an assignee.
- Bodies cite source markers such as `[1]`.
- Bodies include `## Acceptance Criteria`, `## Sources`, and `## Evidence`.

## Acceptance Criteria

ACs must be observable, testable, and small enough to prove with a commit and an
evidence row. Do not use subjective ACs like "code is clean".

## Checked AC Evidence

A checked AC must cite:

- a real git commit;
- at least one evidence id such as `[E1]`;
- a matching evidence row under `## Evidence`.

Example:

```markdown
- [x] dev/01 status: passed API returns 409 for insufficient stock. commit: abc1234 [E1]

## Evidence

- [E1] type: pr ac: dev/01 repo: example/app number: 12 head: main justification: Test covers insufficient stock branch.
```

For local-backend work with no PR, use truthful test evidence:

```bash
ztrack evidence add <issue> --type test --ac dev/01 --head <commit> --justification "<test/check that passed>"
ztrack ac check <issue> dev/01 --commit <commit> --evidence E1
```

Never invent commits, PR numbers, screenshots, videos, source text, or approvals.
If evidence does not exist, leave the AC pending.
