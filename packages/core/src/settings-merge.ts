// Structured collision policy for project-level Claude Code and Codex hook configuration. It belongs
// beside the generic materializer because compile, upgrade, and atomic activation must converge through
// exactly the same merge semantics.
import type { MergeStrategies, MergeStrategy } from './materialize';

export const CLAUDE_SETTINGS_PATH = '.claude/settings.json';
export const CODEX_HOOKS_PATH = '.codex/hooks.json';
export const GATE_CONFIG_PATHS = [CLAUDE_SETTINGS_PATH, CODEX_HOOKS_PATH] as const;
export const STOP_HOOK_OPT_OUT_KEY = '_openAutonomyStopHookOptOut';
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

function isOpenAutonomyGate(entry: HookEntry): boolean {
  return commandsOf(entry).some((command) =>
    /node_modules\/ztrack\/plugins\/(?:ztrack-gate|ztrack)\/hooks\/stop-loop\.sh/.test(command),
  );
}

function hookMap(value: HarnessSettings): Record<string, unknown> | undefined {
  if (value.hooks === undefined) return {};
  if (!value.hooks || typeof value.hooks !== 'object' || Array.isArray(value.hooks)) return undefined;
  return value.hooks;
}

const mergeHarnessHooks: MergeStrategy['merge'] = (existing, generated) => {
  let existingJson: HarnessSettings;
  let generatedJson: HarnessSettings;
  try {
    existingJson = JSON.parse(existing) as HarnessSettings;
    generatedJson = JSON.parse(generated) as HarnessSettings;
  } catch {
    return undefined;
  }
  if (existingJson[STOP_HOOK_OPT_OUT_KEY] === true) {
    return { content: existing, note: 'validation gate opt-out honored' };
  }
  const existingHooks = hookMap(existingJson);
  const generatedHooks = hookMap(generatedJson);
  if (!existingHooks || !generatedHooks) return undefined;

  const merged: HarnessSettings = structuredClone(existingJson);
  const hooks: Record<string, unknown> = structuredClone(existingHooks);
  let added = 0;
  let replaced = 0;
  for (const event of GATE_EVENTS) {
    const priorValue = hooks[event];
    const incomingValue = generatedHooks[event];
    if (priorValue !== undefined && !Array.isArray(priorValue)) return undefined;
    if (!Array.isArray(incomingValue)) return undefined;
    const incoming = incomingValue as HookEntry[];
    const incomingCommands = new Set(incoming.flatMap(commandsOf));
    const retained = (priorValue ?? []).filter((entry: HookEntry) => {
      const entryCommands = commandsOf(entry);
      const stale = isOpenAutonomyGate(entry) && !entryCommands.every((command) => incomingCommands.has(command));
      if (stale) replaced += 1;
      return !stale;
    }) as HookEntry[];
    const knownCommands = new Set(retained.flatMap(commandsOf));
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
  const details = [
    added ? `+${added} gate hook${added === 1 ? '' : 's'}` : '',
    replaced ? `replaced ${replaced} OA gate hook${replaced === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(', ');
  return { content: `${JSON.stringify(merged, null, 2)}\n`, note: details || 'already up to date' };
};

export const settingsMergeStrategies: MergeStrategies = Object.fromEntries(
  GATE_CONFIG_PATHS.map((path) => [path, { merge: mergeHarnessHooks }]),
);

