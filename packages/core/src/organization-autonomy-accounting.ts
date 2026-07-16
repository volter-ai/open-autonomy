export type MetricName =
  | "lead-time"
  | "cycle-time"
  | "wait-time"
  | "throughput"
  | "wip"
  | "first-pass-yield"
  | "rework"
  | "defects"
  | "reliability"
  | "tokens"
  | "compute"
  | "money"
  | "human-minutes"
  | "interruption-burden"
  | "escalation"
  | "autonomy-ratio"
  | "value-delivery";
export type MetricUnit =
  | "milliseconds"
  | "items"
  | "item-milliseconds-per-millisecond"
  | "ratio"
  | "normalized-microtokens"
  | "compute-milliseconds"
  | "currency-micros"
  | "minutes"
  | "interruptions"
  | "value-microunits";
export type Provenance = {
  source: string;
  observedAt: string;
  evidenceUri: string;
  digest?: string;
};
export type MetricDefinition = {
  name: MetricName;
  eventBasis: string;
  unit: MetricUnit;
  estimand: string;
  horizon: "closed-interval";
  attribution: string;
  censoring: string;
  uncertainty: "wilson-95" | "student-t-95" | "accounting-exact";
};
const definition = (
  name: MetricName,
  eventBasis: string,
  unit: MetricUnit,
  estimand: string,
  attribution: string,
  censoring: string,
  uncertainty: MetricDefinition["uncertainty"],
): MetricDefinition => Object.freeze({
  name,
  eventBasis,
  unit,
  estimand,
  horizon: "closed-interval",
  attribution,
  censoring,
  uncertainty,
});
export const AUTONOMY_METRICS: Readonly<Record<MetricName, MetricDefinition>> =
  Object.freeze({
    "lead-time": definition(
      "lead-time",
      "createdAt→terminalAt",
      "milliseconds",
      "mean elapsed time of terminal work",
      "work item",
      "right-censored open work excluded and counted",
      "student-t-95",
    ),
    "cycle-time": definition(
      "cycle-time",
      "startedAt→terminalAt",
      "milliseconds",
      "mean elapsed time after first start",
      "work item",
      "unstarted and unterminated work excluded and counted",
      "student-t-95",
    ),
    "wait-time": definition(
      "wait-time",
      "union of wait intervals",
      "milliseconds",
      "mean recorded wait duration per in-horizon work item",
      "work item",
      "intervals clipped to horizon; open intervals end at horizon",
      "student-t-95",
    ),
    throughput: definition(
      "throughput",
      "successful terminal events",
      "items",
      "count of successfully completed work",
      "terminal event",
      "late terminals excluded",
      "accounting-exact",
    ),
    wip: definition(
      "wip",
      "created but nonterminal exposure",
      "item-milliseconds-per-millisecond",
      "time-weighted mean concurrent WIP",
      "work item exposure",
      "exposure clipped to horizon",
      "accounting-exact",
    ),
    "first-pass-yield": definition(
      "first-pass-yield",
      "ordinal-1 attempt outcome",
      "ratio",
      "successful first attempts / work with first attempt",
      "work item",
      "missing first attempt excluded and counted",
      "wilson-95",
    ),
    rework: definition(
      "rework",
      "attempt ordinal > 1",
      "items",
      "count of retry attempts",
      "attempt",
      "missing attempts counted as missing",
      "accounting-exact",
    ),
    defects: definition(
      "defects",
      "defect observations",
      "items",
      "count of unique confirmed defects",
      "defect id",
      "unknown disposition counted as missing",
      "accounting-exact",
    ),
    reliability: definition(
      "reliability",
      "terminal work outcome",
      "ratio",
      "successful / success-or-failure terminal work",
      "work item",
      "canceled/censored work excluded and counted",
      "wilson-95",
    ),
    tokens: definition(
      "tokens",
      "unique provider usage charge",
      "normalized-microtokens",
      "sum normalized input+output tokens",
      "unique charge id and attempt",
      "missing usage counted, never imputed",
      "accounting-exact",
    ),
    compute: definition(
      "compute",
      "unique compute charge",
      "compute-milliseconds",
      "sum attributed compute duration",
      "unique charge id and attempt",
      "missing usage counted, never imputed",
      "accounting-exact",
    ),
    money: definition(
      "money",
      "unique monetary charge",
      "currency-micros",
      "sum charges in declared reporting currency",
      "unique charge id",
      "unconverted currency is missing",
      "accounting-exact",
    ),
    "human-minutes": definition(
      "human-minutes",
      "nonoverlapping human work intervals",
      "minutes",
      "sum real-human minutes; simulated reported separately",
      "person and work item",
      "open intervals clipped; overlaps unioned",
      "accounting-exact",
    ),
    "interruption-burden": definition(
      "interruption-burden",
      "unique interruption",
      "interruptions",
      "count of human attention interruptions",
      "person and work item",
      "unknown person is missing",
      "accounting-exact",
    ),
    escalation: definition(
      "escalation",
      "unique escalation",
      "ratio",
      "work items escalated / in-horizon work items",
      "work item",
      "unknown disposition counted as missing",
      "wilson-95",
    ),
    "autonomy-ratio": definition(
      "autonomy-ratio",
      "terminal successful work plus labor/service ledger",
      "ratio",
      "successful items with zero real-human labor, zero untracked work, and fully attributed external services / all successful items",
      "work item",
      "missing labor/service accounting remains denominator-only",
      "wilson-95",
    ),
    "value-delivery": definition(
      "value-delivery",
      "successful terminal work value",
      "value-microunits",
      "sum immutable externally assigned value",
      "work item",
      "missing value counted and not imputed",
      "accounting-exact",
    ),
  });

