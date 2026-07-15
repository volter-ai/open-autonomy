# R16 Paperclip live review

Date: 2026-07-15. Verdict: **PASS**.

## Exact identity

- Repository: `/mnt/c/users/porta/research/repos/paperclip`
- Commit: `90f85a7d11c517b1d09db90dbec97f4de7d96b83`
- Dependency closure: `sha256:cbbb995d3ed238ab6a4a0edd845206c5030183e815c53eddd1e7ebcc7613d7b9`
- Workspace build roots, byte-sorted: `packages/plugins/sdk/dist`, `packages/shared/dist`, `server/dist`
- Workspace build closure: `sha256:e7761c9e3a7f7d7a1dfd6c3b19a8ce1d77c5512f3faac57b44555af3304cab43`
- Runtime: `/usr/bin/node`, `v22.22.1`, `sha256:d0efb6fcb9d023ba4e2b160ec2384dc28fe4f17732141ef47f676828fa960505`
- Launcher: `server/node_modules/tsx/dist/cli.mjs`, `sha256:5d5b2a9f9cf4d6a8b44326b676417e00b42ad04037ed173b7af82ea8146a4fc0`
- Entrypoint: `server/src/index.ts`; its digest is the release pin's `executableDigest`.

The invocation is `/usr/bin/node <checkout>/server/node_modules/tsx/dist/cli.mjs <checkout>/server/src/index.ts`. Runtime, launcher, entrypoint, source tree, lockfile, dependencies, and selected build outputs are independently attested. The inherited controller executable is never used.

## Evidence

Deterministic command:

```text
bun test packages/core/src/organization-paperclip-deployment.test.ts
23 pass, 1 live skip, 0 fail, 61 assertions
```

Live command:

```text
PAPERCLIP_DEPENDENCY_DIGEST=sha256:cbbb995d3ed238ab6a4a0edd845206c5030183e815c53eddd1e7ebcc7613d7b9 \
PAPERCLIP_LIFECYCLE_ROOT=/home/porta/oa-r16-live \
OPEN_AUTONOMY_PAPERCLIP_LIFECYCLE_LIVE=1 \
bun test packages/core/src/organization-paperclip-deployment.test.ts
24 pass, 0 fail, 63 assertions, 378.23s
```

The live case provisioned the isolated checkout, started the real service, made a quiescent physical backup, restarted it, restored it, verified health and exact Git identity, and tore it down. Retained signed state recorded `status: destroyed`, verified teardown, `restoreEpoch: 1`, and `lifecycleGeneration: 4`. Inspection found no owned process and no checkout/data directory; only the signed tombstone and deliberately retained backup remained.

Before the final gate, a retained-checkout smoke returned `status=ok`, `deploymentMode=local_trusted`, `deploymentExposure=private`, `authReady=true`, `bootstrapStatus=ready`, and the exact full Git SHA.

## Counterexamples found and closed

- A backup raced PostgreSQL writes. Backup now stops the owned process, persists resume intent, snapshots quiescent data, and resumes deterministically.
- Archive hashing depended on tar metadata and hardlink representation. A canonical filesystem manifest now binds paths, bytes, modes, empty directories, and symlink targets while intentionally dereferencing hardlink topology.
- A copied dependency tree lost mode bits. Tar extraction now preserves permissions and the target closure is re-attested.
- Copying only `server/dist` omitted `@paperclipai/plugin-sdk`. An explicit, signed workspace build-root set and aggregate digest now fail closed on missing or substituted outputs.
- Launching `process.execPath` leaked Bun into the workload and failed on `node:sqlite`. The absolute Node runtime, version, and bytes are pinned and checked before every start.
- Plain `node server/dist/index.js` failed because the unpacked workspace's `@paperclipai/db` development export resolves TypeScript. The canonical monorepo TSX launcher and source entrypoint are now explicit, safe relative paths whose bytes are attested before every start.
- Deterministic tests cover operation equivocation, competing durable claims, crash reconciliation, stale fences, PID reuse, state tampering, backup loss/substitution, unhealthy partitions, runtime leakage, launcher substitution, and incomplete build closure.

## Accepted residuals

1. Paperclip 0.3.1 cannot physically delete the owned budgeted company through its native API; isolated deployment teardown is the declared erasure boundary.
2. The physical backup format is deliberately platform-bound; cross-platform archive conversion is outside R16.
3. Matched operational economics have not been measured, so this evidence makes no cost or performance ranking.
