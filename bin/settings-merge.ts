// OA-10 (c): the merge policy for `.claude/settings.json` collisions — the CLI's per-path merge-strategy
// map, passed into `materialize`/`findClobbers` (fresh compile, bin/autonomy-compile.ts) and
// `planUpgrade`/`applyUpgrade` (re-compile, bin/autonomy-upgrade.ts) so `packages/core` stays generic and
// knows no path names or hook schemas — this file owns both.
//
// Why a merge, not a refuse-or-clobber: `.claude/settings.json` is the single most likely path to
// pre-exist in a Claude-using repo (most fleet repos have one — docs/OPERATIONS.md#claude-settings), so
// refusing makes the documented happy path require `--force`, which then clobbers — exactly the failure
// being fixed. Structured JSON append-if-absent is deterministic and therefore safe to automate: append
// each of the GENERATED file's `hooks.Stop` entries onto the EXISTING file's `hooks.Stop` array iff none of
// that entry's hook commands already appear (byte-identical `command` string) — every other key of the
// adopter's file (`permissions`, other hook events, …) is left completely untouched.
//
// The DURABLE OPT-OUT (OA-10 skeptic-panel blocker fix): the Stop hook fires in a human's OWN interactive
// Claude Code sessions, so an operator MUST have a way to remove it that a routine re-compile/upgrade will
// not silently undo. Deleting the hook entry (or the whole file) is NOT durable — append-if-absent re-adds
// the entry on the next compile, and upgrade re-seeds a deleted derived file. The durable mechanism is a
// SENTINEL the adopter sets in their own settings.json: `"_openAutonomyStopHookOptOut": true`. When present,
// this merge NEVER (re-)appends the Stop hook — on compile OR upgrade — and returns the adopter's file
// unchanged. That is the ONE opt-out the docs may promise (docs/OPERATIONS.md#claude-settings).
import type { MergeStrategies, MergeStrategy } from '@open-autonomy/core';

export const CLAUDE_SETTINGS_PATH = '.claude/settings.json';
// The durable opt-out sentinel (see the block comment above). A top-level key in the adopter's own
// settings.json; Claude Code ignores unknown top-level keys, so it is inert to the harness itself.
export const STOP_HOOK_OPT_OUT_KEY = '_openAutonomyStopHookOptOut';

interface StopHookEntry {
  hooks?: Array<{ command?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}
interface ClaudeSettings {
  hooks?: { Stop?: StopHookEntry[]; [event: string]: unknown };
  [key: string]: unknown;
}

function commandsOf(entry: StopHookEntry): string[] {
  return (entry.hooks ?? []).map((h) => h.command).filter((c): c is string => typeof c === 'string');
}

/** Parse+merge one `.claude/settings.json`. Returns `undefined` when EITHER side isn't parseable JSON —
 *  an adopter's malformed file (the fallback: the named refusal in bin/autonomy-compile.ts explains the
 *  manual merge) or, defensively, a corrupted profile resource (never silently mangled either way). */
const mergeClaudeSettings: MergeStrategy['merge'] = (existing, generated) => {
  let existingJson: ClaudeSettings;
  let generatedJson: ClaudeSettings;
  try {
    existingJson = JSON.parse(existing) as ClaudeSettings;
  } catch {
    return undefined;
  }
  try {
    generatedJson = JSON.parse(generated) as ClaudeSettings;
  } catch {
    return undefined;
  }
  // Durable opt-out: the adopter set the sentinel — never (re-)append OA's Stop hook. Return their file
  // BYTE-FOR-BYTE unchanged (not a re-serialization) so this is a true structural no-op: the receipt/plan
  // machinery compares merged.content against the on-disk bytes and, seeing no change, prints/plans nothing.
  if (existingJson[STOP_HOOK_OPT_OUT_KEY] === true) {
    return { content: existing, note: 'Stop hook opt-out honored' };
  }
  // structuredClone (not a shallow spread) so nested keys the adopter owns (hooks.PostToolUse, nested
  // permission objects, …) survive the merge byte-for-byte, untouched.
  const merged: ClaudeSettings = structuredClone(existingJson);
  const existingStop: StopHookEntry[] = Array.isArray(merged.hooks?.Stop) ? merged.hooks!.Stop! : [];
  const knownCommands = new Set(existingStop.flatMap(commandsOf));
  const incoming = generatedJson.hooks?.Stop ?? [];
  let added = 0;
  for (const entry of incoming) {
    const cmds = commandsOf(entry);
    // "an identical command isn't already present" — an entry whose every command is already present is a
    // no-op duplicate (idempotent re-merge: re-running never duplicates the hook entry).
    // COMMAND-CHANGE DRIFT (skeptic-panel Finding 4a): this match is byte-exact on the `command` string, so
    // if OA ever CHANGES the Stop hook command, the old install's existing entry won't be recognized as
    // "the OA hook" and the next merge appends a SECOND entry, leaving the stale one in place. Acceptable
    // today (the command has been stable), but a future command change must ship a migration that removes
    // the prior OA entry by a stable marker (not this command-string identity) — it cannot rely on this
    // append-if-absent path alone.
    if (cmds.length > 0 && cmds.every((c) => knownCommands.has(c))) continue;
    // Structural dedup (Finding 4b nit): never append an entry deep-equal to one already present — keeps
    // the merge idempotent even for a degenerate command-LESS Stop entry (which the command check above
    // can't dedup, since it has no commands to compare).
    if (existingStop.some((e) => JSON.stringify(e) === JSON.stringify(entry))) continue;
    existingStop.push(entry);
    for (const c of cmds) knownCommands.add(c);
    added += 1;
  }
  merged.hooks = { ...(merged.hooks ?? {}), Stop: existingStop };
  const content = `${JSON.stringify(merged, null, 2)}\n`;
  const note = added > 0 ? `+${added} Stop hook${added === 1 ? '' : 's'}` : 'already up to date';
  return { content, note };
};

/** The one merge strategy OA-10 ships. A `Record` (not a single constant) because `materialize`/
 *  `findClobbers`/`planUpgrade`/`applyUpgrade` all take a per-PATH map — this is the shape any future
 *  merge-eligible path (there are none today) would extend, without changing any core signature.
 *
 *  SCOPE (Finding 4b): this merge ONLY reconciles `hooks.Stop`. The profile's `.claude/settings.json` today
 *  carries nothing else — pinned by a shape test in bin/settings-merge.test.ts, so ADDING any other key to
 *  the profile file (e.g. a `permissions` block OA wants every install to get) trips that test and forces
 *  this merge to be extended, rather than silently dropping the new key on every merged install. */
export const settingsMergeStrategies: MergeStrategies = {
  [CLAUDE_SETTINGS_PATH]: { merge: mergeClaudeSettings },
};
