import type {
  BehaviorDecl, ContextPolicy, EffectDecl, ImplementationChoice, InstructionAssembly, InstructionFragment,
  InstructionLayer, OrganizationIR, ResourceSelector,
} from './organization-ir';
import { analyzeExpression, evaluateExpression, type ExpressionValue } from './organization-expression';
import { semanticDigest, type SemanticDigest } from './organization-canonical';

export interface BehaviorContract {
  behavior: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  effects: EffectDecl[];
  tools: string[];
  memories: string[];
  context: BehaviorDecl['context'];
}

export interface EffectCoverage {
  effect: EffectDecl;
  status: 'covered' | 'conditional' | 'missing';
  grants: string[];
}

export interface BehaviorAssignmentAnalysis {
  contract?: BehaviorContract;
  effects: EffectCoverage[];
  errors: string[];
}

export interface AssembledInstruction {
  id: string;
  layer: InstructionLayer;
  role: InstructionFragment['role'];
  text?: string;
  source?: InstructionFragment['source'];
  priority: number;
}

export interface InstructionProgram {
  fragments: AssembledInstruction[];
  digest: SemanticDigest;
  errors: string[];
}

export interface InstructionAssemblyOptions {
  additional?: InstructionFragment[];
  environment?: Record<string, ExpressionValue>;
  opaqueCondition?: 'reject' | 'include' | 'exclude';
}

export type ContextKind = 'organization' | 'goal-ancestry' | 'work-ancestry' | 'actor' | 'artifacts' | 'conversation' | 'memory';
export type EvidenceStatus = 'reported' | 'observed' | 'inferred' | 'assumed' | 'attested' | 'verified';

export interface ContextItem {
  id: string;
  kind: ContextKind;
  content: unknown;
  tokens: number;
  priority?: number;
  required?: boolean;
  trust: 'trusted' | 'untrusted' | 'external';
  evidence: EvidenceStatus;
  labels?: Record<string, string>;
  provenance?: Array<{ uri: string; digest?: string }>;
}

export interface ContextPlan {
  included: ContextItem[];
  excluded: Array<{ id: string; reason: string }>;
  totalTokens: number;
  errors: string[];
}

export interface InvocationPlan {
  actor: string;
  behavior: string;
  implementation?: ImplementationChoice;
  instructions: InstructionProgram;
  context: ContextPlan;
  tools: string[];
  authority: string[];
  effects: EffectCoverage[];
}

export function deriveBehaviorContract(ir: OrganizationIR, behaviorId: string): { contract?: BehaviorContract; errors: string[] } {
  const errors: string[] = [];
  const active = new Set<string>();
  const collect = (id: string): BehaviorContract | undefined => {
    const behavior = ir.behaviors?.[id];
    if (!behavior) { errors.push(`unknown behavior '${id}'`); return undefined; }
    if (active.has(id)) { errors.push(`behavior composition cycle at '${id}'`); return undefined; }
    active.add(id);
    const nested = (behavior.behaviors ?? []).map(collect).filter((value): value is BehaviorContract => Boolean(value));
    active.delete(id);
    const tools = unique([...(behavior.tools ?? []), ...nested.flatMap((value) => value.tools)]);
    const effects = dedupeEffects([
      ...(behavior.effects ?? []),
      ...tools.flatMap((tool) => ir.tools?.[tool]?.effects ?? []),
      ...nested.flatMap((value) => value.effects),
    ]);
    return {
      behavior: id,
      inputs: mergeSignatures(nested.map((value) => value.inputs), behavior.inputs ?? {}, `behavior '${id}' inputs`, errors),
      outputs: mergeSignatures(nested.map((value) => value.outputs), behavior.outputs ?? {}, `behavior '${id}' outputs`, errors),
      effects, tools, memories: unique([...(behavior.memories ?? []), ...nested.flatMap((value) => value.memories)]),
      context: behavior.context,
    };
  };
  const contract = collect(behaviorId);
  return errors.length ? { errors } : { contract, errors };
}

export function analyzeBehaviorAssignment(ir: OrganizationIR, actorId: string, behaviorId: string): BehaviorAssignmentAnalysis {
  const actor = ir.actors[actorId];
  if (!actor) return { effects: [], errors: [`unknown actor '${actorId}'`] };
  if (!actor.behaviors.includes(behaviorId)) return { effects: [], errors: [`actor '${actorId}' is not assigned behavior '${behaviorId}'`] };
  const derived = deriveBehaviorContract(ir, behaviorId);
  if (!derived.contract) return { effects: [], errors: derived.errors };
  const effects = derived.contract.effects.map((effect): EffectCoverage => {
    const matches = (actor.capabilities ?? []).filter((grant) => {
      const capability = ir.capabilities?.[grant.capability];
      if (!capability) return false;
      const explicit = capability.effects?.some((allowed) => effectMatches(allowed, effect));
      const structural = capability.resourceKinds.includes(effect.resource) && capability.actions.includes(effect.action);
      return explicit || structural;
    });
    return {
      effect, grants: matches.map((grant) => grant.capability),
      status: !matches.length ? 'missing' : matches.some((grant) => grant.conditions?.length || grant.scope || grant.expires) ? 'conditional' : 'covered',
    };
  });
  const errors = [...derived.errors, ...effects.filter((item) => item.status === 'missing').map((item) =>
    `actor '${actorId}' lacks authority for ${item.effect.resource}:${item.effect.action}`)];
  return { contract: derived.contract, effects, errors };
}

