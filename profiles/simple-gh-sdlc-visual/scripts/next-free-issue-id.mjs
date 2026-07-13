#!/usr/bin/env node
// next-free-issue-id.mjs — the preflight that stops the id-allocator from reusing a DEAD id.
//
// THE BUG THIS CLOSES: ztrack's own `ztrack issue create` allocates the next store id purely from what
// exists in the COMMITTED STORE right now (`.volter/tracker/markdown/<TEAM>-<n>.md`, e.g. `COMBO-<n>`) —
// it has no memory of an id that was minted, WORKED ON (an `agent/issue-<id>` branch was pushed, a real PR
// opened against it), and later had its store file deleted again (a scratch-proof cleanup, a reverted
// draft, …). Worked example that motivated this script: an id's store file can be deleted from
// `.volter/tracker/markdown/` while `agent/issue-<id>` still has a REAL merged PR in GitHub history — so
// the moment ztrack's next-id counter ever gaps or resets back down to that number (a fresh clone
// recomputing "next" from the store dir's current contents; a race; a future ztrack change), re-minting
// that id produces one whose `agent/issue-<id>` branch already has PR history. `pm`'s own dispatch rule
// (see `skills/pm/SKILL.md`) treats "ready to develop" as actionable ready issues MINUS any whose
// `agent/issue-<id>` branch already has a PR — so a freshly-minted id in that state would be permanently
// un-dispatchable, silently stranding it forever with no local signal until someone notices the board
// never advances it.
//
// THE FIX: before (or right after) minting, check GitHub directly for ANY PR history — open, closed, or
// merged — on `agent/issue-<candidate-id>`. Any history at all means the id is "used" (dead for a FRESH
// mint, even if its store file no longer exists); advance to the next candidate and recheck. This is simple,
// idempotent (repeated calls with the same store state return the same answer, modulo GitHub's own PR
// history changing), and asks the same authoritative source `pm`'s own dispatch-eligibility check and
// `rearm-auto-merge.ts`/`reconcile-ready-branches.mjs` already treat as ground truth for "has this branch
// been proposed before" — never a local counter or cache that could itself drift from GitHub's own record.
//
// USAGE:
//   node scripts/next-free-issue-id.mjs [--team <key>] [--dir .volter/tracker/markdown] [--repo owner/name]
//                                       [--config .volter/tracker-config.json]
//     -> prints the next free id (e.g. `LOCAL-12`) to stdout, nothing else, exit 0.
//   The team key is resolved automatically from the committed `.volter/tracker-config.json`'s
//   `local.teamKey` when `--team` is not passed — the SAME key ztrack forms `<team>-<n>` store ids from —
//   so a bare invocation returns the RIGHT ids for whatever the adopter's team is (never a hardcoded
//   `COMBO`). `--team` overrides; a missing/malformed config falls back to a literal only as a last resort.
//   The chosen team + its source is printed to stderr for transparency.
//   Import `nextFreeIssueId` / `candidateIds` / `hasBranchHistory` / `teamKeyFromConfig` / `parseArgs`
//   directly for a caller (a script or a skill's own guard) that wants the id programmatically instead of
//   parsing stdout, or that wants to substitute a fake `hasHistory` predicate for a test/proof (no real
//   `gh` calls).
//
// CALLERS: the `draft` skill (standards/issue-and-evidence.md's minting step — `skills/draft/SKILL.md`
// step 5) runs this FIRST and passes its output as an expectation check: mint with `ztrack issue create`,
// then verify the id ztrack actually returned matches (or exceeds) what this helper named as free — see
// that SKILL.md's step 5 for the exact guard. Any other seeding path (an operator minting an issue by hand)
// should run this first too, for the same reason.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STORE_DIR_DEFAULT = '.volter/tracker/markdown';
const TRACKER_CONFIG_DEFAULT = '.volter/tracker-config.json';
// Last-resort fallback ONLY — used when the committed tracker config is absent/unreadable and no
// `--team` was passed. The real default is the adopter's OWN team key, derived from
// `.volter/tracker-config.json`'s `local.teamKey` (see teamKeyFromConfig below): ztrack mints ids as
// `<teamKey>-<n>`, so a hardcoded literal here would hand back a WRONG cross-check id for any repo whose
// team key isn't this string (e.g. OA's own is `LOCAL`). Kept only so a config-less invocation still
// returns *something* rather than throwing.
const TEAM_FALLBACK = 'COMBO';

