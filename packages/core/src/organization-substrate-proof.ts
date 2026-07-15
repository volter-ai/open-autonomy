import { canonicalSemanticJson, type SemanticDigest } from './organization-canonical';
import type { NormalizedOrganizationIR } from './organization-normalize';
import type { DeploymentCandidateV2 } from './organization-solver';
import type { AcceptedCausalHistory, TraceConformanceReport } from './organization-causal-state';
import { materializeCausalHistory } from './organization-causal-state';
import type { OrganizationIR } from './organization-ir';

export interface ComparableMeasurement {
  value: number;
  unit: string;
  uncertainty: 'exact' | 'bounded' | 'estimated' | 'volatile' | 'unknown';
  observedAt: string;
}

export interface FailureScenarioResult {
  scenario: 'restart' | 'duplicate-delivery' | 'worker-loss' | 'delayed-input' | 'review-rejection' | 'budget-exhaustion' | string;
  outcome: 'recovered' | 'degraded' | 'failed' | 'unknown';
  assumptions: string[];
  observations: string[];
}

export interface SubstrateRealizationProof {
  id: string;
  normalized: NormalizedOrganizationIR;
  deployment: DeploymentCandidateV2;
  history: AcceptedCausalHistory;
  conformance: TraceConformanceReport;
  measurements: Record<'cost' | 'latency' | 'capacity' | 'humanLoad', ComparableMeasurement>;
  failures: FailureScenarioResult[];
  sourceRevision: string;
}

export interface BehavioralResidual {
  category: 'assumption' | 'loss' | 'failure' | 'economic' | 'operation' | 'trace';
  property: string;
  left: unknown;
  right: unknown;
  semanticImpact: 'none' | 'stronger-assumption' | 'weaker-guarantee' | 'incomparable' | 'unknown';
}

export interface SubstrateComparisonReport {
  status: 'independent' | 'not-independent' | 'undetermined';
  canonicalBytesEqual: boolean;
  digest?: SemanticDigest;
  portableStateEqual: boolean;
  obligationSetEqual: boolean;
  residuals: BehavioralResidual[];
  errors: string[];
}

export function compareSubstrateRealizations(definition: OrganizationIR, left: SubstrateRealizationProof, right: SubstrateRealizationProof, forbiddenProductVocabulary = ['hermes', 'paperclip']): SubstrateComparisonReport {
  const errors: string[] = [];
  const leftBytes = semanticPayload(left.normalized); const rightBytes = semanticPayload(right.normalized);
  const canonicalBytesEqual = leftBytes === rightBytes;
  if (!canonicalBytesEqual) errors.push('canonical semantic payload differs across substrates');
  if (JSON.stringify(left.normalized.digest) !== JSON.stringify(right.normalized.digest)) errors.push('semantic digest differs across substrates');
  const vocabulary = forbiddenProductVocabulary.filter((token) => containsProductVocabulary(leftBytes, token) || containsProductVocabulary(rightBytes, token));
  if (vocabulary.length) errors.push(`Organization IR contains product-specific vocabulary: ${vocabulary.join(', ')}`);
  const leftState = materializeCausalHistory(definition, left.history); const rightState = materializeCausalHistory(definition, right.history);
  if (leftState.errors.length) errors.push(...leftState.errors.map((error) => `${left.id}: ${error}`));
  if (rightState.errors.length) errors.push(...rightState.errors.map((error) => `${right.id}: ${error}`));
  const portableStateEqual = Boolean(leftState.state && rightState.state && stateProjection(leftState.state) === stateProjection(rightState.state));
  if (!portableStateEqual) errors.push('projected portable states differ');
  const leftObligations = [...left.deployment.ledger.obligations.map((item) => item.id)].sort();
  const rightObligations = [...right.deployment.ledger.obligations.map((item) => item.id)].sort();
  const obligationSetEqual = JSON.stringify(leftObligations) === JSON.stringify(rightObligations);
  if (!obligationSetEqual) errors.push('source obligation sets differ');
  if (left.deployment.ledger.unresolved.length || right.deployment.ledger.unresolved.length) errors.push('one or more deployment obligations are unresolved');
  if (left.conformance.status === 'nonconformant' || right.conformance.status === 'nonconformant') errors.push('one or more projected traces are nonconformant');
  const residuals = compareResiduals(left, right);
  const semanticResidual = residuals.some((item) => item.semanticImpact === 'weaker-guarantee' || item.semanticImpact === 'unknown');
  return { status: errors.length ? 'not-independent' : semanticResidual || left.conformance.status === 'undetermined' || right.conformance.status === 'undetermined' ? 'undetermined' : 'independent', canonicalBytesEqual, digest: canonicalBytesEqual ? structuredClone(left.normalized.digest) : undefined, portableStateEqual, obligationSetEqual, residuals, errors };
}

