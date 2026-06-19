// Ingest a ztrack profile (profile.json + scheduler/schedule.json) → autonomy.ir.v1.
import type { AutonomyIR, Box, IRWorkflow } from '@open-autonomy/core';

export interface ZtrackProfile {
  schema: string;
  name: string;
  preset?: string;
  readme?: string;
  scheduler?: { schedule?: string; scripts?: string[] };
  scripts?: { runAgent?: string };
  skills?: Record<string, { name?: string; source: string; codex?: string; claude?: string }>;
  standards?: string[];
  policy?: {
    wip?: { maxInProgress?: number; maxInReview?: number };
    humanRequiredPaths?: string[];
    humanRequiredTopics?: string[];
  };
}

export interface ZtrackSchedule {
  intervalSeconds?: number;
  env?: Record<string, string>;
  scripts?: string[];
}

const DEFAULT_CRON = '*/15 * * * *';

/** ztrack schedules by seconds; the IR trigger is cron. Sub-minute intervals are not expressible (lossy). */
export function secondsToCron(seconds?: number): string {
  if (!seconds || seconds % 60 !== 0) return DEFAULT_CRON;
  const minutes = seconds / 60;
  if (minutes >= 1 && minutes < 60) return `*/${minutes} * * * *`;
  return DEFAULT_CRON;
}

export function ingestProfile(profile: ZtrackProfile, schedule?: ZtrackSchedule): AutonomyIR {
  const wip = profile.policy?.wip ?? {};

  const agents: AutonomyIR['agents'] = {};
  for (const [name, s] of Object.entries(profile.skills ?? {})) {
    // ztrack's WIP caps map to per-agent concurrency for the work-bearing roles.
    const maxConcurrent =
      name === 'develop' ? wip.maxInProgress ?? 1 : name === 'review' ? wip.maxInReview ?? 1 : 1;
    // Skill identity is the folder basename (portable); the target path prefix
    // (profiles/<name>/skills, .codex/skills, …) is a harness/driver convention.
    const folder = s.source.replace(/\/SKILL\.md$/, '');
    agents[name] = {
      skill: folder.split('/').pop() ?? folder,
      maxConcurrent,
      config: {},
    };
  }

  // ztrack expresses dispatch IMPERATIVELY (a scheduler script that internally calls run-agent),
  // so in general a scheduler entry becomes a generic `run:` workflow. The one exception is the
  // launch convention: a `<role>-tick` entry whose role is a known agent does nothing but launch
  // that agent, so it round-trips as `launch: <role>` (a regenerable launcher) rather than an
  // opaque script. run.mjs is the loop driver, not a workflow.
  const cron = secondsToCron(schedule?.intervalSeconds);
  const entries = schedule?.scripts ?? profile.scheduler?.scripts ?? [];
  const workflows: IRWorkflow[] = entries
    .map(extractScript)
    .filter((p): p is string => !!p && !/(^|\/)run\.mjs$/.test(p))
    .map((p) => {
      const name = basename(p);
      const tick = /^(.+)-tick$/.exec(name);
      if (tick && agents[tick[1]]) return { name, triggers: [{ cron }], launch: tick[1], config: {} };
      return { name, triggers: [{ cron }], run: p, config: {} };
    });

  // Guardrails ztrack interprets but the IR core doesn't → policy box (carried, not lost).
  const policyBox: Box = {};
  if (profile.policy?.humanRequiredPaths) policyBox.humanRequiredPaths = profile.policy.humanRequiredPaths;
  if (profile.policy?.humanRequiredTopics) policyBox.humanRequiredTopics = profile.policy.humanRequiredTopics;

  const resources = [...(profile.standards ?? [])];
  if (profile.readme) resources.push(profile.readme);

  return {
    schema: 'autonomy.ir.v1',
    targets: ['local'],
    agents,
    workflows,
    resources,
    policy: { box: policyBox },
  };
}

function extractScript(entry: string): string | null {
  const m = /(\S+\.mjs)/.exec(entry);
  return m ? m[1] : null;
}

function basename(p: string): string {
  return (p.split('/').pop() ?? p).replace(/\.mjs$/, '');
}
