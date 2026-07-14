// autonomy.organization.v2 — substrate-neutral semantics for autonomous organizations.
//
// This module is intentionally separate from autonomy.ir.v1. v1 is a compact, deployed runner profile;
// v2 is the canonical organizational model that v1 profiles, Oracle Agent Spec components, Paperclip
// companies, durable workflow engines, and future substrates may lower from or lift into.

export type Id = string;
export type JsonSchema = Record<string, unknown>;
export type Expression = string;
export type Duration = string;

export interface SourceRef {
  uri: string;
  digest?: string;
  mediaType?: string;
}

export interface AnnotationSet {
  labels?: Record<string, string>;
  documentation?: string;
  provenance?: SourceRef[];
  extensions?: Record<string, unknown>;
}

export interface ImportDecl {
  source: SourceRef;
  namespace?: string;
  format?: string;
  required?: boolean;
}

export interface TypeDecl extends AnnotationSet {
  schema: JsonSchema;
}

/** Behavior is what an actor knows how to do, independent of who fills the role or where it runs. */
export interface BehaviorDecl extends AnnotationSet {
  kind: 'prompt' | 'skill' | 'agent-spec' | 'workflow' | 'program' | 'composite' | 'external';
  source?: SourceRef;
  inline?: unknown;
  inputs?: Record<string, Id>;
  outputs?: Record<string, Id>;
  instructions?: InstructionAssembly;
  tools?: Id[];
  memories?: Id[];
  behaviors?: Id[];
}

/** Prompt construction is modeled, not hidden in an opaque behavior string. */
export interface InstructionAssembly {
  precedence?: Array<'constitution' | 'organization' | 'role' | 'task' | 'skill' | 'conversation' | 'runtime'>;
  fragments: InstructionFragment[];
  conflict?: 'reject' | 'higher-precedence' | 'most-restrictive' | 'runtime';
}

export interface InstructionFragment extends AnnotationSet {
  id?: Id;
  role: 'constitution' | 'policy' | 'identity' | 'procedure' | 'context' | 'example' | 'constraint' | 'user';
  source?: SourceRef;
  text?: string;
  when?: Expression;
  priority?: number;
}

export interface ToolDecl extends AnnotationSet {
  input?: JsonSchema;
  output?: JsonSchema;
  effects?: EffectDecl[];
  protocol?: 'mcp' | 'function' | 'http' | 'a2a' | 'local' | 'external';
  endpoint?: SourceRef;
  idempotency?: 'required' | 'supported' | 'none' | 'unknown';
}

export interface MemoryDecl extends AnnotationSet {
  kind: 'working' | 'episodic' | 'semantic' | 'procedural' | 'organizational' | 'artifact' | 'external';
  scope: 'attempt' | 'work' | 'actor' | 'team' | 'organization' | 'global';
  retention?: Duration | 'indefinite';
  consistency?: 'strong' | 'causal' | 'eventual' | 'runtime';
  source?: SourceRef;
  schema?: JsonSchema;
}

export interface EffectDecl {
  resource: string;
  action: string;
  mode?: 'read' | 'write' | 'append' | 'delete' | 'execute' | 'authorize' | 'communicate';
  reversible?: boolean;
}

/** Actor is a durable organizational identity, not a process or model session. */
export interface ActorDecl extends AnnotationSet {
  kind: 'agent' | 'human' | 'service' | 'collective';
  behaviors: Id[];
  memberOf?: Id[];
  reportsTo?: Id[];
  capabilities?: CapabilityGrant[];
  constraints?: Id[];
  activation?: ActivationDecl[];
  capacity?: CapacityDecl;
  implementation?: ImplementationChoice[];
}

export interface CapabilityGrant extends AnnotationSet {
  capability: Id;
  scope?: ResourceSelector;
  conditions?: Expression[];
  budget?: Id;
  delegable?: boolean;
  attenuation?: 'required' | 'optional' | 'forbidden';
  expires?: string;
}

