import { createHash, createHmac } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export type ExperimentMode =
  | "shadow"
  | "replay"
  | "canary"
  | "randomized"
  | "switchback"
  | "stepped-wedge";
export type ExperimentProvenance = {
  source: string;
  evidenceUri: string;
  observedAt: string;
  digest: string;
};
export type MetricSpec = {
  id: string;
  unit: string;
  direction: "increase" | "decrease";
  primary: boolean;
  alpha: number;
  provenance: ExperimentProvenance;
};
export type GuardrailSpec = {
  metric: string;
  operator: "gt" | "gte" | "lt" | "lte";
  threshold: number;
  action: "rollback";
  provenance: ExperimentProvenance;
};
export type StoppingRule =
  | { kind: "fixed"; sampleSize: number }
  | {
      kind: "group-sequential";
      maximumSampleSize: number;
      looks: Array<{ sampleSize: number; alpha: number }>;
    };
export type RegistrationBody = {
  schema: "autonomy.experiment-registration.v1";
  id: string;
  version: number;
  mode: ExperimentMode;
  hypothesis: string;
  arms: readonly [string, string];
  treatmentChanges: Array<{
    path: string;
    boundary: "ordinary" | "safety" | "security" | "authority" | "privacy";
  }>;
  metrics: MetricSpec[];
  guardrails: GuardrailSpec[];
  eligibility: {
    population: string;
    immutableRule: string;
    eligibleUnitIds: string[];
  };
  assignment: {
    unit: string;
    stratumByUnit: Record<string, string>;
    allocation: [number, number];
    seedCommitment: string;
  };
  causal: {
    estimand: "intention-to-treat" | "average-treatment-effect";
    interference: string;
    carryover: string;
    novelty: string;
    selection: string;
    identificationAssumptions: string[];
  };
  power: {
    alpha: number;
    targetPower: number;
    minimumDetectableEffect: number;
    assumedStandardDeviation: number;
    requiredSampleSize: number;
  };
  stopping: StoppingRule;
  exclusions: string[];
  missingOutcomes: { policy: "fail" | "exclude-with-bound"; maximumFraction: number };
  rollback: { maximumTreatedUnits: number; safeArm: string };
  codeDigest: string;
  createdAt: string;
  provenance: ExperimentProvenance[];
};
export type SignedRegistration = RegistrationBody & {
  digest: string;
  signature: string;
};
export type Assignment = {
  experimentId: string;
  unitId: string;
  arm: string;
  stratum: string;
  ordinal: number;
  digest: string;
};
export type SignedOutcome = {
  schema: "autonomy.experiment-outcome.v1";
  id: string;
  experimentId: string;
  unitId: string;
  assignmentDigest: string;
  workerId: string;
  metric: string;
  value: number;
  at: string;
  provenance: ExperimentProvenance;
  signature: string;
};
export interface ExperimentTrust {
  signRegistration(digest: string): string;
  verifyRegistration(digest: string, signature: string): boolean;
  verifyOutcome(digest: string, signature: string, workerId: string): boolean;
  signDecision(digest: string): string;
  verifyDecision(digest: string, signature: string): boolean;
  workerTrusted(workerId: string): boolean;
}
export type Analysis = {
  experimentId: string;
  metric: string;
  nControl: number;
  nTreatment: number;
  estimate: number;
  standardError: number;
  interval95: { low: number; high: number };
  pValue: number;
  alpha: number;
  significant: boolean;
  estimand: RegistrationBody["causal"]["estimand"];
  assumptions: string[];
  provenance: ExperimentProvenance[];
  registrationDigest: string;
  outcomeDigests: string[];
  diagnostics: { missingFraction:number; noveltyDifference:number|null; carryoverTransitions:number; selectionCoverage:number; interferenceCells:number };
  boundaryZ: number;
  digest: string;
  signature: string;
};
export type DecisionArtifact = {
  schema: "autonomy.experiment-decision.v1";
  sequence: number;
  experimentId: string;
  state: CanaryState;
  reason: string;
  at: string;
  registrationDigest: string;
  analysisDigest?: string;
  previousDigest?: string;
  digest: string;
  signature: string;
};
export type CanaryState = "registered" | "running" | "promoted" | "rolled-back";

