import type { AutonomyIR, IRAgent, Trigger } from './ir.js';

export type EnforcementStatus = 'enforced' | 'partial' | 'unsupported';

export interface EnforcementControl {
  control: string;
  owner: 'substrate' | 'runner' | 'code-host' | 'task-service';
  status: EnforcementStatus;
  realization: string;
}

export interface EnforcementReport {
  schema: 'open-autonomy.enforcement.v1';
  target: string;
  generated: true;
  controls: EnforcementControl[];
}

function triggerName(trigger: Trigger): string {
  if ('cron' in trigger) return 'cron';
  if ('dispatch' in trigger) return 'dispatch';
  return `event:${trigger.event}`;
}

function triggerControl(target: string, agent: string, trigger: Trigger): EnforcementControl {
  const kind = triggerName(trigger);
  if (target === 'local') {
    if ('cron' in trigger) return { control: `agent.${agent}.trigger.${kind}`, owner: 'substrate', status: 'enforced', realization: 'per-job local schedule cadence and fence' };
    if ('dispatch' in trigger) return { control: `agent.${agent}.trigger.${kind}`, owner: 'runner', status: 'enforced', realization: 'Runner launch verb' };
    return { control: `agent.${agent}.trigger.${kind}`, owner: 'substrate', status: 'partial', realization: 'local substrate has no native event listener; supported review edges are delivered by a polling reconciler' };
  }
  if (target === 'gh-actions') {
    return { control: `agent.${agent}.trigger.${kind}`, owner: 'substrate', status: 'enforced', realization: 'GitHub Actions workflow trigger' };
  }
  return { control: `agent.${agent}.trigger.${kind}`, owner: 'substrate', status: 'unsupported', realization: `unknown target ${target}` };
}

function agentControls(target: string, name: string, agent: IRAgent): EnforcementControl[] {
  const controls: EnforcementControl[] = [];
  controls.push({
    control: `agent.${name}.capabilities`,
    owner: target === 'gh-actions' ? 'code-host' : 'runner',
    status: target === 'gh-actions' ? 'partial' : 'unsupported',
    realization: target === 'gh-actions'
      ? 'workflow token permissions map known capability bases; scoped suffixes remain advisory'
      : 'local sessions inherit operator credentials; capability declarations do not scope authority',
  });
  if (agent.execution) {
    const isolated = agent.execution.workspace === 'isolated';
    controls.push({
      control: `agent.${name}.execution.workspace`,
      owner: 'runner',
      status: target === 'local' || (target === 'gh-actions' && isolated) ? 'enforced' : 'unsupported',
      realization: target === 'local'
        ? `${agent.execution.workspace} checkout selected at launch; isolated workspaces are leased and reconciled`
        : isolated
          ? 'fresh Actions checkout/job workspace'
          : 'GitHub-hosted jobs cannot provide a persistent shared checkout',
    });
  }
  if (typeof agent.timeout === 'number') {
    controls.push({
      control: `agent.${name}.timeout`,
      owner: 'runner',
      status: target === 'gh-actions' ? 'enforced' : 'unsupported',
      realization: target === 'gh-actions'
        ? 'timeout-minutes on the generated job'
        : 'local runner bounds launch startup only; it does not yet terminate a live session at this wall time',
    });
  }
  if (agent.prelaunch) {
    controls.push({
      control: `agent.${name}.prelaunch`,
      owner: 'runner',
      status: target === 'local' ? 'enforced' : 'unsupported',
      realization: target === 'local'
        ? 'command runs in the selected session workspace before launch'
        : 'GitHub Actions emitter has no pre-skill realization',
    });
  }
  if (agent.kind === 'human') {
    controls.push({
      control: `agent.${name}.human-dispatch`,
      owner: 'runner',
      status: target === 'local' ? 'partial' : 'unsupported',
      realization: target === 'local'
        ? 'ask is parked and engagement hook is invoked; completion storage is not actor-authenticated'
        : 'human is declared but no engagement/completion adapter is emitted',
    });
  }
  controls.push(...agent.triggers.map((trigger) => triggerControl(target, name, trigger)));
  return controls;
}

/** Derive target conformance from typed IR plus compiler-owned substrate knowledge. The profile cannot
 * provide statuses: changing a claim requires changing this consumer and its denial/conformance tests. */
export function enforcementReport(ir: AutonomyIR, target: string): EnforcementReport {
  const controls: EnforcementControl[] = [];
  if (ir.policy.maxConcurrent !== undefined) {
    controls.push({
      control: 'policy.maxConcurrent',
      owner: 'substrate',
      status: target === 'local' || target === 'gh-actions' ? 'partial' : 'unsupported',
      realization: target === 'local'
        ? 'scheduler denies scheduled agent jobs at the active-session cap; direct Runner launches do not yet share that admission gate'
        : target === 'gh-actions'
          ? 'workflow concurrency prevents overlap per generated group, not as a global fleet cap'
          : `unknown target ${target}`,
    });
  }
  for (const [name, agent] of Object.entries(ir.agents)) controls.push(...agentControls(target, name, agent));
  return { schema: 'open-autonomy.enforcement.v1', target, generated: true, controls };
}