export interface CapabilityDecl extends AnnotationSet {
  resourceKinds: string[];
  actions: string[];
  effects?: EffectDecl[];
  risk?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ResourceSelector {
  kind?: string;
  ids?: Id[];
  labels?: Record<string, string>;
  expression?: Expression;
}

export interface CapacityDecl {
  concurrent?: number;
  queue?: number;
  rate?: { count: number; per: Duration };
}

export interface ImplementationChoice extends AnnotationSet {
  when?: Expression;
  substrate?: string;
  model?: string;
  runtime?: string;
  configuration?: Record<string, unknown>;
}

export interface ActivationDecl {
  kind: 'schedule' | 'event' | 'message' | 'work-available' | 'manual' | 'continuous';
  expression?: string;
  eventType?: string;
  protocol?: Id;
  workType?: Id;
  parameters?: Record<string, Expression>;
}

export interface UnitDecl extends AnnotationSet {
  kind: 'organization' | 'division' | 'team' | 'board' | 'committee' | 'market' | 'pool';
  parent?: Id;
  members?: Id[];
  purpose?: string;
  goals?: Id[];
  policies?: Id[];
  decisionRules?: Id[];
}

export interface RelationDecl extends AnnotationSet {
  kind: 'reports-to' | 'supervises' | 'reviews' | 'advises' | 'supplies' | 'audits' | 'elects' | 'custom';
  from: Id;
  to: Id;
  protocol?: Id;
  constraints?: Id[];
}

export interface GoalDecl extends AnnotationSet {
  statement: string;
  parent?: Id;
  owner?: Id;
  horizon?: string;
  priority?: number;
  measures?: MeasureDecl[];
  constraints?: Id[];
  statusPolicy?: Expression;
}

export interface MeasureDecl {
  name: string;
  type?: Id;
  target?: unknown;
  direction?: 'maximize' | 'minimize' | 'equal' | 'range' | 'satisfy';
  observation?: Expression;
}

/** WorkType declares lifecycle and admission rules. WorkItemDecl optionally seeds durable work. */
export interface WorkTypeDecl extends AnnotationSet {
  input?: JsonSchema;
  output?: JsonSchema;
  lifecycle: LifecycleDecl;
  assignment?: AssignmentPolicy;
  retry?: RetryPolicy;
  verification?: VerificationPolicy;
  context?: ContextPolicy;
  requiredCapabilities?: Id[];
}

export interface LifecycleDecl {
  initial: string;
  terminal: string[];
  states: Record<string, StateDecl>;
  transitions: TransitionDecl[];
}

export interface StateDecl extends AnnotationSet {
  category?: 'queued' | 'active' | 'waiting' | 'review' | 'terminal';
  invariant?: Expression[];
}

export interface TransitionDecl extends AnnotationSet {
  from: string | string[];
  to: string;
  event: string;
  guard?: Expression;
  authority?: Id[];
  effects?: EffectDecl[];
}

export interface AssignmentPolicy {
  mode: 'direct' | 'claim' | 'lease' | 'auction' | 'election' | 'broadcast' | 'custom';
  candidates?: Id[];
  selector?: Expression;
  exclusive?: boolean;
  lease?: { duration: Duration; renewable?: boolean; heartbeat?: Duration; recovery?: string };
}

export interface RetryPolicy {
  maxAttempts?: number;
  maxElapsed?: Duration;
  backoff?: string;
  deduplicateBy?: Expression;
  retryWhen?: Expression;
  exhaustion?: 'fail' | 'block' | 'escalate' | 'replan';
}

export interface VerificationPolicy {
  required?: boolean;
  verifier?: Id[];
  independent?: boolean;
  criteria?: SourceRef | JsonSchema;
  evidence?: string[];
}

export interface ContextPolicy {
  include?: Array<'organization' | 'goal-ancestry' | 'work-ancestry' | 'actor' | 'artifacts' | 'conversation' | 'memory'>;
  exclude?: ResourceSelector[];
  maximumTokens?: number;
  compaction?: Id;
}

export interface WorkItemDecl extends AnnotationSet {
  type: Id;
  title: string;
  goal?: Id;
  parent?: Id;
  dependencies?: Id[];
  accountable?: Id;
  assignees?: Id[];
  input?: unknown;
  initialState?: string;
}

export interface ProtocolDecl extends AnnotationSet {
  roles: string[];
  messages: Record<string, MessageDecl>;
  sessions?: SessionTypeDecl;
  transport?: 'a2a' | 'mcp' | 'slack' | 'email' | 'http' | 'local' | 'abstract';
}

export interface MessageDecl extends AnnotationSet {
  from: string | string[];
  to: string | string[];
  schema?: JsonSchema;
  effects?: EffectDecl[];
  correlation?: string[];
}

export interface SessionTypeDecl {
  initial: string;
  terminal?: string[];
  states: Record<string, { on: Record<string, string> }>;
}

export interface PolicyDecl extends AnnotationSet {
  kind: 'authorization' | 'obligation' | 'prohibition' | 'approval' | 'budget' | 'privacy' | 'retention' | 'safety' | 'quality' | 'custom';
  appliesTo?: ResourceSelector[];
  rule: Expression | Record<string, unknown>;
  enforcement: 'static' | 'runtime' | 'review' | 'advisory';
  violation?: 'deny' | 'redact' | 'transform' | 'audit' | 'pause' | 'escalate' | 'terminate';
}

export interface BudgetDecl extends AnnotationSet {
  resource: 'money' | 'tokens' | 'time' | 'compute' | 'requests' | 'custom';
  limit: number;
  unit: string;
  period?: Duration;
  parent?: Id;
  onExhaustion?: 'deny' | 'pause' | 'escalate' | 'degrade';
}

export interface DecisionRuleDecl extends AnnotationSet {
  method: 'owner' | 'unanimity' | 'majority' | 'quorum' | 'consensus' | 'ranked' | 'auction' | 'model' | 'custom';
  participants?: Id[];
  quorum?: number;
  tieBreak?: Expression;
  output?: JsonSchema;
}

export interface ArtifactTypeDecl extends AnnotationSet {
  mediaType?: string;
  schema?: JsonSchema;
  mutable?: boolean;
  versioned?: boolean;
  retention?: Duration | 'indefinite';
}

export interface CompilerRequirements {
  guarantees?: string[];
  requirements?: Record<string, {
    required?: boolean;
    acceptable?: Array<'native' | 'adapter' | 'approximated'>;
    constraints?: SemanticConstraint[];
    authoritativeState?: string;
  }>;
  preferredSubstrates?: string[];
  forbiddenSubstrates?: string[];
  lossPolicy?: 'reject' | 'warn' | 'allow';
  extensions?: Record<string, unknown>;
}

export interface SemanticConstraint {
  property: string;
  operator: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'includes';
  value: unknown;
}

/** Definition plane: the timeless denotation of an organization. */
export interface OrganizationIR extends AnnotationSet {
  schema: 'autonomy.organization.v2';
  name: string;
  version?: string;
  imports?: Record<Id, ImportDecl>;
  types?: Record<Id, TypeDecl>;
  behaviors?: Record<Id, BehaviorDecl>;
  tools?: Record<Id, ToolDecl>;
  memories?: Record<Id, MemoryDecl>;
  capabilities?: Record<Id, CapabilityDecl>;
  actors: Record<Id, ActorDecl>;
  units?: Record<Id, UnitDecl>;
  relations?: Record<Id, RelationDecl>;
  goals?: Record<Id, GoalDecl>;
  workTypes?: Record<Id, WorkTypeDecl>;
  initialWork?: Record<Id, WorkItemDecl>;
  protocols?: Record<Id, ProtocolDecl>;
  policies?: Record<Id, PolicyDecl>;
  budgets?: Record<Id, BudgetDecl>;
  decisions?: Record<Id, DecisionRuleDecl>;
  artifacts?: Record<Id, ArtifactTypeDecl>;
  compiler?: CompilerRequirements;
}

/** Operational plane: facts produced by running an OrganizationIR. */
export interface OrganizationStateIR extends AnnotationSet {
  schema: 'autonomy.state.v1';
  organization: { name: string; version?: string; digest?: string };
  revision: number;
  observedAt: string;
  work?: Record<Id, WorkItemState>;
  attempts?: Record<Id, AttemptState>;
  claims?: Record<Id, ClaimState>;
  conversations?: Record<Id, ConversationState>;
  decisions?: Record<Id, DecisionState>;
  artifacts?: Record<Id, ArtifactState>;
  budgetUsage?: Record<Id, BudgetUsageState>;
  events?: OrganizationEvent[];
}

export interface WorkItemState {
  type: Id;
  state: string;
  goal?: Id;
  parent?: Id;
  dependencies?: Id[];
  accountable?: Id;
  assignees?: Id[];
  currentAttempts?: Id[];
  input?: unknown;
  output?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttemptState {
  work: Id;
  actor: Id;
  implementation?: ImplementationChoice;
  status: 'queued' | 'running' | 'paused' | 'succeeded' | 'failed' | 'cancelled' | 'lost';
  startedAt?: string;
  endedAt?: string;
  session?: string;
  result?: unknown;
  failure?: { kind: string; message?: string; retryable?: boolean; signature?: string };
  evidence?: Id[];
}

export interface ClaimState {
  work: Id;
  actor: Id;
  acquiredAt: string;
  expiresAt?: string;
  heartbeatAt?: string;
  token?: string;
  status: 'active' | 'released' | 'expired' | 'revoked';
}

export interface ConversationState {
  protocol?: Id;
  participants: Id[];
  externalRef?: string;
  status?: string;
  relatedWork?: Id[];
  messages?: Array<{ id: Id; type?: string; sender: Id; sentAt: string; content?: unknown; replyTo?: Id }>;
}

export interface DecisionState {
  rule?: Id;
  question: unknown;
  participants?: Id[];
  status: 'proposed' | 'pending' | 'decided' | 'rejected' | 'superseded';
  outcome?: unknown;
  rationale?: string;
  evidence?: Id[];
}

export interface ArtifactState {
  type?: Id;
  uri: string;
  digest?: string;
  version?: string;
  producedBy?: Id;
  relatedWork?: Id[];
}

export interface BudgetUsageState {
  budget: Id;
  consumed: number;
  reserved?: number;
  asOf: string;
}

export interface OrganizationEvent {
  id: Id;
  type: string;
  at: string;
  actor?: Id;
  subject?: { kind: string; id: Id };
  causation?: Id;
  correlation?: Id;
  data?: unknown;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const idPattern = /^[A-Za-z][A-Za-z0-9._/-]*$/;

/** Validate cross-references and universal invariants without imposing one organizational topology. */
export function validateOrganizationIR(ir: OrganizationIR): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (ir.schema !== 'autonomy.organization.v2') errors.push(`bad schema: ${String(ir.schema)}`);
  if (!ir.name?.trim()) errors.push('name is required');
  if (!ir.actors || Object.keys(ir.actors).length === 0) errors.push('actors must contain at least one actor');

