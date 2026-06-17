Implemented issue #4 by extending the durable decision index to keep explicit latest snapshots for issue, PR, retry, and merge state, then proving those surfaces in the planner smoke tests across the root repo and the example package copies.

Changed files:
- [`scripts/public-agent-decision-index.ts`](/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-decision-index.ts)
- [`scripts/public-agent-planner.test.ts`](/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-planner.test.ts)
- Matching copies under `examples/testbed`, `examples/small-app`, and `examples/library`

Verification:
- `bun test scripts/public-agent-planner.test.ts` in the root repo
- `bun test scripts/public-agent-planner.test.ts` in `examples/testbed`
- `bun test scripts/public-agent-planner.test.ts` in `examples/small-app`
- `bun test scripts/public-agent-planner.test.ts` in `examples/library`
- `bun test scripts/open-autonomy-fleet.test.ts` in the root repo
- `bun test scripts/open-autonomy-fleet.test.ts` in `examples/testbed`

Artifacts written:
- [pr.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md)
- [result.json](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json)
- [transcript.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md)