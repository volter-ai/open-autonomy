export const RUNTIME_LEDGER_SCHEMA = 'open-autonomy.runtime-ledger.v1' as const;

export type RuntimeAssurance = 'unknown' | 'assumed' | 'externally-attested' | 'live-observed' |
  'conformance-tested' | 'property-tested' | 'model-checked' | 'statically-checked' | 'proved';
export type RuntimeDisposition = 'unresolved' | 'preserved' | 'adapter-realized' | 'approximated' | 'rejected';
export type CheckpointStatus = 'blocked' | 'ready' | 'in-progress' | 'complete';

export interface EvidenceReference {
  id: string;
  kind: 'test' | 'artifact' | 'live-run' | 'attestation' | 'review';
  uri: string;
  digest?: string;
  producedAt?: string;
  producer: string;
}

export interface RuntimeObligationEntry {
  id: string;
  checkpoint: string;
  owner: string;
  disposition: RuntimeDisposition;
  assurance: RuntimeAssurance;
  evidence: string[];
  rationale?: string;
  losses?: string[];
}

export interface RuntimeResidualEntry {
  id: string;
  checkpoint: string;
  category: 'semantic' | 'assurance' | 'implementation' | 'operational' | 'security' | 'measurement' | 'portability';
  finding: string;
  owner: string;
  disposition: 'open' | 'accepted' | 'rejected' | 'resolved';
  rationale?: string;
}

export interface RuntimeLedgerCorpus {
  schema: typeof RUNTIME_LEDGER_SCHEMA;
  obligationLedger: RuntimeObligationEntry[];
  semanticCoverageLedger: Array<{ construct: string; checkpoint: string; disposition: RuntimeDisposition; obligationIds: string[] }>;
  residualLedger: RuntimeResidualEntry[];
  checkpointStateLedger: Array<{ id: string; status: CheckpointStatus; dependsOn: string[] }>;
  evidenceLedger: EvidenceReference[];
}

export interface RuntimeLedgerDiagnostic { code: string; path: string; message: string }
export interface RuntimeCheckpointDefinition { id: string; dependsOn: string[] }

const assuranceRank: Record<RuntimeAssurance, number> = {
  unknown: 0, assumed: 1, 'externally-attested': 2, 'live-observed': 3,
  'conformance-tested': 4, 'property-tested': 5, 'model-checked': 6,
  'statically-checked': 7, proved: 8,
};

