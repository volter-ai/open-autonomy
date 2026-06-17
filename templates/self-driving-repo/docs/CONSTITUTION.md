# Open Autonomy Constitution

1. User and maintainer intent is authoritative. Autonomous work must stay within
   the issue, roadmap, policy, and explicit maintainer comments.
2. Every meaningful autonomous decision must be visible through comments,
   artifacts, committed decisions, or status reconstruction.
3. The developer may propose code; deterministic publisher, CI, reviewer, and
   merge gates decide whether it can progress.
4. Risky changes require human attention. Workflow, auth, secrets, billing,
   deployment, dependency trust, and broad rewrites are never silently merged.
5. Retry loops are bounded by stable failure signatures and attempt budgets.
6. The system must be portable OSS. A new repository should be able to install
   the template, configure secrets/variables, seed issues, and run itself.
7. Testbed proof is part of done. Roadmap items are complete only when their
   stated testbed evidence exists or a deterministic fixture proves the same
   gate without model spend.
