import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export type PatchOperation =
  | { kind: "profile"; path: string; from: unknown; to: unknown }
  | { kind: "component"; component: string; action: "add" | "remove" | "replace"; value?: unknown }
  | { kind: "capacity"; component: string; from: number; to: number }
  | { kind: "routing"; route: string; from: number; to: number }
  | { kind: "retry"; component: string; from: number; to: number }
  | { kind: "review"; stage: string; from: string; to: string }
  | { kind: "human-seam"; seam: string; from: string; to: string };
export type OrganizationPatch = { schema: "autonomy.organization-patch.v1"; id: string; operations: PatchOperation[] };
export type CandidateClaim = "prediction" | "causal";
export type Candidate = { id: string; patch: OrganizationPatch; claim: CandidateClaim; targetParameters: Array<{ name: string; identifiable: boolean; confoundedWith: string[] }>; rationale: string; assumptions: string[]; risks: string[]; rollbackTrigger: string };

export type PlannerObjective = { metric: string; direction: "minimize" | "maximize"; uncertaintyAversion: number; maximum?: number; minimum?: number };
export type PlannerConstraints = {
  allowedSemanticPaths: string[];
  maximumAuthority: Record<string, number>;
  baselineAuthority: Record<string, number>;
  budget: number;
  requiredApprovals: string[];
  grantedApprovals: string[];
  rolloutMaximumFraction: number;
  candidateRolloutFractions: Record<string, number>;
  maximumComplexity: number;
  minimumMetricCoverage: number;
  maximumProxyGap: number;
  maximumDistributionShift: number;
  maximumBacktestMae: number;
  minimumBacktestCoverage: number;
};
export type ConstraintInspection = {
  cost: number;
  authority: Record<string, number>;
  semanticPaths: string[];
  proxy: { reportedEscalations: number; latentFailures: number; attributedHumanMinutes: number; actualHumanMinutes: number; metricCoverage: number; distributionShift: number };
  evidence: string[];
};
export type OracleEvaluation = ConstraintInspection & { metrics: Record<string, { point: number; uncertainty: number }>; backtest: Array<{ predicted: number; interval: [number, number]; actual: number }> };
export interface CounterfactualOracle { inspect(candidate: Candidate): ConstraintInspection; evaluate(candidate: Candidate): OracleEvaluation }

export type CandidateAssessment = { candidate: Candidate; inspection?: ConstraintInspection; evaluation?: OracleEvaluation; feasible: boolean; violations: string[]; robustObjectives?: Record<string, number>; backtest?: { meanAbsoluteError: number; coverage: number }; dominatedBy: string[] };
export type PlannerCertificate = {
  schema: "autonomy.counterfactual-certificate.v1";
  specificationDigest: string;
  baselineId: string;
  assessments: CandidateAssessment[];
  paretoFront: string[];
  recommendation?: string;
  outcome: "recommended" | "tradeoff" | "refused";
  rationale: string;
  digest: string;
};

export function searchCounterfactuals(candidates: Candidate[], baselineId: string, objectives: PlannerObjective[], constraints: PlannerConstraints, oracle: CounterfactualOracle): PlannerCertificate {
  validateInputs(candidates, baselineId, objectives, constraints);
  const assessments: CandidateAssessment[] = [];
  for (const candidate of candidates) {
    const violations = preflight(candidate, constraints);
    if (violations.length) { assessments.push({ candidate: structuredClone(candidate), feasible: false, violations, dominatedBy: [] }); continue; }
    const inspection = oracle.inspect(structuredClone(candidate)), constraintViolations = evaluateStructuralConstraints(inspection, constraints);
    if (constraintViolations.length) { assessments.push({ candidate: structuredClone(candidate), inspection: structuredClone(inspection), feasible: false, violations: constraintViolations, dominatedBy: [] }); continue; }
    const evaluation = oracle.evaluate(structuredClone(candidate)), post = evaluateConstraints(candidate, evaluation, objectives, constraints), backtest = scoreBacktest(evaluation.backtest);
    post.push(...(backtest.meanAbsoluteError > constraints.maximumBacktestMae ? ["backtest-mae"] : []), ...(backtest.coverage < constraints.minimumBacktestCoverage ? ["backtest-coverage"] : []));
    const robustObjectives = Object.fromEntries(objectives.map((o) => [o.metric, robustValue(evaluation.metrics[o.metric]!, o)]));
    assessments.push({ candidate: structuredClone(candidate), inspection: structuredClone(inspection), evaluation: structuredClone(evaluation), feasible: post.length === 0, violations: post, robustObjectives, backtest, dominatedBy: [] });
  }
  const feasible = assessments.filter((a) => a.feasible);
  for (const assessment of feasible) assessment.dominatedBy = feasible.filter((other) => other !== assessment && dominates(other, assessment, objectives)).map((other) => other.candidate.id).sort();
  const paretoFront = feasible.filter((a) => !a.dominatedBy.length).map((a) => a.candidate.id).sort();
  const baseline = assessments.find((a) => a.candidate.id === baselineId)!;
  let recommendation: string | undefined, outcome: PlannerCertificate["outcome"], rationale: string;
  if (!feasible.length || !baseline.feasible) { outcome = "refused"; rationale = !baseline.feasible ? "no-op baseline is infeasible under declared constraints" : "no feasible candidates"; }
  else {
    const nonBaseline = paretoFront.filter((id) => id !== baselineId);
    const unique = nonBaseline.length === 1 ? feasible.find((a) => a.candidate.id === nonBaseline[0]) : undefined;
    if (unique && feasible.every((a) => a === unique || dominates(unique, a, objectives))) { recommendation = unique.candidate.id; outcome = "recommended"; rationale = "candidate robustly Pareto-dominates every other feasible candidate under declared objectives"; }
    else { outcome = "tradeoff"; rationale = "Pareto frontier has no unique dominating intervention; external decision required"; }
  }
  const specificationDigest = plannerDigest({ candidates, baselineId, objectives, constraints }), body = { schema: "autonomy.counterfactual-certificate.v1" as const, specificationDigest, baselineId, assessments, paretoFront, ...(recommendation ? { recommendation } : {}), outcome, rationale };
  return { ...body, digest: plannerDigest(body) };
}