// Derive the store's team key from the committed tracker config — the SAME `local.teamKey` ztrack's own
// allocator reads when it forms `<team>-<n>` store ids, so this helper's candidate ids match ztrack's for
// real (never a hardcoded guess). Returns null (not the fallback) when the config is missing/malformed, so
// the caller can decide whether to fall back or surface the gap.
export function teamKeyFromConfig(configPath = TRACKER_CONFIG_DEFAULT, read = defaultReadFile) {
  const raw = read(configPath);
  if (raw == null) return null;
  try {
    const cfg = JSON.parse(raw);
    const key = cfg?.local?.teamKey;
    return typeof key === 'string' && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

function defaultReadFile(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// Escape any regex metacharacter in an untrusted string (a `--team` CLI arg, or a `local.teamKey` pulled
// from the committed tracker config) before it's interpolated into a `RegExp(...)` source. Without this, a
// team key containing `.*`, `(`, `[`, etc. would be compiled as a live regex fragment instead of matched
// literally — e.g. `--team 'LOCAL|OTHER'` would silently widen the match to two teams' store files. Standard
// escape set per MDN's regex guide.
export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Every numeric id this store's file listing already carries for `<team>-<n>.md`, e.g. `COMBO-11.md` -> 11.
// This is the SAME signal ztrack's own allocator reads (existing store files), so "highest seen + 1" here is
// deliberately the same starting candidate ztrack would pick unprompted — this helper's job is only to keep
// walking PAST that candidate when GitHub says it's actually dead, not to invent a different allocation
// scheme. `team` is untrusted (a CLI arg or config value), so it's escaped before being spliced into the
// RegExp source — see escapeRegExp above.
export function highestExistingId(team, dir, listDir = defaultListDir) {
  const re = new RegExp(`^${escapeRegExp(team)}-(\\d+)\\.md$`);
  let highest = 0;
  for (const name of listDir(dir)) {
    const m = re.exec(name);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return highest;
}

function defaultListDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// Infinite candidate generator starting one past the highest id the store currently holds — team-scoped
// (team = the adopter's `local.teamKey`) so a multi-team install never cross-contaminates.
export function* candidateIds(team, startAfter) {
  let n = startAfter + 1;
  for (;;) {
    yield `${team}-${n}`;
    n += 1;
  }
}

// ANY PR — open, closed, or merged — targeting `agent/issue-<id>` means the id is USED. This mirrors the
// exact query flip-done.yml's own gate + this repo's `pm` dispatch-eligibility rule already run
// (`gh pr list --head "agent/issue-<id>" --state all`), so "used" here means precisely what the rest of the
// substrate already means by it — never a narrower/looser definition invented just for this helper.
export function hasBranchHistory(id, { repo, gh = defaultGh } = {}) {
  const branch = `agent/issue-${id}`;
  const args = ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number'];
  if (repo) args.push('-R', repo);
  const out = gh(args);
  if (out == null) return false; // gh failure (no repo context, offline, …) — fail OPEN for the branch-history
                                  // check specifically: a candidate we CAN'T verify is treated as free rather
                                  // than the helper refusing to ever return an id; the real backstop against a
                                  // truly-dead id landing is still `pm`'s own PR-history dispatch guard.
  try {
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function defaultGh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// The core preflight: walk candidates starting just past the store's own highest id, skipping any with real
// `agent/issue-<id>` PR history, until one comes back clean. Bounded (maxTries) so a persistent `gh` outage
// or an adversarial run can't spin forever — a repo minting hundreds of consecutive dead ids in one preflight
// is not a real scenario this needs to survive silently; it's a signal something else is badly wrong, so this
// throws rather than looping unboundedly.
export function nextFreeIssueId({
  team = TEAM_FALLBACK,
  dir = STORE_DIR_DEFAULT,
  repo,
  listDir = defaultListDir,
  gh = defaultGh,
  maxTries = 50,
} = {}) {
  const startAfter = highestExistingId(team, dir, listDir);
  const gen = candidateIds(team, startAfter);
  for (let i = 0; i < maxTries; i++) {
    const { value: candidate } = gen.next();
    if (!hasBranchHistory(candidate, { repo, gh })) {
      return { id: candidate, skipped: i }; // `skipped` = how many dead ids were walked past (0 = clean, unchanged)
    }
  }
  throw new Error(`next-free-issue-id: exhausted ${maxTries} candidates past ${team}-${startAfter} with no free id found — check GitHub connectivity or investigate a real allocation problem`);
}

// Resolve the team key in precedence order: an explicit `--team` (operator override) > the committed
// `.volter/tracker-config.json`'s `local.teamKey` (the real per-adopter default) > TEAM_FALLBACK (only when
// no config is present). `--config` lets a caller point at a non-default tracker-config path.
export function parseArgs(argv, readFile = defaultReadFile) {
  const opts = { team: undefined, dir: STORE_DIR_DEFAULT, repo: undefined, config: TRACKER_CONFIG_DEFAULT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--team') opts.team = argv[++i];
    else if (argv[i] === '--dir') opts.dir = argv[++i];
    else if (argv[i] === '--repo') opts.repo = argv[++i];
    else if (argv[i] === '--config') opts.config = argv[++i];
  }
  if (!opts.team) {
    const derived = teamKeyFromConfig(opts.config, readFile);
    opts.team = derived ?? TEAM_FALLBACK;
    opts.teamSource = opts.team === derived ? `${opts.config} (local.teamKey)` : `fallback "${TEAM_FALLBACK}" (no team key in ${opts.config})`;
  } else {
    opts.teamSource = '--team';
  }
  return opts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(opts.dir)) {
    console.error(`next-free-issue-id: store dir ${opts.dir} not found`);
    process.exit(1);
  }
  console.error(`next-free-issue-id: team "${opts.team}" (from ${opts.teamSource})`);
  try {
    const { id, skipped } = nextFreeIssueId(opts);
    if (skipped > 0) {
      console.error(`next-free-issue-id: skipped ${skipped} dead id(s) with existing agent/issue-* PR history`);
    }
    console.log(id);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