  const catalogs: Array<[string, Record<string, unknown> | undefined]> = [
    ['imports', ir.imports], ['types', ir.types], ['behaviors', ir.behaviors], ['tools', ir.tools],
    ['memories', ir.memories], ['capabilities', ir.capabilities], ['actors', ir.actors], ['units', ir.units],
    ['relations', ir.relations], ['goals', ir.goals], ['workTypes', ir.workTypes], ['initialWork', ir.initialWork],
    ['protocols', ir.protocols], ['policies', ir.policies], ['budgets', ir.budgets], ['decisions', ir.decisions],
    ['artifacts', ir.artifacts],
  ];
  for (const [catalog, values] of catalogs)
    for (const id of Object.keys(values ?? {})) if (!idPattern.test(id)) errors.push(`${catalog}.${id}: invalid id`);

  const has = (map: Record<string, unknown> | undefined, id: string) => map?.[id] !== undefined;
  const actorOrUnit = (id: string) => has(ir.actors, id) || has(ir.units, id);
  const checkRefs = (path: string, refs: string[] | undefined, exists: (id: string) => boolean, kind: string) => {
    for (const ref of refs ?? []) if (!exists(ref)) errors.push(`${path}: unknown ${kind} '${ref}'`);
  };

  for (const [id, behavior] of Object.entries(ir.behaviors ?? {})) {
    checkRefs(`behaviors.${id}.tools`, behavior.tools, (x) => has(ir.tools, x), 'tool');
    checkRefs(`behaviors.${id}.memories`, behavior.memories, (x) => has(ir.memories, x), 'memory');
    checkRefs(`behaviors.${id}.behaviors`, behavior.behaviors, (x) => has(ir.behaviors, x), 'behavior');
    if (!behavior.source && behavior.inline === undefined && !behavior.instructions && !behavior.behaviors?.length)
      errors.push(`behaviors.${id}: needs source, inline, instructions, or composed behaviors`);
  }
  for (const [id, actor] of Object.entries(ir.actors ?? {})) {
    checkRefs(`actors.${id}.behaviors`, actor.behaviors, (x) => has(ir.behaviors, x), 'behavior');
    if (!actor.behaviors?.length) errors.push(`actors.${id}.behaviors must not be empty`);
    checkRefs(`actors.${id}.memberOf`, actor.memberOf, (x) => has(ir.units, x), 'unit');
    checkRefs(`actors.${id}.reportsTo`, actor.reportsTo, actorOrUnit, 'actor or unit');
    checkRefs(`actors.${id}.constraints`, actor.constraints, (x) => has(ir.policies, x), 'policy');
    for (const grant of actor.capabilities ?? []) {
      if (!has(ir.capabilities, grant.capability)) errors.push(`actors.${id}.capabilities: unknown capability '${grant.capability}'`);
      if (grant.budget && !has(ir.budgets, grant.budget)) errors.push(`actors.${id}.capabilities: unknown budget '${grant.budget}'`);
    }
    for (const [index, activation] of (actor.activation ?? []).entries()) {
      if (activation.protocol && !has(ir.protocols, activation.protocol))
        errors.push(`actors.${id}.activation[${index}].protocol: unknown protocol '${activation.protocol}'`);
      if (activation.workType && !has(ir.workTypes, activation.workType))
        errors.push(`actors.${id}.activation[${index}].workType: unknown work type '${activation.workType}'`);
    }
  }
  for (const [id, unit] of Object.entries(ir.units ?? {})) {
    if (unit.parent && !has(ir.units, unit.parent)) errors.push(`units.${id}.parent: unknown unit '${unit.parent}'`);
    checkRefs(`units.${id}.members`, unit.members, actorOrUnit, 'actor or unit');
    checkRefs(`units.${id}.goals`, unit.goals, (x) => has(ir.goals, x), 'goal');
    checkRefs(`units.${id}.policies`, unit.policies, (x) => has(ir.policies, x), 'policy');
    checkRefs(`units.${id}.decisionRules`, unit.decisionRules, (x) => has(ir.decisions, x), 'decision rule');
  }
  for (const [id, relation] of Object.entries(ir.relations ?? {})) {
    if (!actorOrUnit(relation.from)) errors.push(`relations.${id}.from: unknown actor or unit '${relation.from}'`);
    if (!actorOrUnit(relation.to)) errors.push(`relations.${id}.to: unknown actor or unit '${relation.to}'`);
    if (relation.from === relation.to) warnings.push(`relations.${id}: self-relation`);
    if (relation.protocol && !has(ir.protocols, relation.protocol)) errors.push(`relations.${id}.protocol: unknown protocol '${relation.protocol}'`);
  }
  for (const [id, goal] of Object.entries(ir.goals ?? {})) {
    if (goal.parent && !has(ir.goals, goal.parent)) errors.push(`goals.${id}.parent: unknown goal '${goal.parent}'`);
    if (goal.owner && !actorOrUnit(goal.owner)) errors.push(`goals.${id}.owner: unknown actor or unit '${goal.owner}'`);
  }
  for (const [id, type] of Object.entries(ir.workTypes ?? {})) {
    validateLifecycle(`workTypes.${id}.lifecycle`, type.lifecycle, errors);
    checkRefs(`workTypes.${id}.requiredCapabilities`, type.requiredCapabilities, (x) => has(ir.capabilities, x), 'capability');
    checkRefs(`workTypes.${id}.assignment.candidates`, type.assignment?.candidates, actorOrUnit, 'actor or unit');
    checkRefs(`workTypes.${id}.verification.verifier`, type.verification?.verifier, actorOrUnit, 'actor or unit');
    for (const [index, transition] of (type.lifecycle?.transitions ?? []).entries())
      checkRefs(`workTypes.${id}.lifecycle.transitions[${index}].authority`, transition.authority, (x) => has(ir.capabilities, x), 'capability');
  }
  for (const [id, work] of Object.entries(ir.initialWork ?? {})) {
    const type = ir.workTypes?.[work.type];
    if (!type) errors.push(`initialWork.${id}.type: unknown work type '${work.type}'`);
    if (work.goal && !has(ir.goals, work.goal)) errors.push(`initialWork.${id}.goal: unknown goal '${work.goal}'`);
    if (work.parent && !has(ir.initialWork, work.parent)) errors.push(`initialWork.${id}.parent: unknown initial work '${work.parent}'`);
    checkRefs(`initialWork.${id}.dependencies`, work.dependencies, (x) => has(ir.initialWork, x), 'initial work');
    if (work.accountable && !actorOrUnit(work.accountable)) errors.push(`initialWork.${id}.accountable: unknown actor or unit '${work.accountable}'`);
    checkRefs(`initialWork.${id}.assignees`, work.assignees, actorOrUnit, 'actor or unit');
    if (type && work.initialState && !type.lifecycle.states[work.initialState])
      errors.push(`initialWork.${id}.initialState: unknown state '${work.initialState}' for type '${work.type}'`);
  }
  detectParentCycles('goals', ir.goals, (x) => x.parent, errors);
  detectParentCycles('units', ir.units, (x) => x.parent, errors);
  detectParentCycles('initialWork', ir.initialWork, (x) => x.parent, errors);
  detectDependencyCycles(ir.initialWork, errors);
  for (const [id, budget] of Object.entries(ir.budgets ?? {})) {
    if (!(budget.limit >= 0)) errors.push(`budgets.${id}.limit must be non-negative`);
    if (budget.parent && !has(ir.budgets, budget.parent)) errors.push(`budgets.${id}.parent: unknown budget '${budget.parent}'`);
  }
  return { errors, warnings };
}

function validateLifecycle(path: string, lifecycle: LifecycleDecl, errors: string[]): void {
  if (!lifecycle || typeof lifecycle !== 'object') { errors.push(`${path} is required`); return; }
  const states = lifecycle.states ?? {};
  if (!states[lifecycle.initial]) errors.push(`${path}.initial: unknown state '${lifecycle.initial}'`);
  if (!lifecycle.terminal?.length) errors.push(`${path}.terminal must not be empty`);
  for (const terminal of lifecycle.terminal ?? []) if (!states[terminal]) errors.push(`${path}.terminal: unknown state '${terminal}'`);
  for (const [index, transition] of (lifecycle.transitions ?? []).entries()) {
    const from = Array.isArray(transition.from) ? transition.from : [transition.from];
    for (const state of from) if (!states[state]) errors.push(`${path}.transitions[${index}].from: unknown state '${state}'`);
    if (!states[transition.to]) errors.push(`${path}.transitions[${index}].to: unknown state '${transition.to}'`);
    if (!transition.event) errors.push(`${path}.transitions[${index}].event is required`);
  }
}

function detectParentCycles<T>(catalog: string, map: Record<string, T> | undefined, parentOf: (value: T) => string | undefined, errors: string[]): void {
  for (const start of Object.keys(map ?? {})) {
    const seen = new Set<string>();
    let current: string | undefined = start;
    while (current && map?.[current]) {
      if (seen.has(current)) { errors.push(`${catalog}.${start}: parent cycle includes '${current}'`); break; }
      seen.add(current);
      current = parentOf(map[current]);
    }
  }
}

function detectDependencyCycles(map: Record<string, WorkItemDecl> | undefined, errors: string[]): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of map?.[id]?.dependencies ?? []) if (map?.[dep] && visit(dep)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  for (const id of Object.keys(map ?? {})) if (visit(id)) { errors.push(`initialWork.${id}: dependency cycle`); break; }
}

export function validateOrganizationStateIR(state: OrganizationStateIR, definition?: OrganizationIR): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (state.schema !== 'autonomy.state.v1') errors.push(`bad state schema: ${String(state.schema)}`);
  if (!Number.isInteger(state.revision) || state.revision < 0) errors.push('revision must be a non-negative integer');
  if (!state.observedAt) errors.push('observedAt is required');
  for (const [id, work] of Object.entries(state.work ?? {})) {
    const type = definition?.workTypes?.[work.type];
    if (definition && !type) errors.push(`work.${id}.type: unknown work type '${work.type}'`);
    if (type && !type.lifecycle.states[work.state]) errors.push(`work.${id}.state: unknown state '${work.state}' for type '${work.type}'`);
    if (work.accountable && definition && !definition.actors[work.accountable] && !definition.units?.[work.accountable])
      errors.push(`work.${id}.accountable: unknown actor or unit '${work.accountable}'`);
  }
  for (const [id, attempt] of Object.entries(state.attempts ?? {})) {
    if (!state.work?.[attempt.work]) errors.push(`attempts.${id}.work: unknown work '${attempt.work}'`);
    if (definition && !definition.actors[attempt.actor]) errors.push(`attempts.${id}.actor: unknown actor '${attempt.actor}'`);
  }
  for (const [id, claim] of Object.entries(state.claims ?? {})) {
    if (!state.work?.[claim.work]) errors.push(`claims.${id}.work: unknown work '${claim.work}'`);
    if (definition && !definition.actors[claim.actor]) errors.push(`claims.${id}.actor: unknown actor '${claim.actor}'`);
  }
  return { errors, warnings };
}
