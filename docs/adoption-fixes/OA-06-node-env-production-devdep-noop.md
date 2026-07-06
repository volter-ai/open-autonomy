# OA-06: preflight must detect NODE_ENV=production / npm omit=dev, which turns `npm install -D ztrack` into a silent no-op

**Finding:** F-6 — `NODE_ENV=production` makes the tracker install silently no-op: `npm install -D ztrack` "succeeds" without installing, producing an unresolvable preset later, and ztrack's own hint prescribes the same no-op command (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P1
**Fix target:** open-autonomy

## Problem

On a box with `NODE_ENV=production` (or any npm config that yields `omit=dev`), `npm install -D ztrack` exits 0, **writes** `ztrack` into `devDependencies`, and installs **nothing** (verified: exit 0, pin added to `package.json`, `node_modules/` untouched). The documented flow (docs/OPERATIONS.md step 5, docs/INSTALL-AGENT.md Phase 3) then hits `ztrack init` / `ztrack check` failures because the installed preset `import`s `ztrack/preset-kit` from the repo's `node_modules` — and ztrack's own warning tells the operator to run the exact command that just no-opped. Nothing in the docs mentions `NODE_ENV`, and preflight — whose stated job is exactly this class ("make an adopter repo install-ready, STRUCTURALLY, so the environment gotchas the first live install hit never reach the operator", bin/preflight.ts:2-4) — never checks it.

## Root cause (verified file:line citations)

- **Preflight has no environment/omit check.** The whole check inventory is the driver at `bin/preflight.ts:111-115`: `ensureNodePty()` (:31-41) and `verifyLock()` (:69-109). Neither reads `NODE_ENV`, `npm_config_*`, or `npm config get omit`. (The header comment :2-9 claims preflight owns "the environment gotchas"; this one is missing.)
- **npm behavior (verified, npm 11.12.1):** with `NODE_ENV=production`, `npm config get omit` → `dev`, and `NODE_ENV=production npm install -D <pkg>` exits **0**, adds the pin to `devDependencies`, and installs nothing into `node_modules` — the worst shape: the package.json diff *looks* like a successful install. Also verified: `--include=dev` overrides the omission (`NODE_ENV=production npm install -D <pkg> --include=dev` does install), as does `NODE_ENV=development …`.
- **The docs' install lines carry no caveat:**
  - `docs/OPERATIONS.md:199-201` (§ "5. Give the loop work" → local-git code host): `npm install -D ztrack` with the comment explaining it must resolve from the repo — but nothing about `NODE_ENV`.
  - `docs/OPERATIONS.md:222` (same section, GitHub code host flavor): `npm install -D ztrack    # or: bun add -d ztrack`.
  - `docs/INSTALL-AGENT.md:180` (Phase 3 — EXECUTE, step 1): `npm install -D ztrack            # or: bun add -d ztrack    (a PROJECT dep so its preset resolves)`.
  - (Contributing context: `docs/OPERATIONS.md:97` and `docs/INSTALL-AGENT.md:186` place `npx open-autonomy preflight` in the flow — OPERATIONS runs preflight at step 1 *before* the ztrack install at step 5, INSTALL-AGENT runs it right *after* both installs — so the preflight check must work in both orders; see Proposed fix.)

## Proposed fix

### 1. New preflight check (`bin/preflight.ts`)

Add `checkDevDepInstallability()`, run **first** in the driver (before `ensureNodePty()` at :112) — a poisoned install environment explains any later missing-module symptom, so it must print first.

1. **Detect the effective omission**, not just the env var: `run('npm', ['config', 'get', 'omit'])` (the existing `run` helper, :23-24) and test whether the output contains `dev`. This catches `NODE_ENV=production`, `npm_config_omit=dev`, `--omit=dev` persisted in any `.npmrc`, and the legacy `production=true` config — all funnel into `omit`. Read `process.env.NODE_ENV` too, only to make the message name the actual cause.
2. **When dev deps are omitted:**
   - **Always** print a prominent caution naming cause, consequence, and the exact override, e.g.:
     `preflight: ! this environment omits devDependencies (NODE_ENV=production → npm omit=dev): 'npm install -D ztrack' will exit 0 and install NOTHING. Override: NODE_ENV=development npm install -D ztrack   (or: npm install -D ztrack --include=dev)`
   - **Escalate to a hard failure** (the existing `warn()` path, :22, so the gate at :114-115 exits 1) only when there is concrete evidence the no-op already happened: some key of the repo's `package.json` `devDependencies` has no `node_modules/<name>/package.json`. Name the missing package(s) in the failure line.
   - The always-caution branch needs a third output helper (e.g. `caution()`: prints the `!` line **without** setting `failed`) since today's `warn()` (:22) always fails the gate.
3. **Why two tiers:** OPERATIONS' order runs preflight *before* ztrack is declared (steps 1 vs 5, :97 vs :199), so preflight cannot require ztrack's presence — the non-fatal caution primes the operator for step 5. INSTALL-AGENT's order (:179-186) runs it *after* both installs — there a `NODE_ENV=production` no-op has already produced a declared-but-missing devDependency, and the check hard-fails with the exact repair command. A box whose devDeps all resolve (operator already used the override) gets the caution only and **passes** — preflight must not cry wolf (the F-5 lesson).

### 2. Docs: one-line caveat at each install line

- `docs/OPERATIONS.md` — after the `npm install -D ztrack` comment block at :199-201, add one line inside the code block:
  `# NODE_ENV=production makes this a silent no-op (npm omits devDependencies) — use: NODE_ENV=development npm install -D ztrack`
  and mirror the same one-liner as a comment at the GitHub-flavor install, :222.