export function checkBehaviorSubstitution(required: BehaviorContract, implementation: BehaviorContract): string[] {
  const errors: string[] = [];
  for (const [name, type] of Object.entries(required.inputs))
    if (implementation.inputs[name] !== type) errors.push(`implementation does not accept required input '${name}:${type}'`);
  for (const [name, type] of Object.entries(implementation.inputs))
    if (!(name in required.inputs)) errors.push(`implementation adds required input '${name}:${type}'`);
  for (const [name, type] of Object.entries(required.outputs))
    if (implementation.outputs[name] !== type) errors.push(`implementation does not produce required output '${name}:${type}'`);
  for (const effect of implementation.effects)
    if (!required.effects.some((allowed) => effectMatches(allowed, effect))) errors.push(`implementation adds effect ${effect.resource}:${effect.action}`);
  return errors;
}

export function assembleInstructions(assembly: InstructionAssembly, options: InstructionAssemblyOptions = {}): InstructionProgram {
  const precedence = assembly.precedence ?? ['constitution', 'organization', 'role', 'task', 'skill', 'conversation', 'runtime'];
  const errors: string[] = [];
  if (new Set(precedence).size !== precedence.length) errors.push('instruction precedence contains duplicate layers');
  const fragments = [...assembly.fragments, ...(options.additional ?? [])].flatMap((fragment, index) => {
    if (!includeFragment(fragment, options, errors, index)) return [];
    const layer = fragment.layer ?? defaultLayer(fragment.role);
    if (!precedence.includes(layer)) { errors.push(`instruction fragment '${fragment.id ?? index}' uses absent layer '${layer}'`); return []; }
    const id = fragment.id ?? `derived-${semanticDigest({ role: fragment.role, layer, text: fragment.text, source: fragment.source }, 'instruction-fragment').value.slice(0, 16)}`;
    return [{ id, layer, role: fragment.role, text: fragment.text, source: fragment.source, priority: fragment.priority ?? 0 } satisfies AssembledInstruction];
  });
  const selected = new Map<string, AssembledInstruction[]>();
  for (const fragment of fragments) selected.set(fragment.id, [...(selected.get(fragment.id) ?? []), fragment]);
  const output: AssembledInstruction[] = [];
  for (const [id, candidates] of selected) {
    const distinct = unique(candidates.map((item) => JSON.stringify(item)));
    if (distinct.length === 1) { output.push(candidates[0]); continue; }
    if (assembly.conflict === 'higher-precedence') {
      output.push([...candidates].sort((a, b) => rank(a, precedence) - rank(b, precedence) || b.priority - a.priority)[0]);
    } else if (assembly.conflict === 'runtime') output.push(...candidates);
    else errors.push(`conflicting instruction fragment id '${id}' cannot be resolved by ${assembly.conflict ?? 'reject'}`);
  }
  output.sort((a, b) => rank(a, precedence) - rank(b, precedence) || b.priority - a.priority || compare(a.id, b.id));
  return { fragments: output, digest: semanticDigest(output, 'instruction-program'), errors };
}

export function planContext(policy: ContextPolicy | undefined, items: ContextItem[]): ContextPlan {
  const errors: string[] = [];
  const excluded: ContextPlan['excluded'] = [];
  const byId = new Map<string, ContextItem>();
  for (const item of items) {
    if (!Number.isInteger(item.tokens) || item.tokens < 0) { errors.push(`context '${item.id}' has invalid token estimate`); continue; }
    const prior = byId.get(item.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item)) { errors.push(`context id '${item.id}' has conflicting content`); continue; }
    byId.set(item.id, structuredClone(item));
  }
  const allowed = new Set(policy?.include ?? ['organization', 'goal-ancestry', 'work-ancestry', 'actor', 'artifacts', 'conversation', 'memory']);
  const candidates = [...byId.values()].filter((item) => {
    if (!allowed.has(item.kind)) { excluded.push({ id: item.id, reason: `kind '${item.kind}' not included` }); return false; }
    const selector = policy?.exclude?.find((value) => matchesSelector(value, item, errors));
    if (selector) { excluded.push({ id: item.id, reason: 'excluded by resource selector' }); return false; }
    return true;
  }).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || compare(a.id, b.id));
  const included: ContextItem[] = [];
  let totalTokens = 0;
  const maximum = policy?.maximumTokens ?? Number.POSITIVE_INFINITY;
  for (const item of candidates) {
    if (totalTokens + item.tokens > maximum) {
      excluded.push({ id: item.id, reason: `token budget ${maximum} exceeded` });
      if (item.required) errors.push(`required context '${item.id}' exceeds token budget ${maximum}`);
      continue;
    }
    included.push(item); totalTokens += item.tokens;
  }
  excluded.sort((a, b) => compare(a.id, b.id));
  return { included, excluded, totalTokens, errors };
}

