# Constitution

## North Star

Build the best browser-based regex playground: a fast, offline, single-page web app for
writing, testing, and understanding regular expressions. "Best" is measured against a moving
frontier of developer tools, so the north star is a permanent direction of improvement, never a
finish line. It is authoritative and changes only by deliberately amending this document.

## Merit Criteria

"Better" is judged along these human-owned dimensions:
- **Correctness:** matches a real regex engine's behavior, including flags and edge cases.
- **Clarity:** matches, capture groups, and errors are visibly and understandably explained.
- **Immediacy:** instant feedback, fully offline, no signup or backend.
- **Breadth:** flags, replace/substitution, and a library of common patterns.
- **Shareability:** the full playground state can be captured in a URL.

The strategist and planner pursue these criteria; they may not edit them. An optimizer must
never author the criteria that judge it — humans own the measuring stick, and it changes only by
amending this document.

## Rules

1. User and maintainer intent is authoritative. Autonomous work must stay within
   the issue, roadmap, policy, and explicit maintainer comments.
2. Every meaningful autonomous decision must be visible through comments,
   artifacts, committed decisions, or status reconstruction.
3. The developer may propose code; deterministic publisher, CI, reviewer, and
   merge gates decide whether it can progress.
4. Risky changes require human attention. Workflow, auth, secrets, billing,
   deployment, dependency trust, and broad rewrites are never silently merged.
5. Retry loops are bounded by stable failure signatures and attempt budgets.
6. Capabilities are complete only when demonstrated by committed evidence or a
   deterministic test, not merely asserted.