export function signRegistration(
  body: RegistrationBody,
  trust: ExperimentTrust,
): SignedRegistration {
  validateRegistration(body);
  const digest = hash(body);
  return {
    ...structuredClone(body),
    digest,
    signature: trust.signRegistration(digest),
  };
}
export function verifyRegistration(
  registration: SignedRegistration,
  trust: ExperimentTrust,
): void {
  const { digest, signature, ...body } = registration;
  validateRegistration(body);
  const expected = hash(body);
  if (digest !== expected || !trust.verifyRegistration(expected, signature))
    throw new Error("experiment preregistration authentication failed");
}
export function validateRegistration(r: RegistrationBody): void {
  if (
    r.schema !== "autonomy.experiment-registration.v1" ||
    !r.id ||
    r.version < 1 ||
    !r.hypothesis ||
    !r.codeDigest
  )
    throw new Error("experiment registration header invalid");
  if (r.arms[0] === r.arms[1] || r.rollback.safeArm !== r.arms[0])
    throw new Error("experiment arms or safe arm invalid");
  if (r.treatmentChanges.some((c) => c.boundary !== "ordinary"))
    throw new Error("forbidden boundary cannot be randomized");
  unique(
    "metric",
    r.metrics.map((m) => m.id),
  );
  unique("eligible unit", r.eligibility.eligibleUnitIds);
  if (
    !r.metrics.some((m) => m.primary) ||
    r.metrics.some((m) => !m.unit || m.alpha <= 0) ||
    r.metrics.reduce((s, m) => s + m.alpha, 0) > r.power.alpha + 1e-12
  )
    throw new Error("metric multiplicity accounting invalid");
  if (
    !r.eligibility.population ||
    !r.eligibility.immutableRule ||
    !r.assignment.unit ||
    !r.assignment.seedCommitment ||
    r.assignment.allocation.some((x) => x <= 0) ||
    !r.causal.interference ||
    !r.causal.carryover ||
    !r.causal.novelty ||
    !r.causal.selection ||
    !r.causal.identificationAssumptions.length
  )
    throw new Error("eligibility, assignment, or causal assumptions missing");
  if (
    r.eligibility.eligibleUnitIds.some(
      (id) => !r.assignment.stratumByUnit[id],
    ) ||
    Object.keys(r.assignment.stratumByUnit).some(
      (id) => !r.eligibility.eligibleUnitIds.includes(id),
    )
  )
    throw new Error("assignment stratum membership incomplete");
  const p = r.power;
  if (
    !(
      p.alpha > 0 &&
      p.alpha < 1 &&
      p.targetPower > 0.5 &&
      p.targetPower < 1 &&
      p.minimumDetectableEffect > 0 &&
      p.assumedStandardDeviation > 0
    ) ||
    p.requiredSampleSize !==
      requiredTwoArmSample(
        p.alpha,
        p.targetPower,
        p.minimumDetectableEffect,
        p.assumedStandardDeviation,
      )
  )
    throw new Error("power accounting invalid");
  const maximum =
    r.stopping.kind === "fixed"
      ? r.stopping.sampleSize
      : r.stopping.maximumSampleSize;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < p.requiredSampleSize ||
    r.rollback.maximumTreatedUnits < 1 ||
    r.rollback.maximumTreatedUnits > maximum
  )
    throw new Error("sample or canary exposure bound invalid");
  if (!r.missingOutcomes || r.missingOutcomes.maximumFraction < 0 || r.missingOutcomes.maximumFraction >= 1) throw new Error("missing outcome policy invalid");
  if (r.stopping.kind === "group-sequential") {
    if (
      !r.stopping.looks.length ||
      r.stopping.looks.at(-1)?.sampleSize !== maximum ||
      r.stopping.looks.some(
        (x, i, a) =>
          x.alpha <= 0 ||
          x.alpha > p.alpha ||
          (i > 0 &&
            (x.sampleSize <= a[i - 1]!.sampleSize ||
              x.alpha < a[i - 1]!.alpha)),
      )
    )
      throw new Error("sequential stopping schedule invalid");
  }
  if (
    ["switchback", "stepped-wedge"].includes(r.mode) &&
    r.causal.carryover === "none"
  )
    throw new Error("temporal design must model carryover");
  if (
    r.mode === "randomized" &&
    r.causal.interference !== "none" &&
    !r.assignment.unit.startsWith("cluster:")
  )
    throw new Error("interference requires cluster assignment");
  for (const x of [...r.metrics, ...r.guardrails, ...r.provenance])
    validateProvenance("provenance" in x ? x.provenance : (x as ExperimentProvenance));
}
export function requiredTwoArmSample(
  alpha: number,
  power: number,
  effect: number,
  sd: number,
): number {
  const zAlpha = inverseNormal(1 - alpha / 2),
    zPower = inverseNormal(power);
  return Math.ceil(2 * (((zAlpha + zPower) * sd) / effect) ** 2);
}

