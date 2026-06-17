## Summary

- Extended the durable decision index to retain latest issue, PR, retry, and merge decision snapshots from committed decision records.
- Updated planner smoke tests in the root repo and example packages to prove those state surfaces are reconstructable.

## Tests

- `bun test scripts/public-agent-planner.test.ts` in the root repo
- `bun test scripts/public-agent-planner.test.ts` in `examples/testbed`
- `bun test scripts/public-agent-planner.test.ts` in `examples/small-app`
- `bun test scripts/public-agent-planner.test.ts` in `examples/library`
- `bun test scripts/open-autonomy-fleet.test.ts` in the root repo
- `bun test scripts/open-autonomy-fleet.test.ts` in `examples/testbed`