function semanticPayload(normalized: NormalizedOrganizationIR): string {
  return canonicalSemanticJson({ schema: 'autonomy.normalized-organization-semantics.v1', root: normalized.root, modules: normalized.modules });
}
function containsProductVocabulary(bytes: string, token: string): boolean {
  const normalized = token.toLowerCase();
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(normalized)}([^a-z0-9]|$)`, 'i').test(bytes);
}
function stateProjection(state: NonNullable<ReturnType<typeof materializeCausalHistory>['state']>): string {
  return canonicalSemanticJson({ organization: state.organization, work: state.work, attempts: state.attempts, claims: state.claims, conversations: state.conversations, decisions: state.decisions, artifacts: state.artifacts, budgetUsage: state.budgetUsage });
}
function compareResiduals(left: SubstrateRealizationProof, right: SubstrateRealizationProof): BehavioralResidual[] {
  const residuals: BehavioralResidual[] = [];
  const leftAssumptions = [...new Set(left.deployment.ledger.witnesses.flatMap((item) => item.assumptions))].sort();
  const rightAssumptions = [...new Set(right.deployment.ledger.witnesses.flatMap((item) => item.assumptions))].sort();
  if (JSON.stringify(leftAssumptions) !== JSON.stringify(rightAssumptions)) residuals.push({ category: 'assumption', property: 'accepted deployment assumptions', left: leftAssumptions, right: rightAssumptions, semanticImpact: 'stronger-assumption' });
  const leftLosses = [...new Set(left.deployment.ledger.witnesses.flatMap((item) => item.losses))].sort();
  const rightLosses = [...new Set(right.deployment.ledger.witnesses.flatMap((item) => item.losses))].sort();
  if (JSON.stringify(leftLosses) !== JSON.stringify(rightLosses)) residuals.push({ category: 'loss', property: 'declared semantic losses', left: leftLosses, right: rightLosses, semanticImpact: leftLosses.length || rightLosses.length ? 'weaker-guarantee' : 'none' });
  const scenarios = [...new Set([...left.failures.map((item) => item.scenario), ...right.failures.map((item) => item.scenario)])].sort();
  for (const scenario of scenarios) {
    const a = left.failures.find((item) => item.scenario === scenario); const b = right.failures.find((item) => item.scenario === scenario);
    if (JSON.stringify(a) !== JSON.stringify(b)) residuals.push({ category: 'failure', property: scenario, left: a, right: b, semanticImpact: a && b ? 'incomparable' : 'unknown' });
  }
  for (const property of ['cost', 'latency', 'capacity', 'humanLoad'] as const) {
    const a = left.measurements[property]; const b = right.measurements[property];
    if (a.unit !== b.unit) residuals.push({ category: 'economic', property, left: a, right: b, semanticImpact: 'incomparable' });
    else if (JSON.stringify(a) !== JSON.stringify(b)) residuals.push({ category: 'economic', property, left: a, right: b, semanticImpact: 'none' });
  }
  if (left.sourceRevision !== right.sourceRevision) residuals.push({ category: 'operation', property: 'provider implementation revision', left: left.sourceRevision, right: right.sourceRevision, semanticImpact: 'none' });
  if (left.conformance.status !== right.conformance.status) residuals.push({ category: 'trace', property: 'conformance assurance', left: left.conformance.status, right: right.conformance.status, semanticImpact: 'incomparable' });
  return residuals;
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