export class ExperimentRun {
  private assignments = new Map<string, Assignment>();
  private outcomes = new Map<
    string,
    { digest: string; value: SignedOutcome }
  >();
  private plannedArms = new Map<string, string>();
  private schedule = new Map<string,{period:number;effectAllowed:boolean}>();
  private outcomeKeys = new Map<string,string>();
  constructor(
    readonly registration: SignedRegistration,
    private trust: ExperimentTrust,
    private seedReveal: string,
  ) {
    verifyRegistration(registration, trust);
    if (hash(seedReveal) !== registration.assignment.seedCommitment)
      throw new Error("randomization reveal does not match commitment");
    for (const stratum of new Set(
      Object.values(registration.assignment.stratumByUnit),
    )) {
      const members = registration.eligibility.eligibleUnitIds
          .filter((id) => registration.assignment.stratumByUnit[id] === stratum)
          .sort((a, b) =>
            this.assignmentScore(a, stratum).localeCompare(
              this.assignmentScore(b, stratum),
            ),
          ),
        allocation = registration.assignment.allocation,
        controlCount = Math.round(
          (members.length * allocation[0]) / (allocation[0] + allocation[1]),
        );
      members.forEach((id, index) =>
        { let arm=registration.arms[index < controlCount ? 0 : 1],period=0,effectAllowed=true;if(registration.mode==="shadow"){effectAllowed=false;}else if(registration.mode==="replay"){effectAllowed=false;period=index;}else if(registration.mode==="canary"){arm=registration.arms[index<registration.rollback.maximumTreatedUnits?1:0];period=index;}else if(registration.mode==="switchback"){arm=registration.arms[index%2];period=index;}else if(registration.mode==="stepped-wedge"){const strata=[...new Set(Object.values(registration.assignment.stratumByUnit))].sort(),crossover=strata.indexOf(stratum)+1;period=index;arm=registration.arms[index>=crossover?1:0];}this.plannedArms.set(id,arm);this.schedule.set(id,{period,effectAllowed});},
      );
    }
  }
  enroll(unitId: string): Assignment {
    if (!this.registration.eligibility.eligibleUnitIds.includes(unitId))
      throw new Error("unit ineligible under preregistered rule");
    const prior = this.assignments.get(unitId);
    if (prior) return structuredClone(prior);
    const stratum = this.registration.assignment.stratumByUnit[unitId]!,
      arm = this.plannedArms.get(unitId)!;
    const unsigned = {
        experimentId: this.registration.id,
        unitId,
        arm,
        stratum,
        ordinal: this.assignments.size + 1,
      },
      assignment = { ...unsigned, digest: hash(unsigned) };
    this.assignments.set(unitId, assignment);
    return structuredClone(assignment);
  }
  record(outcome: SignedOutcome): void {
    const { signature, ...unsigned } = outcome,
      digest = hash(unsigned),
      assignment = this.assignments.get(outcome.unitId);
    if (
      !this.trust.workerTrusted(outcome.workerId) ||
      !this.trust.verifyOutcome(digest, signature, outcome.workerId)
    )
      throw new Error("outcome worker authentication failed");
    if (
      outcome.schema !== "autonomy.experiment-outcome.v1" ||
      outcome.experimentId !== this.registration.id ||
      !assignment ||
      assignment.digest !== outcome.assignmentDigest ||
      !this.registration.metrics.some((m) => m.id === outcome.metric) ||
      !Number.isFinite(outcome.value)
    )
      throw new Error("outcome assignment or metric invalid");
    validateProvenance(outcome.provenance);
    const prior = this.outcomes.get(outcome.id);
    if (prior) {
      if (prior.digest !== digest)
        throw new Error("outcome replay equivocation");
      return;
    }
    const outcomeKey = `${outcome.unitId}\0${outcome.metric}`, priorId = this.outcomeKeys.get(outcomeKey); if (priorId) throw new Error("duplicate unit-metric outcome would double count");
    this.outcomes.set(outcome.id, { digest, value: structuredClone(outcome) });
    this.outcomeKeys.set(outcomeKey,outcome.id);
  }
  analyze(metric: string, requestedStop?: number): Analysis {
    const spec = this.registration.metrics.find((m) => m.id === metric);
    if (!spec) throw new Error("post-hoc metric forbidden");
    const values = [...this.outcomes.values()]
      .map((x) => x.value)
      .filter((o) => o.metric === metric)
      .sort((a, b) => a.id.localeCompare(b.id));
    const stop = requestedStop ?? values.length;
    this.validateStop(stop);
    const missingFraction=Math.max(0,stop-values.length)/stop;if(this.registration.stopping.kind === "fixed" && values.length !== stop && (this.registration.missingOutcomes.policy==="fail"||missingFraction>this.registration.missingOutcomes.maximumFraction)) throw new Error("fixed analysis requires exactly the preregistered complete outcome set");
    const selected = values.slice(0, stop),
      control: number[] = [],
      treatment: number[] = [];
    for (const o of selected)
      (this.assignments.get(o.unitId)!.arm === this.registration.arms[0]
        ? control
        : treatment
      ).push(o.value);
    if (control.length < 2 || treatment.length < 2)
      throw new Error("analysis cell underpowered or empty");
    const estimate = mean(treatment) - mean(control),
      se = Math.sqrt(
        variance(treatment) / treatment.length +
          variance(control) / control.length,
      ),
      z = se ? Math.abs(estimate / se) : estimate === 0 ? 0 : Infinity,
      pValue = 2 * (1 - normalCdf(z)),
      alpha = this.alphaAt(stop, spec.alpha),
      boundaryZ=inverseNormal(1-alpha/2),
      half = 1.96 * se;
    const treatmentOrdered=selected.filter((o)=>this.assignments.get(o.unitId)!.arm===this.registration.arms[1]).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)), midpoint=Math.floor(treatmentOrdered.length/2), noveltyDifference=treatmentOrdered.length>=4?mean(treatmentOrdered.slice(0,midpoint).map((o)=>o.value))-mean(treatmentOrdered.slice(midpoint).map((o)=>o.value)):null, temporal=[...selected].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),carryoverTransitions=temporal.slice(1).filter((o,i)=>this.assignments.get(o.unitId)!.arm!==this.assignments.get(temporal[i]!.unitId)!.arm).length, cells=new Map<string,Set<string>>();for(const o of selected){const key=`${o.at}\0${this.assignments.get(o.unitId)!.stratum}`,set=cells.get(key)??new Set<string>();set.add(this.assignments.get(o.unitId)!.arm);cells.set(key,set)}
    const body = {
      experimentId: this.registration.id,
      metric,
      nControl: control.length,
      nTreatment: treatment.length,
      estimate,
      standardError: se,
      interval95: { low: estimate - half, high: estimate + half },
      pValue,
      alpha,
      significant: pValue <= alpha,
      estimand: this.registration.causal.estimand,
      assumptions: [...this.registration.causal.identificationAssumptions],
      provenance: selected.map((o) => o.provenance),
      registrationDigest: this.registration.digest,
      outcomeDigests: selected.map((o) => {
        const { signature: _, ...body } = o;
        return hash(body);
      }),
      diagnostics:{missingFraction,noveltyDifference,carryoverTransitions,selectionCoverage:selected.length/this.registration.eligibility.eligibleUnitIds.length,interferenceCells:[...cells.values()].filter((x)=>x.size>1).length},boundaryZ,
    };
    const digest = hash(body); return { ...body, digest, signature: this.trust.signDecision(digest) };
  }
  private validateStop(n: number) {
    const s = this.registration.stopping;
    if (s.kind === "fixed") {
      if (n !== s.sampleSize)
        throw new Error("selective or early stopping forbidden");
    } else if (!s.looks.some((x) => x.sampleSize === n))
      throw new Error("unregistered sequential look forbidden");
  }
  private alphaAt(n: number, metricAlpha: number) {
    const s = this.registration.stopping;
    if (s.kind === "fixed") return metricAlpha;
    const look = s.looks.find((x) => x.sampleSize === n)!;
    return Math.min(metricAlpha, look.alpha);
  }
  assignment(unitId: string) {
    const a = this.assignments.get(unitId);
    return a && structuredClone(a);
  }
  designSchedule(unitId:string){const assignment=this.assignment(unitId),schedule=this.schedule.get(unitId);return assignment&&schedule?{...assignment,...schedule}:undefined}
  outcomeCount() {
    return this.outcomes.size;
  }
  private assignmentScore(unitId: string, stratum: string) {
    return createHmac("sha256", this.seedReveal)
      .update(`${this.registration.id}\0${stratum}\0${unitId}`)
      .digest("hex");
  }
}

