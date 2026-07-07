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
import type { MergeStrategies, MergeStrategy } from '@open-autonomy/core';

export const CLAUDE_SETTINGS_PATH = '.claude/settings.json';

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
  // structuredClone (not a shallow spread) so nested keys the adopter owns (hooks.PostToolUse, nested
  // permission objects, …) survive the merge byte-for-byte, untouched.
  const merged: ClaudeSettings = structuredClone(existingJson);
  const existingStop: StopHookEntry[] = Array.isArray(merged.hooks?.Stop) ? merged.hooks!.Stop! : [];
  const knownCommands = new Set(existingStop.flatMap(commandsOf));
  const incoming = generatedJson.hooks?.Stop ?? [];
  let added = 0;
  for (const entry of incoming) {
    const cmds = commandsOf(entry);
    // "an identical command isn't already present" — an entry with NO commands (malformed) or with at
    // least one genuinely new command is appended; an entry whose every command is already present is a
    // no-op duplicate (idempotent re-merge: re-running never duplicates the hook entry).
    if (cmds.length > 0 && cmds.every((c) => knownCommands.has(c))) continue;
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
 *  merge-eligible path (there are none today) would extend, without changing any core signature. */
export const settingsMergeStrategies: MergeStrategies = {
  [CLAUDE_SETTINGS_PATH]: { merge: mergeClaudeSettings },
};
