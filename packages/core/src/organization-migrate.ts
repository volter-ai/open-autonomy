import type { PassSourceRelation } from './organization-compiler';

export type VersionedArtifactKind = 'profile' | 'organization' | 'component' | 'deployment' | 'state' | 'normalized';
export type MigrationFieldDisposition = 'preserved' | 'renamed' | 'transformed' | 'defaulted' | 'removed';

export interface MigrationDisposition {
  source: string;
  target?: string;
  disposition: MigrationFieldDisposition;
  explanation?: string;
}

export interface MigrationStepResult {
  document: unknown;
  dispositions: MigrationDisposition[];
  sourceMap?: PassSourceRelation[];
}

export interface MigrationEdge {
  id: string;
  kind: VersionedArtifactKind;
  from: string;
  to: string;
  lossy?: boolean;
  migrate(document: Readonly<unknown>): MigrationStepResult;
  validate?(document: unknown): string[];
}

export interface MigrationPlan {
  kind: VersionedArtifactKind;
  from: string;
  to: string;
  steps: string[];
  lossy: boolean;
}

export interface MigrationOptions {
  allowLossy?: boolean;
}

export interface MigrationResult {
  document?: unknown;
  plan?: MigrationPlan;
  dispositions: MigrationDisposition[];
  sourceMap: PassSourceRelation[];
  errors: string[];
}

export interface ReplayVersionPin {
  organizationDigest: string;
  eventSchema: string;
  reducerVersion: string;
  compilerVersion: string;
}

export class ArtifactMigrationRegistry {
  readonly #edges = new Map<string, MigrationEdge>();

  register(edge: MigrationEdge): void {
    if (!/^[A-Za-z][A-Za-z0-9._/-]*$/.test(edge.id)) throw new Error(`invalid migration id '${edge.id}'`);
    if (edge.from === edge.to) throw new Error(`migration '${edge.id}' must change version`);
    if (this.#edges.has(edge.id)) throw new Error(`migration '${edge.id}' is already registered`);
    if ([...this.#edges.values()].some((value) => value.kind === edge.kind && value.from === edge.from && value.to === edge.to))
      throw new Error(`migration edge ${edge.kind} ${edge.from} -> ${edge.to} is already registered`);
    this.#edges.set(edge.id, edge);
  }

  plan(kind: VersionedArtifactKind, from: string, to: string): MigrationPlan | undefined {
    if (from === to) return { kind, from, to, steps: [], lossy: false };
    const edges = [...this.#edges.values()].filter((edge) => edge.kind === kind).sort((a, b) => compareText(a.id, b.id));
    const queue: Array<{ version: string; steps: MigrationEdge[] }> = [{ version: from, steps: [] }];
    const visited = new Set([from]);
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of edges.filter((candidate) => candidate.from === current.version)) {
        const steps = [...current.steps, edge];
        if (edge.to === to) return { kind, from, to, steps: steps.map((step) => step.id), lossy: steps.some((step) => step.lossy) };
        if (!visited.has(edge.to)) { visited.add(edge.to); queue.push({ version: edge.to, steps }); }
      }
    }
    return undefined;
  }

  migrate(kind: VersionedArtifactKind, from: string, to: string, document: unknown, options: MigrationOptions = {}): MigrationResult {
    const plan = this.plan(kind, from, to);
    if (!plan) return { dispositions: [], sourceMap: [], errors: [`OA-MIGRATION-NO-PATH: ${kind} ${from} -> ${to}`] };
    if (plan.lossy && !options.allowLossy)
      return { plan, dispositions: [], sourceMap: [], errors: [`OA-MIGRATION-LOSS-NOT-AUTHORIZED: ${kind} ${from} -> ${to}`] };
    let current = structuredClone(document);
    const dispositions: MigrationDisposition[] = [];
    let sourceMap: PassSourceRelation[] = [];
    for (const id of plan.steps) {
      const edge = this.#edges.get(id)!;
      let result: MigrationStepResult;
      try { result = edge.migrate(deepFreeze(structuredClone(current))); }
      catch (error) {
        return { plan, dispositions, sourceMap, errors: [`OA-MIGRATION-STEP-FAILED ${id}: ${error instanceof Error ? error.message : String(error)}`] };
      }
      if (!Array.isArray(result.dispositions))
        return { plan, dispositions, sourceMap, errors: [`OA-MIGRATION-MISSING-DISPOSITIONS: ${id}`] };
      if (result.dispositions.length === 0)
        return { plan, dispositions, sourceMap, errors: [`OA-MIGRATION-MISSING-DISPOSITIONS: ${id} records no field accounting`] };
      const removed = removedPointers(current, result.document).filter((pointer) =>
        !result.dispositions.some((item) => item.source === pointer || pointer.startsWith(`${item.source}/`)));
      if (removed.length)
        return { plan, dispositions, sourceMap, errors: [`OA-MIGRATION-UNACCOUNTED-REMOVAL ${id}: ${removed.join(', ')}`] };
      const validation = edge.validate?.(result.document) ?? [];
      if (validation.length) return { plan, dispositions, sourceMap, errors: validation.map((message) => `OA-MIGRATION-INVALID-RESULT ${id}: ${message}`) };
      current = structuredClone(result.document);
      dispositions.push(...structuredClone(result.dispositions));
      sourceMap = composeMigrationMaps(sourceMap, result.sourceMap ?? []);
    }
    return { document: current, plan, dispositions, sourceMap, errors: [] };
  }
}

function composeMigrationMaps(previous: PassSourceRelation[], next: PassSourceRelation[]): PassSourceRelation[] {
  if (!previous.length) return structuredClone(next);
  if (!next.length) return previous;
  const byOutput = new Map(previous.map((item) => [item.output, item.sources]));
  return next.map((item) => ({
    output: item.output,
    sources: item.sources.flatMap((source) => byOutput.get(source.location) ?? [source]),
  }));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

function removedPointers(before: unknown, after: unknown, path = ''): string[] {
  if (!before || typeof before !== 'object' || Array.isArray(before)) return [];
  const left = before as Record<string, unknown>;
  const right = after && typeof after === 'object' && !Array.isArray(after) ? after as Record<string, unknown> : {};
  const removed: string[] = [];
  for (const key of Object.keys(left)) {
    const pointer = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    if (!(key in right)) removed.push(pointer);
    else removed.push(...removedPointers(left[key], right[key], pointer));
  }
  return removed;
}