export function verifyPlannerCertificate(certificate: PlannerCertificate, candidates: Candidate[], baselineId: string, objectives: PlannerObjective[], constraints: PlannerConstraints): string[] {
  const errors: string[] = [], { digest, ...body } = certificate;
  if (digest !== plannerDigest(body)) errors.push("certificate-digest");
  if (certificate.specificationDigest !== plannerDigest({ candidates, baselineId, objectives, constraints })) errors.push("specification-binding");
  if (certificate.baselineId !== baselineId || !candidates.some((c) => c.id === baselineId)) errors.push("baseline-binding");
  if (certificate.assessments.length !== candidates.length || new Set(certificate.assessments.map((a) => a.candidate.id)).size !== candidates.length) errors.push("candidate-completeness");
  for (const assessment of certificate.assessments) {
    const declared = candidates.find((c) => c.id === assessment.candidate.id); if (!declared || plannerDigest(declared) !== plannerDigest(assessment.candidate)) { errors.push(`candidate-binding:${assessment.candidate.id}`); continue; }
    const pre = preflight(assessment.candidate, constraints);
    if (pre.some((v) => !assessment.violations.includes(v))) errors.push(`preflight-omission:${assessment.candidate.id}`);
    if (assessment.feasible && (!assessment.evaluation || pre.length || assessment.violations.length)) errors.push(`false-feasible:${assessment.candidate.id}`);
    if (assessment.inspection && evaluateStructuralConstraints(assessment.inspection, constraints).some((v) => !assessment.violations.includes(v))) errors.push(`inspection-recompute:${assessment.candidate.id}`);
    if (assessment.evaluation) {
      const post = evaluateConstraints(assessment.candidate, assessment.evaluation, objectives, constraints), backtest = scoreBacktest(assessment.evaluation.backtest), robust = Object.fromEntries(objectives.map((o) => [o.metric, robustValue(assessment.evaluation!.metrics[o.metric]!, o)]));
      if (backtest.meanAbsoluteError > constraints.maximumBacktestMae) post.push("backtest-mae");
      if (backtest.coverage < constraints.minimumBacktestCoverage) post.push("backtest-coverage");
      if (post.some((v) => !assessment.violations.includes(v)) || plannerDigest(backtest) !== plannerDigest(assessment.backtest) || plannerDigest(robust) !== plannerDigest(assessment.robustObjectives)) errors.push(`evaluation-recompute:${assessment.candidate.id}`);
    }
  }
  const feasible = certificate.assessments.filter((a) => a.feasible), expectedFront = feasible.filter((a) => !feasible.some((other) => other !== a && dominates(other, a, objectives))).map((a) => a.candidate.id).sort();
  if (plannerDigest(expectedFront) !== plannerDigest(certificate.paretoFront)) errors.push("pareto-recompute");
  if (certificate.recommendation) { const chosen = feasible.find((a) => a.candidate.id === certificate.recommendation); if (!chosen || !feasible.every((a) => a === chosen || dominates(chosen, a, objectives))) errors.push("recommendation-not-dominating"); }
  return errors;
}