/** Validate proof accounting without interpreting whether evidence is persuasive. */
export function validateRuntimeLedger(
  corpus: RuntimeLedgerCorpus,
  expectedObligations: readonly string[],
  authoritativeCheckpoints: readonly RuntimeCheckpointDefinition[] = [],
): RuntimeLedgerDiagnostic[] {
  const errors: RuntimeLedgerDiagnostic[] = [];
  const expected = new Set(expectedObligations);
  const evidence = new Set(corpus.evidenceLedger.map((entry) => entry.id));
  const evidenceSeen = new Set<string>();
  const validAssurance = new Set(Object.keys(assuranceRank));
  const validDisposition = new Set(['unresolved', 'preserved', 'adapter-realized', 'approximated', 'rejected']);
  const validStatus = new Set(['blocked', 'ready', 'in-progress', 'complete']);
  const validEvidenceKind = new Set(['test', 'artifact', 'live-run', 'attestation', 'review']);
  const checkpoints = new Map(corpus.checkpointStateLedger.map((entry) => [entry.id, entry]));
  const authoritative = new Map(authoritativeCheckpoints.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  if (corpus.schema !== RUNTIME_LEDGER_SCHEMA) errors.push({ code: 'schema.unsupported', path: 'schema', message: `unsupported schema ${corpus.schema}` });
  for (const [index, entry] of corpus.obligationLedger.entries()) {
    const path = `obligationLedger[${index}]`;
    if (!expected.has(entry.id)) errors.push({ code: 'obligation.unknown', path: `${path}.id`, message: `unknown obligation ${entry.id}` });
    if (seen.has(entry.id)) errors.push({ code: 'obligation.duplicate', path: `${path}.id`, message: `duplicate obligation ${entry.id}` });
    seen.add(entry.id);
    if (entry.checkpoint !== entry.id.split('-')[0]) errors.push({ code: 'obligation.checkpoint', path: `${path}.checkpoint`, message: 'checkpoint does not match obligation ID' });
    if (!validDisposition.has(entry.disposition)) errors.push({ code: 'obligation.invalid-disposition', path: `${path}.disposition`, message: `invalid disposition ${entry.disposition}` });
    if (!validAssurance.has(entry.assurance)) errors.push({ code: 'obligation.invalid-assurance', path: `${path}.assurance`, message: `invalid assurance ${entry.assurance}` });
    if ((entry.disposition === 'rejected' || entry.disposition === 'approximated') && !entry.rationale) errors.push({ code: 'obligation.rationale', path, message: `${entry.disposition} requires rationale` });
    if (entry.disposition === 'approximated' && !entry.losses?.length) errors.push({ code: 'obligation.loss', path, message: 'approximated requires typed losses' });
    for (const id of entry.evidence) if (!evidence.has(id)) errors.push({ code: 'evidence.missing', path: `${path}.evidence`, message: `unknown evidence ${id}` });
  }
  for (const id of expected) if (!seen.has(id)) errors.push({ code: 'obligation.missing', path: 'obligationLedger', message: `missing obligation ${id}` });
  for (const [index, entry] of corpus.evidenceLedger.entries()) {
    if (!entry.id || evidenceSeen.has(entry.id)) errors.push({ code: 'evidence.duplicate', path: `evidenceLedger[${index}].id`, message: `empty or duplicate evidence ID ${entry.id}` });
    evidenceSeen.add(entry.id);
    if (!entry.uri || !entry.producer) errors.push({ code: 'evidence.provenance', path: `evidenceLedger[${index}]`, message: 'evidence requires uri and producer' });
    if (!validEvidenceKind.has(entry.kind)) errors.push({ code: 'evidence.kind', path: `evidenceLedger[${index}].kind`, message: `invalid evidence kind ${entry.kind}` });
  }
  const checkpointSeen = new Set<string>();
  for (const [index, state] of corpus.checkpointStateLedger.entries()) {
    if (checkpointSeen.has(state.id)) errors.push({ code: 'checkpoint.duplicate', path: `checkpointStateLedger[${index}].id`, message: `duplicate checkpoint ${state.id}` });
    checkpointSeen.add(state.id);
    if (!validStatus.has(state.status)) errors.push({ code: 'checkpoint.invalid-status', path: `checkpointStateLedger[${index}].status`, message: `invalid status ${state.status}` });
    const definition = authoritative.get(state.id);
    if (authoritative.size && !definition) errors.push({ code: 'checkpoint.unknown', path: `checkpointStateLedger[${index}].id`, message: `unknown checkpoint ${state.id}` });
    if (definition && JSON.stringify(state.dependsOn) !== JSON.stringify(definition.dependsOn)) errors.push({ code: 'checkpoint.dependencies', path: `checkpointStateLedger[${index}].dependsOn`, message: `${state.id} dependencies differ from authority` });
    if (state.status !== 'complete') continue;
    for (const dependency of state.dependsOn) if (checkpoints.get(dependency)?.status !== 'complete') {
      errors.push({ code: 'checkpoint.open-dependency', path: `checkpointStateLedger[${index}].status`, message: `${state.id} depends on incomplete ${dependency}` });
    }
    const unresolved = corpus.obligationLedger.find((entry) => entry.checkpoint === state.id && (entry.disposition === 'unresolved' || !validAssurance.has(entry.assurance) || assuranceRank[entry.assurance] < assuranceRank['externally-attested'] || entry.evidence.length === 0));
    if (unresolved) errors.push({ code: 'checkpoint.unresolved-obligation', path: `checkpointStateLedger[${index}].status`, message: `${state.id} has unresolved ${unresolved.id}` });
    const residual = corpus.residualLedger.find((entry) => entry.checkpoint === state.id && entry.disposition === 'open');
    if (residual) errors.push({ code: 'checkpoint.open-residual', path: `checkpointStateLedger[${index}].status`, message: `${state.id} has open residual ${residual.id}` });
    if (!corpus.semanticCoverageLedger.some((entry) => entry.checkpoint === state.id)) errors.push({ code: 'checkpoint.missing-coverage', path: `checkpointStateLedger[${index}].status`, message: `${state.id} has no semantic coverage` });
  }
  for (const definition of authoritativeCheckpoints) if (!checkpointSeen.has(definition.id)) errors.push({ code: 'checkpoint.missing', path: 'checkpointStateLedger', message: `missing checkpoint ${definition.id}` });
  for (const [index, entry] of corpus.semanticCoverageLedger.entries()) {
    if (!entry.construct || !authoritative.has(entry.checkpoint) || entry.obligationIds.length === 0 || entry.obligationIds.some((id) => !expected.has(id))) errors.push({ code: 'coverage.invalid', path: `semanticCoverageLedger[${index}]`, message: 'coverage requires a construct, known checkpoint, and known obligations' });
  }
  for (const [index, entry] of corpus.residualLedger.entries()) {
    if (!entry.id || !entry.finding || !entry.owner || !authoritative.has(entry.checkpoint)) errors.push({ code: 'residual.invalid', path: `residualLedger[${index}]`, message: 'residual requires identity, finding, owner, and known checkpoint' });
    if ((entry.disposition === 'accepted' || entry.disposition === 'rejected') && !entry.rationale) errors.push({ code: 'residual.rationale', path: `residualLedger[${index}]`, message: `${entry.disposition} residual requires rationale` });
  }
  return errors.sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
}

export function validateCheckpointTransition(from: CheckpointStatus, to: CheckpointStatus): boolean {
  return from === to || ({ blocked: ['ready'], ready: ['in-progress', 'blocked'], 'in-progress': ['complete', 'blocked'], complete: [] }[from] as CheckpointStatus[]).includes(to);
}
