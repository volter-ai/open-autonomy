# The recommender SKILL — explain a profile recommendation, or validate a pre-picked choice

**This is a SKILL: prose doctrine for the agent running the install (TE.2, Phase 1 RECOMMEND / CONFIRM
PROFILE, G1), not a script that decides anything.** Per `CLAUDE.md` ("scripts only for security — never
script what an agent can do; skills are prose doctrine"), the judgment calls here — which profile is
*actually* right for this operator, how to phrase the ask, whether a blocker is really disqualifying, when
to just proceed vs. when to escalate — belong to the agent. What follows is that agent's doctrine, plus the
one small mechanical helper (`bin/recommend-profile.ts`) that supplies FACTS and TD.1's tree verdict so the
agent doesn't have to re-derive them by hand.

## Where this lives, and why (repo-skill-home convention)

`docs/` — **not** `.claude/skills/`. This repo's `.claude/skills/` (and `.codex/skills/`) directories are
**generated**: they are `compile(profiles/self-driving, github)`'s output, byte-identical to
`profiles/self-driving/skills/*/SKILL.md` (verified — `check:dogfood` enforces root ==
`compile(profiles/self-driving, github)` for every managed file, `CLAUDE.md` §"Editing shared control
files"). A skill placed directly under `.claude/skills/` without a corresponding
`profiles/self-driving/skills/` source would either get silently pruned by the next
`bun bin/autonomy-compile.ts`/upgrade pass (orphan pruning) or make `check:dogfood` fail outright — neither
is what an install-time, profile-agnostic doctrine doc wants. This doctrine is also explicitly **not** a
per-profile agent behavior (the task brief: "Do NOT add agents to profile ir.ymls in this unit") — it is
install-agent tooling, read by whichever agent runs Phase 1, regardless of which profile ends up chosen.
`docs/INSTALL-AGENT.md` is the load-bearing precedent for exactly this shape: a hand-authored, install-flow
doctrine doc that lives in `docs/`, is read by an install-running agent, and is never touched by
`compile()`/`check:dogfood`. This file follows that same convention.

## The runnable entry: `bin/recommend-profile.ts`

```bash
bun bin/recommend-profile.ts <repoDir> [--json]
                              [--pick <profileName>] [--substrate local|gh-actions]
                              [--hosted-runner|--no-hosted-runner] [--prefer-no-auto-merge]
                              [--can-fund-proxy|--cannot-fund-proxy] [--demo] [--soc2]
                              [--profiles-root <dir>]
```

It is a thin wrapper over TD.1 (`packages/core/src/recommend.ts`'s `recommendProfile`/`loadAllProfileFacts`/
`eligible`) plus a small amount of repo-fact detection (below). It never asks the operator anything itself
and never writes to the target repo — it only reads `<repoDir>` (git metadata + `gh api`) and the real
`profiles/*/ir.yml` catalog bundled next to this file, and prints a verdict. **Two modes**, selected by
whether `--pick` is given:

- **No `--pick`** → *explain a recommendation.* Runs TD.1's decision tree and prints the chosen
  `profile @ substrate` plus every reason TD.1 emitted, followed by the detected facts that drove them.
- **`--pick <profileName>`** → *validate a pre-picked choice instead of recommending.* Runs the exact same
  eligibility check TD.1 uses internally (`eligible()`, now exported for this purpose) against the
  operator's own choice. On success: "OK, this pick is valid, here's why." On a hard blocker (the
  scaffold-clobber guard is the sharpest case): the exact blocker text, its file:line citation, **and** the
  ordinary recommender's own pick for the same repo folded in as an actionable alternative.

The agent's job at Phase 1 is to run this, read its output, and turn it into the ONE question G1 is allowed
to ask (DESIGN §Phase 1) — never to skip reading the "Facts this was based on" / blocker citation and just
parrot the top line.

### Worked example — the spec's own acceptance case

A populated repo, operator pre-picks `self-driving`:

```
$ bun bin/recommend-profile.ts /path/to/populated-repo --pick self-driving
BLOCKED: "self-driving" @ local is NOT valid for this repo.

"self-driving" is a whole-repo scaffold (its resources carry repo-shell files: README.md, package.json,
.gitignore, CHANGELOG.md) — it is new-repo-only; the compile-time clobber guard will refuse it on a
populated repo (bin/autonomy-compile.ts:233-257) — pick simple-gh-sdlc (recommended for this repo: ...)
or use a dedicated, empty repo for "self-driving".
```

The `bin/autonomy-compile.ts:233-257` citation is **live** — `eligible()` (TD.1, `packages/core/src/
recommend.ts`) carries it as a string literal, verified against the compile-time clobber guard's actual
current line range on `main` (re-verify with `grep -n "" bin/autonomy-compile.ts | sed -n
'233,257p'` if `bin/autonomy-compile.ts` has since moved). The span: `:233-257` covers the guard's
explanatory comment block (233-238) plus the executable guard — `findClobbers` (239) through `exit(1)`
(256/257). TD.1's original `:239-257` citation was and remains exactly the executable guard (no drift has
occurred); landing this skill merely **widened** the cited span to include the comment block, so a reader
following the citation lands on the guard's own explanation, not mid-mechanism.

## Repo-fact detection (what the CLI can read on its own, vs. what it must ask for)

