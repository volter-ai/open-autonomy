# OA-14: `claude --version` does not verify sign-in — use a real auth probe (`claude auth status`) in docs and preflight

**Finding:** F-13 — wrong verification advice: `claude --version` does not verify sign-in; a logged-out user finds out ~45s into the first real launch (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P2
**Fix target:** open-autonomy

## Problem

The docs' only sign-in verification for the default coding CLI is `claude --version`, which succeeds identically signed-in or signed-out (verified during the audit, Phase 2, on claude CLI 2.1.201). A logged-out operator passes every documented check and first learns the truth when the loop's initial launch dies after the ~45s timeout the docs themselves warn about — inside a tmux session, on the box's dime. Neither doc's preflight actually checks agent auth at all, even though sign-in is called out as load-bearing in both.

## Root cause (verified citations; mark termfleet-dist citations as such)

- `docs/OPERATIONS.md:106-107` — the exact wrong advice: "**Claude Code (default):** run `claude`, then `/login` (or set `ANTHROPIC_API_KEY`). Verify with `claude --version`." `claude --version` prints the version string from the installed binary; it performs no credential read or API call and exits 0 regardless of auth state (audit §1 Phase 2: "succeeds logged-out").
- `docs/OPERATIONS.md:102-104` — the same doc knows the stakes: "that CLI must already be **installed on PATH and signed in** — the launch fails after ~45s against a missing or logged-out CLI."
- `docs/INSTALL-AGENT.md:67-68` — Phase 0 ("PREFLIGHT — tools + auth; stop if any fails") lists "**A coding CLI (Claude Code / Codex) installed and signed in**" as a bullet, but the Phase-0 snippet (`docs/INSTALL-AGENT.md:53-59`) checks only `command -v` for bash/node/git/gh/curl/tmux and `gh auth status` — there is **no check of coding-CLI auth at all**, so the "stop if any fails" gate cannot fire on the one credential the agents cannot run without. `docs/INSTALL-AGENT.md:240` repeats "claude → /login" as a comment with no verification.
- `bin/preflight.ts:111-115` — the CLI `preflight` verb runs exactly two checks, `ensureNodePty()` and `verifyLock()`; agent auth is out of scope today, though the file's charter is "make an adopter repo install-ready … so the environment gotchas the first live install hit never reach the operator" (`bin/preflight.ts:2-5`).
- What the claude CLI actually offers (investigated non-interactively on this box, claude CLI **2.1.201** — the same version as the audit box): `claude auth --help` exposes `login`, `logout`, and **`status [--json|--text]`** ("Show authentication status"). `claude auth status --json` returns instantly, offline, with `{"loggedIn": true|false, "authMethod": …, "apiProvider": …, "subscriptionType": …}` (verified signed-in output on this box; exit 0). This is the CLI's own auth-status command — no model call, no cost, no interactivity.

## Proposed fix

**1. Replace the documented check** at `docs/OPERATIONS.md:107`:

```bash
claude auth status --json | grep -q '"loggedIn": true' || echo "NOT signed in — run: claude /login"
```

Parse the JSON field, **not** the exit code — the signed-in exit code is verified 0, but the signed-out exit code of `auth status` is unverified on 2.1.201, so the field test is the deterministic contract either way. Keep the existing `ANTHROPIC_API_KEY` alternative honest: with a key exported, launches work regardless of `loggedIn`, so the documented check is "`loggedIn: true` **or** `ANTHROPIC_API_KEY` is set (`test -n "$ANTHROPIC_API_KEY"`)".

**2. Add the same probe to INSTALL-AGENT Phase 0** (`docs/INSTALL-AGENT.md:53-59` snippet), alongside `gh auth status`, so the "stop if any fails" gate actually covers agent auth. For the Codex alternative (`TERMFLEET_AGENT=codex`), the equivalent is `codex login status` — the builder must verify that subcommand's name/exit behavior against the codex CLI version the docs pin, since this spec verified only the claude side.

**3. Adopt it in `preflight`** (`bin/preflight.ts`): a third check `ensureAgentAuth()` called from the main sequence at `bin/preflight.ts:111-113`:
- Resolve the harness the loop will actually use (`TERMFLEET_AGENT` env, default `claude` — same resolution as `packages/substrate-local/src/runner-config.ts:5-7`).
- If `ANTHROPIC_API_KEY` is set (claude) → pass with a note.
- Else run `claude auth status --json` (wrap in a ~10s timeout for safety) and check `loggedIn === true`. Signed out → `warn(...)` with the `/login` remedy (uses the existing `warn` at `bin/preflight.ts:22`, so it fails the gate — this is a hard prerequisite, unlike advisory checks).
- If the subcommand doesn't exist (older CLI): do **not** false-fail; note "cannot verify sign-in on this claude version — upgrade, or verify manually with a one-off `claude -p` call", and leave the gate green. Feature-detect via `claude auth status --json`'s exit/stderr, not version parsing.

**4. Tradeoffs, stated honestly (and the optional deep probe).** `auth status` reads stored credentials; it proves *presence*, not *server-side validity* — a revoked/expired OAuth token or a dead key could still show `loggedIn: true`/key-set. The only end-to-end proof is a real model call: `timeout 60 claude -p 'reply with exactly: ok' >/dev/null` — which costs one (tiny) billed request and seconds-to-tens-of-seconds of latency, and hangs without the timeout guard in some failure modes. Recommendation: `auth status` is the default documented/preflight check (free, instant, catches the actual observed failure class — never-logged-in boxes); the `-p` probe goes into the deeper self-verifying `doctor`/verify step the audit's §5 calls for, not into every preflight run. Document both and why.

## Alternatives rejected

- **`claude -p` probe as the default check** — reliable end-to-end but costs a billed model call and real latency on every preflight/doc-walk, and needs timeout scaffolding; wrong default for a check that runs repeatedly. Kept as the optional deep probe (doctor tier).
- **Checking credential files directly** (e.g. `~/.claude/.credentials.json`, macOS Keychain) — undocumented storage internals that differ per OS/auth method (`claude --help`'s `--bare` text confirms multiple stores: OAuth, keychain, apiKeyHelper) and can break on any CLI release; `auth status` is the CLI's own supported answer to exactly this question.
- **`claude doctor`** — aimed at the auto-updater/installation health, potentially interactive, and its help warns it spawns `.mcp.json` stdio servers from the cwd — unsuitable as a scripted auth probe in an untrusted adopter repo.
- **Relying on `auth status`'s exit code instead of the JSON field** — the signed-out exit code is unverified (could plausibly be 0 with `loggedIn:false`, since `--json` is the default output mode); grepping the field is version-stable and unambiguous. AC-1 pins the real behavior.
- **Leaving it to the ~45s launch failure + troubleshooting entry** (`docs/OPERATIONS.md:332-334`) — that is the status quo the audit flagged: the failure is late, costs a launch cycle, and surfaces inside tmux where a cold adopter isn't looking.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **The documented check fails on a logged-out box.** Setup: a shell where claude has no credentials (e.g. `HOME=$(mktemp -d) XDG_CONFIG_HOME=$HOME/.config claude auth status --json`, or a box after `claude auth logout`; ensure `ANTHROPIC_API_KEY` is unset). Test: the check now printed at `docs/OPERATIONS.md` § "Sign in to your coding agent" exits nonzero / prints "NOT signed in". **Fails today**: today's documented check (`claude --version`, OPERATIONS.md:107) exits 0 and prints `2.1.201 (Claude Code)` on that same box. (This AC also pins the real signed-out `auth status` output/exit, replacing the inference noted above.)
2. **The documented check passes signed-in.** On a signed-in box: `claude auth status --json | grep -q '"loggedIn": true'` exits 0 (verified on claude 2.1.201). Passes today and after — guard against regression to a check that fails signed-in.
3. **Preflight gates on it.** On the logged-out setup of AC-1: `npx --yes open-autonomy preflight` prints a `preflight: !` warning naming the signed-out coding CLI with the `/login` remedy and exits 1. **Fails today** (preflight runs only node-pty + lockfile checks, `bin/preflight.ts:111-115`, and passes on a logged-out box).
4. **API-key path not false-flagged.** Same logged-out setup plus `ANTHROPIC_API_KEY=dummy-set`: preflight's auth check passes (with a note that a key is in use). Fails today trivially (no check exists to get right); must hold after.
5. **Older-CLI degradation.** With a stub `claude` on PATH that errors on `auth status` (simulating a pre-`auth`-subcommand version): preflight prints the "cannot verify — upgrade or probe manually" note and does **not** fail the gate on that check alone.
6. **No doc still claims `--version` verifies sign-in.** `grep -n 'claude --version' docs/OPERATIONS.md docs/INSTALL-AGENT.md README.md` returns no hit in a sign-in-verification context (today: OPERATIONS.md:107). INSTALL-AGENT's Phase-0 snippet (`docs/INSTALL-AGENT.md:53-59`) contains a coding-CLI auth line (today: none).

## Dependencies (OA-XX edges + reason)

- **OA-16** (canonical local-install checklist) — the corrected sign-in check is one of the checklist's load-bearing steps ("deps → preflight → …"); land this wording first (or together) so OA-16 canonicalizes the real probe.
- **F-5's preflight fix (spec id outside this batch)** — shares `bin/preflight.ts`; coordinate so the new auth check follows the same warn/fail conventions the F-5 rework establishes (and so preflight's credibility is restored before it gains another hard gate).
- Independent of OA-09 and OA-13 (different doc lines and code paths).

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-13, §1 Phase 2 (claude CLI 2.1.201 present; `claude --version` succeeds logged-out), §5 (the self-verifying doctor recommendation the deep probe slots into).
- Repo source (branch `adoption-fixes-backlog`): `docs/OPERATIONS.md:100-112,106-107,332-334`; `docs/INSTALL-AGENT.md:48-70,53-59,67-68,240`; `bin/preflight.ts:2-5,21-25,111-115`; `packages/substrate-local/src/runner-config.ts:5-7`.
- CLI investigation (this box, claude CLI 2.1.201 — same version as the audit box): `claude --help` (subcommand list includes `auth` — "Manage authentication"); `claude auth --help` (`login`/`logout`/`status`); `claude auth status --help` (`--json` default, `--text`); live run of `claude auth status` returning `{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty", …}` with exit 0. Signed-out output shape/exit not directly observed (box is signed in) — flagged above and pinned by AC-1. No termfleet-dist citations in this spec.
