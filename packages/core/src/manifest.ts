// The open-autonomy manifest (autonomy.yml) — the IR's on-disk serialization. It is substrate-NEUTRAL:
// every substrate emits the identical manifest and the runner reads it. So the (de)serialization is the
// standard's, not any one substrate's emit — it lives here in core, and each substrate's emit imports it
// rather than one substrate housing it for the others.
import { isScript, type AutonomyIR, type DocumentRoles, type ResultSchema } from './ir.js';

export interface OAManifest {
  schema?: string;
  // The code host the IR targets (github = PRs + native auto-merge; local-git = the PM merges worktrees).
  // It is orthogonal to the runner (`targets`), and the runner reads it to decide code-host effects — e.g. the
  // local runner only runs the propose effect (open a PR) for a github code host. A first-class signal, not
  // inferred from a capability.
  codeHost?: 'github' | 'local-git';
  // `resources` is the flat verbatim-file list (unchanged shape). `roles` is ADDITIVE (U2, supercode study
  // §II.9.1): present only when the IR declares document roles. It is deliberately nested INSIDE
  // `documents` (not a manifest-top-level key) so a `documents`-flattening consumer (e.g.
  // substrate-github/ingest-manifest.ts's `collectDocPaths`, which walks arbitrary nesting under
  // `documents`) picks up role paths as ordinary doc paths with zero code changes — verified against that
  // flattener before choosing this shape. `Record<string, unknown>` stays the type (rather than a fixed
  // `{ resources; roles }` object) so a substrate-specific documents key some other emit path adds is still
  // assignable here — `roles` is just the one key this compiler itself may set.
  documents?: { resources?: string[]; roles?: DocumentRoles } & Record<string, unknown>;
  skills?: Record<string, string>;
  agents?: Record<
    string,
    {
      kind?: 'agent' | 'human'; // `human` → a person: no workflowFile (no launchable job), engaged via the substrate's human realization
      skill?: string;
      workflowFile?: string;
      params?: Record<string, string>;
      // `schedule` is the cron; `dispatch: true` is on-demand via the Runner; any other key is an event trigger carried verbatim.
      triggers?: { schedule?: string; dispatch?: boolean; [event: string]: unknown };
      capabilities?: string[];
      timeout?: number;
      review?: string; // the reviewer agent that judges this proposer's PRs (the merge-boundary review edge)
      result?: { schema: ResultSchema }; // the actor's declared typed-result contract, carried verbatim
      // Opaque shell-command DATA the LOCAL runner executes in the session's own cwd before it spawns (see
      // IRAgent.prelaunch, ir.ts). Carried verbatim like `review`/`timeout` — never interpreted here.
      prelaunch?: string;
    }
  >;
  // Portable governance data, carried verbatim — each substrate reads the keys it knows
  // (autonomy/risk/merge/planner for github) and a profile's own knob (e.g. wip) survives untouched.
  policy?: Record<string, unknown>;
}

/** Serialize an IR to the open-autonomy manifest. */
export function emitAutonomy(ir: AutonomyIR): OAManifest {
  const skills: Record<string, string> = {};
  const agents: NonNullable<OAManifest['agents']> = {};
  for (const [role, agent] of Object.entries(ir.agents)) {
    const human = agent.kind === 'human';
    // A human's behavior is a task-spec handed to a person, never an installed/launchable agent skill — so it
    // is not indexed in the skills map (the substrate copies no skill file for it).
    if (!isScript(agent.behavior) && !human) skills[role] = `.codex/skills/${agent.behavior}`;
    const triggers: { schedule?: string; dispatch?: boolean; [event: string]: unknown } = {};
    for (const t of agent.triggers ?? []) {
      if ('cron' in t) triggers.schedule = t.cron;
      // `dispatch` = invoked on demand through the Runner. For an agent it is implied by its workflowFile, but
      // a human has NO workflowFile, so the dispatch trigger is its only launch signal — serialize it so it
      // round-trips (and so a dispatch-only human is never left with an empty trigger set).
      else if ('dispatch' in t) triggers.dispatch = true;
      else triggers[t.event] = t.config ?? true;
    }
    // The agent's declared trigger params (param name -> documented source), unioned across triggers.
    // The runner needs these to resolve a launch's params into the agent's env.
    const params: Record<string, string> = {};
    for (const t of agent.triggers ?? []) {
      for (const [n, s] of Object.entries((t as { params?: Record<string, string> }).params ?? {})) params[n] = s;
    }
    agents[role] = {
      ...(human ? { kind: 'human' as const } : {}),
      skill: agent.behavior,
      // The launchable unit the runner targets for agent:launch — named for the agent (substrate-derived). A
      // human has no job to launch (the substrate emits none), so it carries no workflowFile.
      ...(human ? {} : { workflowFile: `${role}.yml` }),
      ...(Object.keys(params).length ? { params } : {}),
      ...(Object.keys(triggers).length ? { triggers } : {}),
      ...(typeof agent.timeout === 'number' ? { timeout: agent.timeout } : {}),
      ...(agent.capabilities?.length ? { capabilities: agent.capabilities } : {}),
      ...(agent.review ? { review: agent.review } : {}),
      ...(agent.result ? { result: agent.result } : {}),
      ...(agent.prelaunch ? { prelaunch: agent.prelaunch } : {}),
    };
  }
  // Carry the policy box verbatim — it is opaque governance, not a fixed schema (see OAManifest.policy).
  const policy = (ir.policy.box ?? {}) as OAManifest['policy'];
  return {
    schema: 'open-autonomy.autonomy.v1',
    ...(ir.codeHost ? { codeHost: ir.codeHost } : {}),
    // `roles` rides ALONGSIDE `resources` (never replacing it) — additive, back-compat: an existing
    // consumer that only reads `documents.resources` (or flattens the whole `documents` map, as
    // ingest-manifest.ts's collectDocPaths does) is unaffected whether or not roles are present.
    documents: { resources: ir.resources, ...(ir.documents?.roles ? { roles: ir.documents.roles } : {}) },
    skills,
    agents,
    policy,
  };
}