| `RepoFacts` field | How the CLI detects it | Honesty rule |
|---|---|---|
| `onGitHub` | `.git` exists + `git remote -v` shows a `github.com` remote | Plain existence check — never ambiguous, no "unknown" state needed. |
| `populated` | `git ls-files`, filtered against `REPO_SHELL_FILES` (`README.md`/`package.json`/`.gitignore`/`CHANGELOG.md` — the same set the compile-time clobber guard uses); falls back to a directory listing only for a non-git directory | Tracked-file-based, not a raw directory scan, so a repo carrying only the whole-repo-scaffold's own shell files still reads as unpopulated (matches the clobber guard's own definition of "would overwrite"). |
| `ghAdmin` | `gh api repos/<owner>/<repo> --jq .permissions.admin`, only attempted when `onGitHub` | See "ghAdmin honesty" below — this is the one field with real subtlety. |
| `canFundProxy` | **Not detected at all.** | Funding/allowlisting a model proxy is a billing/operator decision — no local tool can observe an operator's ability or willingness to pay. Always taken from `--can-fund-proxy`/`--cannot-fund-proxy`; absent either flag, it is `undefined` ("unknown"), and TD.1's tree treats an unknown/false `canFundProxy` the same way it treats a populated repo for self-driving eligibility — it simply won't recommend self-driving without an explicit `true`. |
| `hostedRunner`, `preferNoAutoMerge`, `wantsDemo`, `wantsSOC2` | Not detected. | These are genuine operator preferences (DESIGN §Phase 1/3), not repo facts — always CLI flags, mirroring how a real Phase-1/Phase-3 conversation would ask. |

### ghAdmin honesty — a live-evidence correction to the naive "always unknown" assumption

The STANDING RULE for this build ("GitHub admin-ish endpoints 404 for non-admin tokens — never a definite
negative") is real and load-bearing — it is exactly the documented gotcha in
`packages/local-runner-cli/src/imm-signals.ts:397-400`: `gh api repos/<owner>/<repo>/branches/<b>/
protection` answers a **non-admin** token with a bare **404**, indistinguishable from "genuinely
unprotected", even on a branch that IS protected. That endpoint's 404 must never be read as a negative.

**`gh api repos/<owner>/<repo> --jq .permissions.admin` is a different endpoint and does not share that
ambiguity.** Verified live on this build's box, against this very repo:

```
$ gh auth status
  ✓ Logged in to github.com account otto-runhuman (GH_TOKEN)
  - Token scopes: 'admin:org_hook', ..., 'repo', 'workflow', ...
$ gh api repos/volter-ai/open-autonomy --jq .permissions.admin
false
$ echo "exit=$?"
exit=0
```

A clean `exit 0` with a parsed `false` — not a 404, not an auth failure. This makes sense on reflection:
telling a caller their *own* permission level on a repo they can already read is not itself an admin-gated
operation, unlike reading someone else's branch-protection configuration. So `bin/recommend-profile.ts`'s
`detectGhAdmin` treats these as genuinely different cases, and **does not** collapse a clean `false` into
"unknown" just because a *different*, unrelated endpoint is known to be ambiguous for non-admin tokens:

- `gh` missing / not authenticated / any non-zero exit / an unparseable value → `ghAdmin = undefined`
  ("unknown") — never coerced to `false`. This is where the STANDING RULE's caution actually applies.
- A clean, exit-0 `"true"` or `"false"` → the confirmed value, reported as such, with the reasoning above
  spelled out in the CLI's own notes output so nothing is silently asserted.

This means the recommender-skill acceptance run against this OA clone itself (task TD.2 acceptance (iii))
correctly reports `ghAdmin=false` (a **confirmed** non-admin token), not "unknown" — a deliberate,
evidence-based departure from the literal acceptance-text wording (which anticipated the `branches/
protection`-style ambiguity applying here too). `RepoFacts.ghAdmin`'s own contract
(`packages/core/src/recommend.ts`) already expects exactly this: `undefined` means "unknown, assume yes";
an explicit `false` is reserved for cases where the recommender is confident admin is genuinely absent, so
it can steer away from a hosted runner that is known to be unprovisionable. A live-confirmed `false` is
precisely that case, not a false negative to suppress.

## Explain mode — expanding TD.1's `reasons[]` into something an operator can act on

TD.1's `Recommendation.reasons[]` are already full sentences citing the mechanical facts that drove the
pick (see `packages/core/src/recommend.ts`'s own doc comments). This skill's explain mode does not rewrite
them — it prints them verbatim, then appends the **detected facts** underneath ("Facts this was based on:
onGitHub=true — git remote -v shows a github.com remote (...)", etc.) so the reasons are traceable to real,
inspectable evidence rather than assertions. When relaying this to the operator, the agent should keep both
halves — the "why" and the "based on what" — because DESIGN §Phase 1's whole point is that the recommend
step *reads*, it never guesses.

## Validate mode — turning a blocker into a decision, not a dead end

A blocked pre-pick is not the end of the conversation. `validatePrePick` always tries the ordinary
recommender against the SAME `repoFacts` and, if it finds a different eligible profile, folds it into the
blocker text as the concrete alternative (see the worked example above). If the recommender itself finds
nothing eligible, the blocker stands alone — the agent should then escalate to a genuinely open question
("this repo doesn't fit any bundled profile for the reasons above — what should I do?") rather than
inventing an alternative that isn't real.

## What this skill is NOT

- Not the install agent itself (that's TE.1–TE.7). This only covers Phase 1's RECOMMEND/CONFIRM step.
- Not a place to add new decision-tree branches. Any change to *what* gets recommended belongs in TD.1
  (`packages/core/src/recommend.ts`); this file only covers presentation, repo-fact detection, and the
  validate-a-pre-pick reuse of TD.1's `eligible()`.
- Not authorized to write anything to the target repo. It is read-only end to end.