export class CanaryController {
  private artifacts: DecisionArtifact[] = [];
  private state: CanaryState = "registered";
  private treated = new Set<string>();
  private observedGuardrails = new Set<string>();
  constructor(
    private registration: SignedRegistration,
    private trust: ExperimentTrust,
    private clock: () => string,
  ) {
    verifyRegistration(registration, trust);
    if (registration.mode !== "canary")
      throw new Error("canary registration required");
    this.append("registered");
  }
  start() {
    if (this.state !== "registered")
      throw new Error("canary transition invalid");
    this.state = "running";
    this.append("started");
  }
  expose(unitId: string, arm: string) {
    if (this.state !== "running") throw new Error("canary not running");
    if (arm === this.registration.arms[1]) this.treated.add(unitId);
    if (this.treated.size > this.registration.rollback.maximumTreatedUnits)
      this.rollback("maximum treated exposure exceeded");
  }
  observeGuardrail(metric: string, value: number) {
    if (this.state !== "running") return;
    const g = this.registration.guardrails.find((x) => x.metric === metric);
    if (!g) throw new Error("unregistered guardrail metric");
    this.observedGuardrails.add(metric);
    if (compare(value, g.operator, g.threshold))
      this.rollback(`guardrail ${metric} breached`);
  }
  promote(analysis: Analysis) {
    const {digest,signature,...body}=analysis, metric=this.registration.metrics.find((m)=>m.id===analysis.metric), directionSatisfied=!!metric&&(metric.direction==="increase"?analysis.estimate>0:analysis.estimate<0);
    if (
      this.state !== "running" ||
      analysis.registrationDigest !== this.registration.digest ||
      digest !== hash(body) || !this.trust.verifyDecision(digest,signature) ||
      !analysis.significant || !directionSatisfied || analysis.diagnostics.interferenceCells > 0 || analysis.diagnostics.missingFraction > this.registration.missingOutcomes.maximumFraction || this.registration.guardrails.some((g)=>!this.observedGuardrails.has(g.metric))
    )
      throw new Error("canary promotion evidence invalid");
    this.state = "promoted";
    this.append("preregistered analysis passed", hash(analysis));
  }
  rollback(reason: string) {
    if (this.state !== "running") return;
    this.state = "rolled-back";
    this.append(reason);
  }
  history() {
    return structuredClone(this.artifacts);
  }
  replay(): CanaryState {
    let previous: string | undefined;
    for (const a of this.artifacts) {
      const { digest, signature, ...body } = a,
        expected = hash(body);
      if (
        digest !== expected ||
        a.previousDigest !== previous ||
        !this.trust.verifyDecision(expected, signature)
      )
        throw new Error("decision artifact authentication failed");
      previous = digest;
    }
    return this.artifacts.at(-1)!.state;
  }
  private append(reason: string, analysisDigest?: string) {
    const body = {
        schema: "autonomy.experiment-decision.v1" as const,
        sequence: this.artifacts.length + 1,
        experimentId: this.registration.id,
        state: this.state,
        reason,
        at: this.clock(),
        registrationDigest: this.registration.digest,
        ...(analysisDigest ? { analysisDigest } : {}),
        ...(this.artifacts.length
          ? { previousDigest: this.artifacts.at(-1)!.digest }
          : {}),
      },
      digest = hash(body);
    this.artifacts.push({
      ...body,
      digest,
      signature: this.trust.signDecision(digest),
    });
  }
}
function compare(v: number, op: GuardrailSpec["operator"], t: number) {
  return op === "gt"
    ? v > t
    : op === "gte"
      ? v >= t
      : op === "lt"
        ? v < t
        : v <= t;
}
function unique(label: string, xs: string[]) {
  if (xs.some((x) => !x) || new Set(xs).size !== xs.length)
    throw new Error(`${label} duplicate or empty`);
}
function validateProvenance(p: ExperimentProvenance) {
  if (
    !p?.source ||
    !p.evidenceUri ||
    !p.digest ||
    !Number.isFinite(Date.parse(p.observedAt))
  )
    throw new Error("experiment provenance invalid");
}
function hash(v: unknown): string {
  return createHash("sha256").update(canonicalSemanticJson(v)).digest("hex");
}
function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function variance(xs: number[]) {
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}
function normalCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x)),
    d = 0.3989423 * Math.exp((-x * x) / 2),
    p =
      1 -
      d *
        t *
        (0.31938153 +
          t *
            (-0.356563782 +
              t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? p : 1 - p;
}
function inverseNormal(p: number) {
  let lo = -8,
    hi = 8;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