function preflight(candidate: Candidate, c: PlannerConstraints) {
  const out: string[] = [];
  if (!candidate.id || candidate.patch.schema !== "autonomy.organization-patch.v1" || candidate.patch.id !== candidate.id || !candidate.rationale || !candidate.rollbackTrigger) out.push("patch-shape");
  if (candidate.patch.operations.length > c.maximumComplexity) out.push("complexity");
  for (const op of candidate.patch.operations) {
    if (op.kind === "profile" && !c.allowedSemanticPaths.some((path) => op.path === path || op.path.startsWith(`${path}.`))) out.push(`semantic:${op.path}`);
    if (op.kind === "capacity" && (!Number.isFinite(op.to) || op.to < 0) || op.kind === "retry" && (!Number.isSafeInteger(op.to) || op.to < 0) || op.kind === "routing" && (op.to < 0 || op.to > 1)) out.push("patch-domain");
  }
  if (candidate.claim === "causal" && candidate.targetParameters.some((p) => !p.identifiable || p.confoundedWith.length)) out.push("causal-nonidentifiable");
  if (c.requiredApprovals.some((a) => !c.grantedApprovals.includes(a))) out.push("governance-approval");
  const rollout = c.candidateRolloutFractions[candidate.id]; if (!Number.isFinite(rollout) || rollout! < 0 || rollout! > c.rolloutMaximumFraction) out.push("rollout-bound");
  return [...new Set(out)].sort();
}
function evaluateConstraints(candidate: Candidate, e: OracleEvaluation, objectives: PlannerObjective[], c: PlannerConstraints) {
  const out: string[] = evaluateStructuralConstraints(e,c);
  if (!e.evidence.length || Object.values(e.metrics).some((m) => !Number.isFinite(m.point) || !Number.isFinite(m.uncertainty) || m.uncertainty < 0) || objectives.some((o) => !e.metrics[o.metric])) out.push("oracle-evidence");
  for (const objective of objectives) { const metric = e.metrics[objective.metric]; if (metric && objective.maximum !== undefined && metric.point > objective.maximum) out.push(`objective-maximum:${objective.metric}`); if (metric && objective.minimum !== undefined && metric.point < objective.minimum) out.push(`objective-minimum:${objective.metric}`); }
  return [...new Set(out)].sort();
}
function evaluateStructuralConstraints(e: ConstraintInspection, c: PlannerConstraints) { const out:string[]=[]; if (!e.evidence.length) out.push("oracle-evidence"); if (e.cost > c.budget) out.push("budget"); for (const [scope,value] of Object.entries(e.authority)) if (value > (c.maximumAuthority[scope] ?? 0) || value > (c.baselineAuthority[scope] ?? 0)) out.push(`authority-expansion:${scope}`); if (e.semanticPaths.some((path) => !c.allowedSemanticPaths.some((allowed) => path === allowed || path.startsWith(`${allowed}.`)))) out.push("semantic-boundary"); if (e.proxy.metricCoverage < c.minimumMetricCoverage) out.push("metric-coverage"); if (e.proxy.latentFailures-e.proxy.reportedEscalations > c.maximumProxyGap) out.push("proxy-gaming"); if (e.proxy.actualHumanMinutes > e.proxy.attributedHumanMinutes) out.push("hidden-human-labor"); if (e.proxy.distributionShift > c.maximumDistributionShift) out.push("distribution-shift"); return [...new Set(out)].sort(); }
function robustValue(metric: { point: number; uncertainty: number }, objective: PlannerObjective) { const pessimistic = objective.direction === "maximize" ? metric.point - objective.uncertaintyAversion * metric.uncertainty : metric.point + objective.uncertaintyAversion * metric.uncertainty; return pessimistic; }
function dominates(a: CandidateAssessment, b: CandidateAssessment, objectives: PlannerObjective[]) { if (!a.robustObjectives || !b.robustObjectives) return false; const noWorse = objectives.every((o) => o.direction === "maximize" ? a.robustObjectives![o.metric]! >= b.robustObjectives![o.metric]! : a.robustObjectives![o.metric]! <= b.robustObjectives![o.metric]!); const better = objectives.some((o) => o.direction === "maximize" ? a.robustObjectives![o.metric]! > b.robustObjectives![o.metric]! : a.robustObjectives![o.metric]! < b.robustObjectives![o.metric]!); return noWorse && better; }
function scoreBacktest(values: OracleEvaluation["backtest"]) { if (!values.length) return { meanAbsoluteError: Number.POSITIVE_INFINITY, coverage: 0 }; return { meanAbsoluteError: values.reduce((n, x) => n + Math.abs(x.predicted - x.actual), 0) / values.length, coverage: values.filter((x) => x.actual >= x.interval[0] && x.actual <= x.interval[1]).length / values.length }; }
function validateInputs(candidates: Candidate[], baselineId: string, objectives: PlannerObjective[], c: PlannerConstraints) { if (candidates.length < 2 || new Set(candidates.map((x) => x.id)).size !== candidates.length || !candidates.some((x) => x.id === baselineId) || candidates.find((x) => x.id === baselineId)!.patch.operations.length || !objectives.length || new Set(objectives.map((o) => o.metric)).size !== objectives.length || objectives.some((o) => !o.metric || o.uncertaintyAversion < 0) || c.budget < 0 || c.rolloutMaximumFraction < 0 || c.rolloutMaximumFraction > 1 || c.maximumComplexity < 0) throw new Error("counterfactual planner input invalid"); }
export function plannerDigest(value: unknown) { return createHash("sha256").update(canonicalSemanticJson(value)).digest("hex"); }