- `docs/INSTALL-AGENT.md` — extend the Phase-3 step-1 line at :180 (or the comment block :181-185 immediately below) with the same one-liner, so the installing agent checks `NODE_ENV` before declaring the install done. (`npx open-autonomy preflight` at :186 will now also catch it mechanically.)

## Alternatives rejected

- **Check only `process.env.NODE_ENV`.** Misses `.npmrc` `omit=dev`/`production=true` and `npm_config_omit` — the same silent no-op with no `NODE_ENV` set. `npm config get omit` is the single value npm itself consults; test the effective config, not one of its inputs.
- **Have preflight auto-run the corrected install** (`npm install --include=dev`). Preflight's contract is verify-and-instruct, not mutate the host's dependency state — an install it runs unbidden is exactly the "install step mutates the host beyond its remit" class of F-17/OA-17. Print the command; let the operator run it.
- **Hard-fail whenever omit=dev, regardless of evidence.** Would fail healthy boxes where the operator already installed with the override (all devDeps present) and boxes running preflight before ztrack is declared — reintroducing the false-positive gate F-5 just taught us to remove.
- **Docs-only fix.** The audit shows the failure is invisible at the moment it happens (exit 0, plausible package.json diff); a caveat helps but only the mechanical check (preflight is "whose job this is", per F-6) reliably catches a box-level env var the operator forgot about.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **Warning emitted on a production-env box.** `R=$(mktemp -d); cd $R && npm init -y && npm install termfleet && NODE_ENV=production npx open-autonomy preflight 2>&1 | grep -i 'NODE_ENV'` — *Today:* no output (preflight never mentions it; silent). *After:* prints the caution naming `NODE_ENV=production`/`omit=dev`, the consequence ("install NOTHING"), and both override forms (`NODE_ENV=development npm install -D ztrack`, `--include=dev`); with all declared devDeps resolvable the exit code is unchanged by this check (caution, not failure).
2. **Evidence of a no-op hard-fails with the repair command.** In `$R`: `NODE_ENV=production npm install -D ztrack` (verified today: exit 0, installs nothing, writes the pin), then `NODE_ENV=production npx open-autonomy preflight; echo $?` — *Today:* nothing about ztrack/NODE_ENV in the output. *After:* exit 1; the failure line names `ztrack` as declared-but-missing and prints the exact override command.
3. **No noise on a healthy box.** In `$R` with `NODE_ENV` unset and no `omit` config: `npx open-autonomy preflight 2>&1 | grep -ci 'NODE_ENV\|omit'` → 0 (the check stays silent or prints a single unobtrusive OK note; it never warns). Also passes when `NODE_ENV=production` but every declared devDependency resolves (caution only, exit unaffected).
4. **`.npmrc`-driven omission is caught without NODE_ENV.** `cd $R && unset NODE_ENV && echo 'omit=dev' > .npmrc && npx open-autonomy preflight 2>&1 | grep -qi 'omit'` → matches (caution emitted). *Today:* silent. (Cleanup: `rm .npmrc`.)
5. **Docs carry the caveat.** `grep -n 'NODE_ENV' docs/OPERATIONS.md docs/INSTALL-AGENT.md` — *Today:* no hits in either file's install steps (verified). *After:* ≥1 hit adjacent to `docs/OPERATIONS.md:199-201`, ≥1 adjacent to `docs/OPERATIONS.md:222`, ≥1 in `docs/INSTALL-AGENT.md`'s Phase-3 step-1 block (:178-186), each including the `NODE_ENV=development npm install -D ztrack` override.
6. **Unit test for the omit parser/decision** (new case in `bin/preflight.test.ts`, run `bun test bin/preflight.test.ts`): omit containing `dev` + missing declared devDep ⇒ fail; omit containing `dev` + all devDeps present ⇒ caution only; omit empty ⇒ silent. *Today:* no such test exists.

## Dependencies (OA-XX edges + reason)

- **OA-05 (soft, ordering):** same file (`bin/preflight.ts`); land OA-05 first so (a) the gate this check reports through no longer false-fails on healthy environments (its exit-code semantics in AC 1-3 presume the pty check passes on a healthy box), and (b) the `note`/`warn`/`caution` helper split is settled once.
- **OA-04 (soft, same file):** agreed check order in the driver: env/omit (this) → collisions (OA-04) → pty → lockfile.
- **OA-17 (soft, same doc block):** OA-17 amends the same INSTALL-AGENT Phase-3 step-1 block (:178-186) and OPERATIONS install lines — coordinate wording so the block gains one coherent caveat paragraph, not two colliding edits.

## Provenance

- Authored 2026-07-06 by Claude (Fable 5), adoption-fixes spec pass on branch `adoption-fixes-backlog` @ `2fa5614`, from OA-INSTALL-AUDIT-FINDINGS.md (F-6; narrative §1 phase 3 step 9; §4 row 4).
- Source verified in this clone: `bin/preflight.ts:2-9,22,23-24,31-41,69-109,111-115`, `docs/OPERATIONS.md:97,199-201,222`, `docs/INSTALL-AGENT.md:178-186`; `grep -n NODE_ENV docs/OPERATIONS.md docs/INSTALL-AGENT.md bin/preflight.ts` → no hits.
- Empirical verification (scratchpad, Node v22.23.1, npm 11.12.1, linux-x64): `NODE_ENV=production npm install -D left-pad` → exit 0, `left-pad` written to `devDependencies`, `node_modules/` empty; `NODE_ENV=production npm config get omit` → `dev` (empty when unset); `NODE_ENV=production npm install -D left-pad --include=dev` → package actually installed (override confirmed).
