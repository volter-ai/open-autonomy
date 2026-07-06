# OA-05: preflight must probe-load termfleet's actual PTY module instead of checking for a compiled artifact

**Finding:** F-5 — `open-autonomy preflight` hard-fails FALSELY on a healthy environment, printing "rebuilt dependencies successfully" and "node-pty rebuild FAILED — install the build toolchain" in the same run (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P1
**Fix target:** open-autonomy

## Problem

`npx open-autonomy preflight` is the first documented command after installing the runner deps (docs/OPERATIONS.md:97, docs/INSTALL-AGENT.md:186), and its gate says "FAILED — fix the item(s) above and re-run" (bin/preflight.ts:114). On a perfectly healthy environment — Node 22, `termfleet@0.2.0` installed, its PTY dependency `@homebridge/node-pty-prebuilt-multiarch@0.13.1` present with a matching prebuilt that loads fine — preflight exits 1 with contradictory output: npm's own "rebuilt dependencies successfully" immediately followed by preflight's "node-pty rebuild FAILED — install the build toolchain (Xcode CLT / build-essential)". The prescribed remedy is unfixable noise (the toolchain being present changes nothing), so a compliant adopter is stuck at the very first gate. The one safety net the install has cries wolf.

## Root cause (verified file:line citations)

All in `bin/preflight.ts` (delegated from the CLI at `bin/open-autonomy.ts:47-48`):

- **The health test checks for a compiled artifact that a healthy prebuilt install never has.** `bin/preflight.ts:27-28`:
  ```ts
  const PTY = 'node_modules/@homebridge/node-pty-prebuilt-multiarch';
  const ptyBuilt = () => ['build/Release/pty.node', 'build/Debug/pty.node'].some((p) => existsSync(join(cwd, PTY, p)));
  ```
  Verified against the published package (`termfleet@0.2.0` → `@homebridge/node-pty-prebuilt-multiarch@0.13.1`, Node v22.23.1, linux-x64): a fresh install has **no `build/` directory at all**. The package loads its native binding from `prebuilds/<platform>-<arch>/node.abi<N>.node` via `lib/prebuild-loader.js` (which requires the path exported by `lib/prebuild-file-path.js`, falling back to `../build/Release/pty.node` only when no prebuild matches). `node -e "require('@homebridge/node-pty-prebuilt-multiarch')"` succeeds. So `ptyBuilt()` returns **false on a healthy environment**.
- **The "rebuild" it then runs is a no-op that reports success.** `bin/preflight.ts:37-38` runs `npm rebuild @homebridge/node-pty-prebuilt-multiarch` with `stdio: 'inherit'`. The package's `install` script is `node scripts/check-prebuild.js || prebuild-install --verbose || node scripts/install.js` — `check-prebuild.js` finds the matching prebuild and exits 0, so nothing compiles, no `build/` dir is created, and npm prints **"rebuilt dependencies successfully"** straight to the operator's terminal (verified by running the exact command).
- **The re-check then contradicts it.** `bin/preflight.ts:39-40`: `ptyBuilt()` is still false → `warn('node-pty rebuild FAILED — install the build toolchain …')`, which sets `failed = true` (:22) → `bin/preflight.ts:114-115` prints `preflight: FAILED` and exits 1. Hence the simultaneous success/failure output the audit recorded.
- **The module name and location are hardcoded** (`bin/preflight.ts:27`, plus the skip check at :32-35): preflight assumes (a) termfleet's PTY dep is exactly `@homebridge/node-pty-prebuilt-multiarch` forever, and (b) it is hoisted to the repo's top-level `node_modules`. Either assumption breaking (termfleet swaps PTY libs; npm nests the dep under `node_modules/termfleet/node_modules/`) silently degrades the check to a skip or a false result.
- **Audit-report note:** §2 F-5 says preflight "checks `node-pty` while termfleet ships `@homebridge/node-pty-prebuilt-multiarch`". In *this* clone's source the package **name** is correct (see :27); the false failure comes from testing the wrong **artifact** (`build/Release/pty.node`) instead of loadability. The observable behavior matches the audit exactly; only the mechanism differs (see the final-message misdiagnosis note).
- Collateral doc/text sites repeating the "rebuilds node-pty" framing: `docs/OPERATIONS.md:91-94`, `docs/INSTALL-AGENT.md:181-183`, `bin/open-autonomy.ts:20` (help line), `bin/autonomy-compile.ts:138` (next-steps print), `bin/preflight.ts:7-9` (header comment).

## Proposed fix

Replace `ensureNodePty()` (`bin/preflight.ts:31-41`) with a load-probe-driven `ensurePtyModule()`; delete `PTY`/`ptyBuilt()` (:27-28).

1. **Discover the module termfleet actually depends on — at runtime, never hardcoded.** Locate termfleet's installed `package.json` (`node_modules/termfleet/package.json`; if absent, keep today's skip note :32-35 — "run after `npm install termfleet`"). Pick the PTY dep as the `dependencies` key matching `/node-pty/i` (today that yields `@homebridge/node-pty-prebuilt-multiarch@^0.13.1`; verified in the published `termfleet@0.2.0`). If no key matches, note "termfleet declares no node-pty dependency — skip" and do not fail.
2. **Resolve its installed location honoring nesting:** check `<cwd>/node_modules/<name>` first, then `<cwd>/node_modules/termfleet/node_modules/<name>` (npm places it there when hoisting is blocked). If neither exists, warn actionably ("termfleet's PTY dependency <name> is not installed — re-run `npm install`").
3. **Health = a load probe, not an artifact path.** Run `spawnSync('node', ['-e', 'require(process.argv[1])', ptyDir])` — `node` explicitly (the termfleet provider runs under Node; preflight itself may run under bun via `bun bin/open-autonomy.ts`, whose ABI is not the one that matters). Probe exit 0 → `note('<name> loads under node <version> (termfleet provider can start) ✓')` → done. This is the case that falsely fails today.
4. **Rebuild only when the probe fails, and judge the rebuild by a re-probe.** On probe failure: print the probe's stderr tail (the *real* error — e.g. `Cannot find module '.../pty.node'` or an ABI mismatch), run `npm rebuild <name>` with output **captured**, then re-probe. Re-probe passes → single success line (`rebuilt for node <version> ✓`). Re-probe fails → one failure block: the captured rebuild output tail + the re-probe error + the toolchain advice (`bin/preflight.ts:40`'s wording, now actually applicable). Never let npm's "rebuilt dependencies successfully" reach the terminal on a path that ends in FAILED — that is the contradictory-output bug; capturing (dropping `stdio: 'inherit'` at :38) plus deciding success solely by the re-probe makes the output consistent by construction.
5. **Text sweep:** update the sites that promise "rebuilds node-pty" to "verifies termfleet's PTY native module loads (rebuilding only if needed)": `docs/OPERATIONS.md:91-94`, `docs/INSTALL-AGENT.md:181-183`, `bin/open-autonomy.ts:20`, `bin/autonomy-compile.ts:138`, `bin/preflight.ts:7-9`.
6. **Tests** (new `bin/preflight.test.ts`, following `bin/ztrack-preset.test.ts`'s pattern of testing an extracted helper): fixture-driven units for the dep-name discovery (a fixture termfleet `package.json` with a renamed dep, e.g. `node-pty-next`, must be picked up), the no-pty-dep skip, the nested-location resolution, and probe-success ⇒ no rebuild invocation (inject the spawn seam).

## Alternatives rejected

- **Add `prebuilds/` to the artifact glob** (i.e. `ptyBuilt()` also matching `prebuilds/<plat>-<arch>/node.abi<N>.node`). Cheaper, but keeps guessing the package's internals: the ABI-number/musl matrix, platform naming, and loader fallback order are the package's business and change across its versions — this is exactly how the current check rotted. Loadability is the property preflight actually cares about; probe it directly.
- **Keep the hardcoded module name.** The check would break again the day termfleet swaps PTY implementations (it already ships a fork, not upstream `node-pty`); reading termfleet's declared deps at runtime is the same cost and tracks reality. (Also explicitly requested by the finding.)
- **Import the module in-process instead of a `node -e` child.** Preflight may run under bun (`package.json:38`), whose native-module ABI is not what the provider will use at runtime; an in-process probe can pass where node fails (or vice versa) and crashing the preflight process on a bad `.node` is unrecoverable. A child probe with the right executable is isolated and reports cleanly.
- **Demote the pty failure to a warning so it can't block.** Wrong direction: on a genuinely broken pty the provider crashes at first launch — a hard fail with the real error is precisely preflight's job. The fix is accuracy, not leniency.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **Healthy env passes (the audit's false alarm).** `R=$(mktemp -d); cd $R && npm init -y && npm install termfleet && npx open-autonomy preflight; echo $?` on Node 22.x with a matching prebuild (linux-x64/macOS default). *Today:* exit 1, output contains both `rebuilt dependencies successfully` and `node-pty rebuild FAILED`. *After:* exit 0; output contains one PTY line ending `✓` naming `@homebridge/node-pty-prebuilt-multiarch`, and contains neither `rebuild FAILED` nor `rebuilt dependencies successfully`.
2. **No rebuild is attempted when the probe passes.** Same run as (1): output contains no `npm rebuild` invocation/noise (assert via the captured output and/or the spawn-seam unit test). *Today:* `npm rebuild` runs on every healthy env.
3. **Genuine breakage still fails usefully.** In the repo from (1): `P=node_modules/@homebridge/node-pty-prebuilt-multiarch; mv $P/prebuilds $P/prebuilds.bak` then (in an environment without a working build toolchain, e.g. a slim Node container) `npx open-autonomy preflight; echo $?` → exit 1; output contains the real loader error (the failing `require`'s message) and the toolchain advice; output does **not** contain any `✓`/success line for the PTY check. *Today:* fails too, but with the contradictory success+failure pair and without the underlying loader error.
4. **Success/failure output is mutually exclusive (consistency).** For both (1) and (3): `out=$(npx open-autonomy preflight 2>&1)`; assert NOT both `echo "$out" | grep -q '✓.*pty\|pty.*✓'` and `echo "$out" | grep -qi 'FAILED'` for the PTY section. *Today:* violated (audit transcript + reproduction).
5. **Dep-name discovery is dynamic.** Unit test (`bun test bin/preflight.test.ts`): fixture `node_modules/termfleet/package.json` declaring `"node-pty-next": "^1.0.0"` → the check targets `node-pty-next`; fixture with no `/node-pty/i` dep → the check notes the skip and does not fail. *Today:* no such test exists and the name is a constant (`bin/preflight.ts:27`).
6. **Nested install location is found.** Unit test: PTY fixture only at `node_modules/termfleet/node_modules/<name>` → probed there, not reported as missing. *Today:* only the hoisted path is checked (`bin/preflight.ts:27,32`).

## Dependencies (OA-XX edges + reason)

- **None hard.** This is self-contained in `bin/preflight.ts` + text sites.
- **OA-04 / OA-06 (soft, same file):** both add checks to the same `bin/preflight.ts:111-115` driver. Land OA-05 **first** — it fixes the gate everyone else's checks live behind (a gate that false-fails buries any new check's output) and settles the shared output helpers (`note`/`warn`, plus the consistency rule in step 4 that new checks must follow).

## Provenance

- Authored 2026-07-06 by Claude (Fable 5), adoption-fixes spec pass on branch `adoption-fixes-backlog` @ `2fa5614`, from OA-INSTALL-AUDIT-FINDINGS.md (F-5; narrative §1 phase 3 step 2; §4 row 1).
- Source verified in this clone: `bin/preflight.ts:7-9,22,27-28,31-41,111-115`, `bin/open-autonomy.ts:20,47-48`, `bin/autonomy-compile.ts:138`, `docs/OPERATIONS.md:91-98`, `docs/INSTALL-AGENT.md:181-186`, `package.json:38` (bun entrypoint).
- Empirical reproduction (scratchpad, Node v22.23.1, npm 11.12.1, linux-x64): installed published `termfleet@0.2.0` (deps include `"@homebridge/node-pty-prebuilt-multiarch": "^0.13.1"`); observed no `build/` dir, prebuilds under `prebuilds/linux-x64/node.abi{108..137}[.musl].node`, successful `require` probe; ran `npm rebuild @homebridge/node-pty-prebuilt-multiarch` → "rebuilt dependencies successfully", still no `build/` dir (install script `node scripts/check-prebuild.js || prebuild-install --verbose || node scripts/install.js` short-circuits on the prebuild); inspected `lib/prebuild-loader.js` (requires `ptyPath || '../build/Release/pty.node'`).