export type WorkItem = {
  id: string;
  createdAt: string;
  startedAt?: string;
  terminalAt?: string;
  outcome?: "success" | "failure" | "canceled" | "censored";
  valueMicrounits?: number;
  untrackedWork: boolean;
  provenance: Provenance;
};
export type Attempt = {
  id: string;
  workId: string;
  ordinal: number;
  provider: string;
  outcome: "success" | "failure" | "canceled";
  retryOf?: string;
  provenance: Provenance;
};
export type UsageCharge = {
  id: string;
  providerChargeId: string;
  attemptId: string;
  provider: string;
  providerVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  computeMilliseconds?: number;
  moneyMicros?: number;
  currency?: string;
  externalService: boolean;
  fullyAttributed: boolean;
  provenance: Provenance;
};
export type HumanInterval = {
  id: string;
  workId: string;
  personId: string;
  start: string;
  end?: string;
  observation: "real" | "simulated";
  calibrationId?: string;
  provenance: Provenance;
};
export type Calibration = {
  id: string;
  simulatorVersion: string;
  population: string;
  realMinutes: number[];
  simulatedMinutes: number[];
  provenance: Provenance;
};
export type AccountingLedger = {
  schema: "autonomy.accounting.v1";
  reportingCurrency: string;
  horizon: { start: string; end: string };
  work: WorkItem[];
  attempts: Attempt[];
  usage: UsageCharge[];
  waits: Array<{
    id: string;
    workId: string;
    start: string;
    end?: string;
    provenance: Provenance;
  }>;
  defects: Array<{
    id: string;
    workId: string;
    confirmed?: boolean;
    provenance: Provenance;
  }>;
  interruptions: Array<{
    id: string;
    workId: string;
    personId?: string;
    provenance: Provenance;
  }>;
  escalations: Array<{
    id: string;
    workId: string;
    disposition?: "escalated" | "not-escalated";
    provenance: Provenance;
  }>;
  humans: HumanInterval[];
  calibrations: Calibration[];
  tokenNormalization: Array<{
    provider: string;
    version: string;
    numerator: number;
    denominator: number;
    provenance: Provenance;
  }>;
};
export type ConfidenceInterval = {
  level: 0.95;
  low: number;
  high: number;
  method: MetricDefinition["uncertainty"];
};
export type MetricResult = {
  definition: MetricDefinition;
  estimate: number;
  numerator?: number;
  denominator?: number;
  interval: ConfidenceInterval;
  included: number;
  missing: number;
  censored: number;
  provenance: Provenance[];
  breakdown?: Record<string, number>;
};
export type AccountingReport = {
  metrics: Record<MetricName, MetricResult>;
  calibration: Array<{
    id: string;
    realMeanMinutes: number;
    simulatedMeanMinutes: number;
    transferErrorMinutes: number;
    interval: ConfidenceInterval;
  }>;
};