export function createInvocationPlan(
  ir: OrganizationIR, actorId: string, behaviorId: string, contextItems: ContextItem[],
  options: InstructionAssemblyOptions & { contextPolicy?: ContextPolicy; implementation?: ImplementationChoice } = {},
): { plan?: InvocationPlan; errors: string[] } {
  const analysis = analyzeBehaviorAssignment(ir, actorId, behaviorId);
  const behavior = ir.behaviors?.[behaviorId];
  const instructions = assembleInstructions(behavior?.instructions ?? { fragments: [] }, options);
  const context = planContext(options.contextPolicy, contextItems);
  const errors = [...analysis.errors, ...instructions.errors, ...context.errors];
  if (!analysis.contract || errors.length) return { errors };
  return { plan: {
    actor: actorId, behavior: behaviorId, implementation: options.implementation,
    instructions, context, tools: analysis.contract.tools,
    authority: unique((ir.actors[actorId].capabilities ?? []).map((grant) => grant.capability)), effects: analysis.effects,
  }, errors: [] };
}

function includeFragment(fragment: InstructionFragment, options: InstructionAssemblyOptions, errors: string[], index: number): boolean {
  if (!fragment.when) return true;
  const analysis = analyzeExpression(fragment.when);
  if (analysis.status === 'opaque') {
    if (options.opaqueCondition === 'include') return true;
    if (options.opaqueCondition === 'exclude') return false;
    errors.push(`instruction fragment '${fragment.id ?? index}' has opaque condition '${analysis.language}'`); return false;
  }
  const evaluated = evaluateExpression(fragment.when, options.environment ?? {});
  if (evaluated.errors.length || typeof evaluated.value !== 'boolean') {
    errors.push(`instruction fragment '${fragment.id ?? index}' condition: ${evaluated.errors.join(', ') || 'did not return boolean'}`); return false;
  }
  return evaluated.value;
}

function matchesSelector(selector: ResourceSelector, item: ContextItem, errors: string[]): boolean {
  if (selector.kind && selector.kind !== item.kind) return false;
  if (selector.ids?.length && !selector.ids.includes(item.id)) return false;
  if (selector.labels && !Object.entries(selector.labels).every(([key, value]) => item.labels?.[key] === value)) return false;
  if (selector.expression) {
    const analysis = analyzeExpression(selector.expression);
    if (analysis.status !== 'analyzed') { errors.push(`context exclusion expression is ${analysis.status}`); return false; }
    const result = evaluateExpression(selector.expression, { item: contextExpressionValue(item) });
    if (result.errors.length || typeof result.value !== 'boolean') { errors.push(`context exclusion expression failed: ${result.errors.join(', ')}`); return false; }
    return result.value;
  }
  return Boolean(selector.kind || selector.ids?.length || selector.labels);
}

function contextExpressionValue(item: ContextItem): ExpressionValue {
  return { id: item.id, kind: item.kind, trust: item.trust, evidence: item.evidence, tokens: item.tokens, labels: item.labels ?? {} };
}
function effectMatches(allowed: EffectDecl, required: EffectDecl): boolean {
  return allowed.resource === required.resource && allowed.action === required.action && (!required.mode || !allowed.mode || allowed.mode === required.mode);
}
function dedupeEffects(values: EffectDecl[]): EffectDecl[] { return unique(values.map((value) => JSON.stringify(value))).map((value) => JSON.parse(value)); }
function mergeSignatures(values: Record<string, string>[], own: Record<string, string>, path: string, errors: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const value of [...values, own]) for (const [name, type] of Object.entries(value)) {
    if (result[name] && result[name] !== type) errors.push(`${path}: conflicting type for '${name}'`);
    result[name] = type;
  }
  return result;
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function rank(value: AssembledInstruction, precedence: InstructionLayer[]): number { return precedence.indexOf(value.layer); }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function defaultLayer(role: InstructionFragment['role']): InstructionLayer {
  switch (role) {
    case 'constitution': return 'constitution'; case 'policy': case 'constraint': return 'organization';
    case 'identity': return 'role'; case 'procedure': case 'context': return 'task'; case 'example': return 'skill'; case 'user': return 'conversation';
  }
}
