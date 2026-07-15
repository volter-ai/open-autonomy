// Structured collision policy for project-level harness hook configuration. Both Claude Code and Codex
// consume the same Stop/SubagentStop shape, and every ztrack-backed profile carries byte-identical gate
// entries at both paths. Keeping one merge implementation is part of the behavior-parity contract: an
// adopter's existing hooks and permissions survive, while neither harness can silently miss the gate.
import type { MergeStrategies, MergeStrategy } from '@open-autonomy/core';

export const CLAUDE_SETTINGS_PATH = '.claude/settings.json';
export const CODEX_HOOKS_PATH = '.codex/hooks.json';
export const GATE_CONFIG_PATHS = [CLAUDE_SETTINGS_PATH, CODEX_HOOKS_PATH] as const;
const GATE_EVENTS = ['Stop', 'SubagentStop'] as const;

interface HookEntry {
  hooks?: Array<{ command?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface HarnessSettings {
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
}

function commandsOf(entry: HookEntry): string[] {
  return (entry.hooks ?? []).map((hook) => hook.command).filter((command): command is string => typeof command === 'string');
}

// The migration recognizes both the retired package layout and the current layout. An earlier OA gate
// command must be replaced, not left beside the fixed command: otherwise an upgrade would still execute a
// stale/fail-open hook before or after the new one and artifact inspection would correctly report drift.
function isOpenAutonomyGate(entry: HookEntry): boolean {
  return commandsOf(entry).some((command) =>
    /node_modules\/ztrack\/plugins\/(?:ztrack-gate|ztrack)\/hooks\/stop-loop\.sh/.test(command),
  );
}

/** Merge both mandatory gate events into either harness's JSON config. Invalid JSON returns undefined so
 * compile refuses the collision by name instead of guessing or clobbering adopter configuration. */
const mergeHarnessHooks: MergeStrategy['merge'] = (existing, generated) => {
  let existingJson: HarnessSettings;
  let generatedJson: HarnessSettings;
  try {
    existingJson = JSON.parse(existing) as HarnessSettings;
    generatedJson = JSON.parse(generated) as HarnessSettings;
  } catch {
    return undefined;
  }

  const merged: HarnessSettings = structuredClone(existingJson);
  const hooks: Record<string, unknown> = { ...(merged.hooks ?? {}) };
  let added = 0;
  let replaced = 0;

  for (const event of GATE_EVENTS) {
    const prior = Array.isArray(hooks[event]) ? (hooks[event] as HookEntry[]) : [];
    const retained = prior.filter((entry) => {
      const stale = isOpenAutonomyGate(entry);
      if (stale) replaced += 1;
      return !stale;
    });
    const knownCommands = new Set(retained.flatMap(commandsOf));
    const incoming = Array.isArray(generatedJson.hooks?.[event])
      ? (generatedJson.hooks![event] as HookEntry[])
      : [];

    for (const entry of incoming) {
      const commands = commandsOf(entry);
      if (commands.length > 0 && commands.every((command) => knownCommands.has(command))) continue;
      if (retained.some((candidate) => JSON.stringify(candidate) === JSON.stringify(entry))) continue;
      retained.push(entry);
      for (const command of commands) knownCommands.add(command);
      added += 1;
    }
    hooks[event] = retained;
  }

  merged.hooks = hooks;
  const details = [added ? `+${added} gate hook${added === 1 ? '' : 's'}` : '', replaced ? `replaced ${replaced} OA gate hook${replaced === 1 ? '' : 's'}` : '']
    .filter(Boolean)
    .join(', ');
  return { content: `${JSON.stringify(merged, null, 2)}\n`, note: details || 'already up to date' };
};

export const settingsMergeStrategies: MergeStrategies = Object.fromEntries(
  GATE_CONFIG_PATHS.map((path) => [path, { merge: mergeHarnessHooks }]),
);