export function measureAutonomy(ledger: AccountingLedger): AccountingReport {
  validateLedger(ledger);
  const hs = time(ledger.horizon.start),
    he = time(ledger.horizon.end),
    duration = he - hs;
  const population = ledger.work.filter(
    (w) => time(w.createdAt) <= he && (!w.terminalAt || time(w.terminalAt) >= hs),
  );
  const populationIds = new Set(population.map((w) => w.id));
  const terminal = population.filter(
    (w) => w.terminalAt && time(w.terminalAt) >= hs && time(w.terminalAt) <= he,
  );
  const successful = terminal.filter((w) => w.outcome === "success");
  const lead = terminal.map((w) => time(w.terminalAt!) - time(w.createdAt));
  const cycleEligible = terminal.filter((w) => w.startedAt);
  const cycle = cycleEligible.map(
    (w) => time(w.terminalAt!) - time(w.startedAt!),
  );
  const waitByWork = intervalDurationByWork(ledger.waits, hs, he, 1);
  const wait = population.map((w) => waitByWork.get(w.id) ?? 0);
  const populationAttempts = ledger.attempts.filter((a) => populationIds.has(a.workId));
  const first = populationAttempts.filter((a) => a.ordinal === 1),
    retries = populationAttempts.filter((a) => a.ordinal > 1);
  const norm = new Map(
    ledger.tokenNormalization.map((n) => [`${n.provider}:${n.version}`, n]),
  );
  let tokens = 0,
    compute = 0,
    money = 0;
  const providerTokens: Record<string, number> = {},
    usageWork = new Map<string, UsageCharge[]>(),
    attempt = new Map(ledger.attempts.map((a) => [a.id, a]));
  const populationUsage = ledger.usage.filter((u) => populationIds.has(attempt.get(u.attemptId)!.workId));
  for (const u of populationUsage) {
    const n = norm.get(`${u.provider}:${u.providerVersion}`)!,
      raw = (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
      normalized = (raw * 1_000_000 * n.numerator) / n.denominator;
    tokens += normalized;
    compute += u.computeMilliseconds ?? 0;
    if (u.currency === ledger.reportingCurrency) money += u.moneyMicros ?? 0;
    providerTokens[u.provider] = (providerTokens[u.provider] ?? 0) + normalized;
    const workId = attempt.get(u.attemptId)!.workId;
    usageWork.set(workId, [...(usageWork.get(workId) ?? []), u]);
  }
  const realHumanByWork = humanMinutes(
      ledger.humans.filter((h) => h.observation === "real"),
      hs,
      he,
    ),
    simulatedByWork = humanMinutes(
      ledger.humans.filter((h) => h.observation === "simulated"),
      hs,
      he,
    );
  const autonomous = successful.filter(
    (w) =>
      !w.untrackedWork &&
      !(realHumanByWork.get(w.id) ?? 0) &&
      (usageWork.get(w.id) ?? []).filter((u) => u.externalService).every((u) => u.fullyAttributed),
  );
  const allProv = collectProvenance(ledger, populationIds),
    exact = (
      name: MetricName,
      estimate: number,
      included: number,
      missing = 0,
      censored = 0,
      breakdown?: Record<string, number>,
    ): MetricResult =>
      result(
        name,
        estimate,
        included,
        missing,
        censored,
        allProv,
        {
          level: 0.95,
          low: estimate,
          high: estimate,
          method: "accounting-exact",
        },
        undefined,
        undefined,
        breakdown,
      );
  const ratio = (
    name: MetricName,
    numerator: number,
    denominator: number,
    missing = 0,
    censored = 0,
  ) =>
    result(
      name,
      denominator ? numerator / denominator : 0,
      denominator,
      missing,
      censored,
      allProv,
      wilson(numerator, denominator),
      numerator,
      denominator,
    );
  const meanMetric = (
    name: MetricName,
    xs: number[],
    missing = 0,
    censored = 0,
  ) =>
    result(
      name,
      mean(xs),
      xs.length,
      missing,
      censored,
      allProv,
      meanInterval(xs),
    );
  const wipExposure = population.reduce(
    (sum, w) =>
      sum +
      Math.max(
        0,
        Math.min(w.terminalAt ? time(w.terminalAt) : he, he) -
          Math.max(time(w.createdAt), hs),
      ),
    0,
  );
  const populationDefects = ledger.defects.filter((d) => populationIds.has(d.workId)), populationInterruptions = ledger.interruptions.filter((i) => populationIds.has(i.workId)), populationEscalations = ledger.escalations.filter((e) => populationIds.has(e.workId)), populationHumans = ledger.humans.filter((h) => populationIds.has(h.workId) && time(h.start) <= he && (!h.end || time(h.end) >= hs));
  const confirmedDefects = populationDefects.filter((d) => d.confirmed === true),
    knownEscalations = populationEscalations.filter((e) => e.disposition),
    escalated = new Set(
      knownEscalations
        .filter((e) => e.disposition === "escalated")
        .map((e) => e.workId),
    );
  const realMinutes = [...realHumanByWork.values()].reduce((a, b) => a + b, 0),
    simulatedMinutes = [...simulatedByWork.values()].reduce((a, b) => a + b, 0);
  const metrics = {
    "lead-time": meanMetric(
      "lead-time",
      lead,
      0,
      population.length - terminal.length,
    ),
    "cycle-time": meanMetric(
      "cycle-time",
      cycle,
      terminal.length - cycleEligible.length,
      population.length - terminal.length,
    ),
    "wait-time": meanMetric("wait-time", wait),
    throughput: exact("throughput", successful.length, terminal.length),
    wip: exact("wip", wipExposure / duration, population.length),
    "first-pass-yield": ratio(
      "first-pass-yield",
      first.filter((a) => a.outcome === "success").length,
      first.length,
      population.length - new Set(first.map((a) => a.workId)).size,
    ),
    rework: exact("rework", retries.length, retries.length),
    defects: exact(
      "defects",
      confirmedDefects.length,
      confirmedDefects.length,
      populationDefects.filter((d) => d.confirmed === undefined).length,
    ),
    reliability: ratio(
      "reliability",
      successful.length,
      terminal.filter((w) => w.outcome === "success" || w.outcome === "failure")
        .length,
      terminal.filter(
        (w) => w.outcome === "canceled" || w.outcome === "censored",
      ).length,
    ),
    tokens: exact(
      "tokens",
      tokens,
      populationUsage.length,
      populationUsage.filter(
        (u) => u.inputTokens === undefined || u.outputTokens === undefined,
      ).length,
      0,
      providerTokens,
    ),
    compute: exact(
      "compute",
      compute,
      populationUsage.length,
      populationUsage.filter((u) => u.computeMilliseconds === undefined).length,
    ),
    money: exact(
      "money",
      money,
      populationUsage.length,
      populationUsage.filter(
        (u) =>
          u.moneyMicros === undefined ||
          u.currency !== ledger.reportingCurrency,
      ).length,
    ),
    "human-minutes": exact(
      "human-minutes",
      realMinutes,
      populationHumans.filter((h) => h.observation === "real").length,
      0,
      populationHumans.filter((h) => !h.end).length,
      { real: realMinutes, simulated: simulatedMinutes },
    ),
    "interruption-burden": exact(
      "interruption-burden",
      populationInterruptions.filter((i) => i.personId).length,
      populationInterruptions.length,
      populationInterruptions.filter((i) => !i.personId).length,
    ),
    escalation: ratio(
      "escalation",
      escalated.size,
      population.length,
      populationEscalations.filter((e) => !e.disposition).length,
    ),
    "autonomy-ratio": ratio(
      "autonomy-ratio",
      autonomous.length,
      successful.length,
      successful.filter(
        (w) =>
          w.untrackedWork ||
          (usageWork.get(w.id) ?? []).some((u) => u.externalService && !u.fullyAttributed),
      ).length,
    ),
    "value-delivery": exact(
      "value-delivery",
      successful.reduce((s, w) => s + (w.valueMicrounits ?? 0), 0),
      successful.length,
      successful.filter((w) => w.valueMicrounits === undefined).length,
    ),
  } satisfies Record<MetricName, MetricResult>;
  return {
    metrics,
    calibration: ledger.calibrations.map((c) => {
      const real = mean(c.realMinutes),
        simulated = mean(c.simulatedMinutes),
        differences = c.simulatedMinutes.map((v, i) => v - c.realMinutes[i]!);
      return {
        id: c.id,
        realMeanMinutes: real,
        simulatedMeanMinutes: simulated,
        transferErrorMinutes: simulated - real,
        interval: meanInterval(differences),
      };
    }),
  };
}

export function validateLedger(l: AccountingLedger): void {
  if (
    l.schema !== "autonomy.accounting.v1" ||
    !l.reportingCurrency ||
    time(l.horizon.end) <= time(l.horizon.start)
  )
    throw new Error("accounting ledger header invalid");
  const unique = (label: string, ids: string[]) => {
    if (new Set(ids).size !== ids.length || ids.some((x) => !x))
      throw new Error(`${label} duplicate or empty id`);
  };
  unique(
    "work",
    l.work.map((x) => x.id),
  );
  unique(
    "attempt",
    l.attempts.map((x) => x.id),
  );
  unique(
    "usage",
    l.usage.map((x) => x.id),
  );
  unique(
    "human",
    l.humans.map((x) => x.id),
  );
  unique(
    "wait",
    l.waits.map((x) => x.id),
  );
  unique(
    "defect",
    l.defects.map((x) => x.id),
  );
  unique(
    "interruption",
    l.interruptions.map((x) => x.id),
  );
  unique(
    "escalation",
    l.escalations.map((x) => x.id),
  );
  unique("calibration", l.calibrations.map((x) => x.id));
  for (const group of [
    l.work,
    l.attempts,
    l.usage,
    l.humans,
    l.waits,
    l.defects,
    l.interruptions,
    l.escalations,
    l.tokenNormalization,
    l.calibrations,
  ])
    for (const x of group as Array<{ provenance: Provenance }>)
      validateProvenance(x.provenance);
  const works = new Set(l.work.map((w) => w.id)),
    attempts = new Map(l.attempts.map((a) => [a.id, a]));
  for (const a of l.attempts) {
    if (
      !works.has(a.workId) ||
      !Number.isSafeInteger(a.ordinal) ||
      a.ordinal < 1
    )
      throw new Error("attempt attribution invalid");
    const parent = a.retryOf ? attempts.get(a.retryOf) : undefined;
    if (a.ordinal === 1 && a.retryOf) throw new Error("retry lineage invalid");
    if (
      a.ordinal > 1 &&
      (!parent || parent.workId !== a.workId || parent.ordinal !== a.ordinal - 1)
    ) throw new Error("retry lineage invalid");
  }
  for (const w of l.work) {
    const ordinals = l.attempts
      .filter((a) => a.workId === w.id)
      .map((a) => a.ordinal);
    if (new Set(ordinals).size !== ordinals.length)
      throw new Error("attempt ordinal double counting");
    if (w.startedAt && time(w.startedAt) < time(w.createdAt))
      throw new Error("work chronology invalid");
    if (w.terminalAt && time(w.terminalAt) < time(w.startedAt ?? w.createdAt))
      throw new Error("work chronology invalid");
    if ((w.terminalAt && !w.outcome) || (!w.terminalAt && w.outcome && !["censored"].includes(w.outcome))) throw new Error("work terminal outcome inconsistent");
  }
  const normalizers = new Map(
    l.tokenNormalization.map((n) => [`${n.provider}:${n.version}`, n]),
  );
  if (normalizers.size !== l.tokenNormalization.length)
    throw new Error("provider normalization ambiguous");
  unique(
    "provider charge",
    l.usage.map((u) => `${u.provider}:${u.providerChargeId}`),
  );
  for (const u of l.usage) {
    const a = attempts.get(u.attemptId);
    if (
      !a ||
      a.provider !== u.provider ||
      !normalizers.has(`${u.provider}:${u.providerVersion}`)
    )
      throw new Error("usage attribution or normalization missing");
    const n = normalizers.get(`${u.provider}:${u.providerVersion}`)!;
    if (
      !Number.isSafeInteger(n.numerator) ||
      !Number.isSafeInteger(n.denominator) ||
      n.numerator < 1 ||
      n.denominator < 1
    )
      throw new Error("provider normalization invalid");
    if (
      !u.providerChargeId ||
      [
        u.inputTokens,
        u.outputTokens,
        u.computeMilliseconds,
        u.moneyMicros,
      ].some((v) => v !== undefined && (!Number.isFinite(v) || v < 0))
    )
      throw new Error("usage quantity invalid");
  }
  const calibrations = new Map(l.calibrations.map((c) => [c.id, c]));
  const workById = new Map(l.work.map((w) => [w.id, w]));
  for (const h of l.humans) {
    const work = workById.get(h.workId), start = time(h.start), end = h.end ? time(h.end) : undefined;
    if (
      !work ||
      !h.personId ||
      (end !== undefined && end < start) ||
      start < time(work.createdAt) ||
      (work.terminalAt && (end ?? start) > time(work.terminalAt))
    )
      throw new Error("human attribution invalid");
    if (
      h.observation === "simulated" &&
      (!h.calibrationId || !calibrations.has(h.calibrationId))
    )
      throw new Error("simulated human observation uncalibrated");
  }
  for (const x of [
    ...l.waits,
    ...l.defects,
    ...l.interruptions,
    ...l.escalations,
  ])
    if (!works.has(x.workId)) throw new Error("work attribution missing");
  for (const wait of l.waits) {
    const work = workById.get(wait.workId)!, start = time(wait.start), end = wait.end ? time(wait.end) : undefined;
    if ((end !== undefined && end < start) || start < time(work.createdAt) || (work.terminalAt && (end ?? start) > time(work.terminalAt)))
      throw new Error("wait chronology invalid");
  }
  for (const c of l.calibrations)
    if (
      !c.simulatorVersion || !c.population ||
      !c.realMinutes.length ||
      c.realMinutes.length !== c.simulatedMinutes.length ||
      [...c.realMinutes, ...c.simulatedMinutes].some(
        (x) => x < 0 || !Number.isFinite(x),
      )
    )
      throw new Error("human calibration pairs invalid");
}
function validateProvenance(p: Provenance) {
  if (
    !p?.source ||
    !p.evidenceUri ||
    !Number.isFinite(Date.parse(p.observedAt)) || !p.digest
  )
    throw new Error("provenance invalid");
}
function collectProvenance(l: AccountingLedger, populationIds: Set<string>) {
  const out: Provenance[] = [];
  const attempts = new Map(l.attempts.map((a) => [a.id, a]));
  for (const group of [l.work.filter((x) => populationIds.has(x.id)), l.attempts.filter((x) => populationIds.has(x.workId)), l.usage.filter((x) => populationIds.has(attempts.get(x.attemptId)!.workId)), l.humans.filter((x) => populationIds.has(x.workId)), l.waits.filter((x) => populationIds.has(x.workId)), l.defects.filter((x) => populationIds.has(x.workId)), l.interruptions.filter((x) => populationIds.has(x.workId)), l.escalations.filter((x) => populationIds.has(x.workId)), l.tokenNormalization, l.calibrations])
    for (const x of group as Array<{ provenance: Provenance }>)
      out.push(x.provenance);
  return out;
}
function time(v: string) {
  const n = Date.parse(v);
  if (!Number.isFinite(n)) throw new Error("timestamp invalid");
  return n;
}
function intervalDurationByWork(
  intervals: Array<{ workId: string; start: string; end?: string }>,
  hs: number,
  he: number,
  divisor: number,
) {
  const groups = new Map<string, Array<[number, number]>>();
  for (const value of intervals) {
    const start = Math.max(time(value.start), hs), end = Math.min(value.end ? time(value.end) : he, he);
    if (end > start) groups.set(value.workId, [...(groups.get(value.workId) ?? []), [start, end]]);
  }
  const totals = new Map<string, number>();
  for (const [workId, ranges] of groups) {
    ranges.sort((a, b) => a[0] - b[0]);
    let total = 0, [start, end] = ranges[0]!;
    for (const [nextStart, nextEnd] of ranges.slice(1)) {
      if (nextStart <= end) end = Math.max(end, nextEnd);
      else { total += end - start; start = nextStart; end = nextEnd; }
    }
    totals.set(workId, (total + end - start) / divisor);
  }
  return totals;
}
function humanMinutes(intervals: HumanInterval[], hs: number, he: number) {
  const groups = new Map<string, Array<[number, number]>>();
  for (const h of intervals) {
    const start = Math.max(time(h.start), hs),
      end = Math.min(h.end ? time(h.end) : he, he),
      key = `${h.workId}\0${h.personId}`;
    if (end > start)
      groups.set(key, [...(groups.get(key) ?? []), [start, end]]);
  }
  const byWork = new Map<string, number>();
  for (const [key, ranges] of groups) {
    ranges.sort((a, b) => a[0] - b[0]);
    let total = 0,
      [start, end] = ranges[0]!;
    for (const [nextStart, nextEnd] of ranges.slice(1)) {
      if (nextStart <= end) end = Math.max(end, nextEnd);
      else {
        total += end - start;
        start = nextStart;
        end = nextEnd;
      }
    }
    total += end - start;
    const workId = key.split("\0")[0]!;
    byWork.set(workId, (byWork.get(workId) ?? 0) + total / 60_000);
  }
  return byWork;
}
function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function meanInterval(xs: number[]): ConfidenceInterval {
  const m = mean(xs);
  if (xs.length < 2)
    return { level: 0.95, low: Number.NEGATIVE_INFINITY, high: Number.POSITIVE_INFINITY, method: "student-t-95" };
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1),
    half = tCritical95(xs.length - 1) * Math.sqrt(variance / xs.length);
  return {
    level: 0.95,
    low: m - half,
    high: m + half,
    method: "student-t-95",
  };
}
function tCritical95(df: number) { const values = [Number.POSITIVE_INFINITY,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045,2.042]; return df < values.length ? values[df]! : df < 60 ? 2 : 1.96; }
function wilson(success: number, total: number): ConfidenceInterval {
  if (!total) return { level: 0.95, low: 0, high: 1, method: "wilson-95" };
  const z = 1.96,
    p = success / total,
    d = 1 + (z * z) / total,
    center = (p + (z * z) / (2 * total)) / d,
    half = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / d;
  return {
    level: 0.95,
    low: Math.max(0, center - half),
    high: Math.min(1, center + half),
    method: "wilson-95",
  };
}
function result(
  name: MetricName,
  estimate: number,
  included: number,
  missing: number,
  censored: number,
  provenance: Provenance[],
  interval: ConfidenceInterval,
  numerator?: number,
  denominator?: number,
  breakdown?: Record<string, number>,
): MetricResult {
  return {
    definition: AUTONOMY_METRICS[name],
    estimate,
    ...(numerator === undefined ? {} : { numerator }),
    ...(denominator === undefined ? {} : { denominator }),
    interval,
    included,
    missing,
    censored,
    provenance: structuredClone(provenance),
    ...(breakdown ? { breakdown } : {}),
  };
}
