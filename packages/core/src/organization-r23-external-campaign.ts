import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  AUTONOMY_METRICS,
  type MetricName,
  type MetricUnit,
} from "./organization-autonomy-accounting";
type D = `sha256:${string}`;
type S = {
  signerId: string;
  publicKeyPem: string;
  signedAt: string;
  signature: string;
};
export type R23Quantity =
  { status: "observed"; value: number } | { status: "unknown"; value: null };
export type R23Registration = {
  schema: "autonomy.r23-external-registration.v1";
  campaignId: string;
  dependencies: { R18: D; R20: D; R22: D };
  workIds: string[];
  workValues: Record<string, number>;
  analysisPlan: {
    minimumTerminalWork: number;
    studentTDegreesFreedom: number;
    studentTCritical95: number;
    transferDegreesFreedom: number;
    transferTCritical95: number;
  };
  simulatorTimings: Record<string, number>;
  providerIds: string[];
  humanIds: string[];
  taskIds: string[];
  attemptsPerWork: number;
  horizon: { startsAt: string; endsAt: string };
  workloadDigest: D;
  normalizationDigest: D;
  privacyDigest: D;
  authority: S;
};
export type R23Attempt = {
  workId: string;
  attempt: number;
  providerId: string;
  startedAt: string;
  completedAt: string;
  outcome: "success" | "failure";
  retryOf: number | null;
  untrackedWork: boolean;
  evidenceDigest: D;
  signature: S;
};
export type R23Work = {
  workId: string;
  createdAt: string;
  startedAt: string;
  terminalAt: string;
  outcome: "success" | "failure" | "canceled" | "censored";
  censorState: "terminal" | "right-censored";
  waitIntervals: Array<{ startedAt: string; endedAt: string }>;
  defects: Array<{ defectId: string; confirmed: boolean; evidenceDigest: D }>;
  evidenceDigest: D;
  signature: S;
};
export type R23Dimension = "tokens" | "compute" | "money";
export type R23Invoice = {
  invoiceId: string;
  providerId: string;
  dimension: R23Dimension;
  rawTotal: number;
  rawUnit: string;
  currency: string | null;
  priceDate: string | null;
  providerRevision: string;
  model: string;
  serviceStartedAt: string;
  serviceEndedAt: string;
  normalizationDigest: D;
  evidenceDigest: D;
  observedAt: string;
  signature: S;
};
export type R23ProviderUsage = {
  chargeId: string;
  invoiceId: string;
  workId: string;
  attempt: number;
  providerId: string;
  dimension: R23Dimension;
  rawValue: number;
  allocatedValue: number;
  normalizedValue: number;
  rawUnit: string;
  normalizedUnit: string;
  currency: string | null;
  priceDate: string | null;
  normalizationDigest: D;
  observedAt: string;
  evidenceDigest: D;
  signature: S;
};
export type R23HumanTiming = {
  workId: string;
  humanId: string;
  taskId: string;
  durationMs: R23Quantity;
  startedAt: string;
  completedAt: string;
  evidenceDigest: D;
  signature: S;
};
export type R23Event = {
  workId: string;
  kind: "interruption" | "escalation";
  occurred: boolean;
  occurredAt: string | null;
  serviceStartedAt: string;
  serviceEndedAt: string;
  evidenceDigest: D;
  signature: S;
};
export type R23Enrollment = {
  humanId: string;
  keyFingerprint: string;
  consentDigest: D;
  validFrom: string;
  validUntil: string;
  signature: S;
};
export type R23Metric = {
  name: MetricName;
  unit: MetricUnit;
  horizon: "closed-interval";
  censoring: string;
  uncertainty: "wilson-95" | "student-t-95" | "accounting-exact";
  point: number;
  ci95: [number, number];
};
export type R23NormalizationRegistry = {
  schema: "autonomy.r23-normalization-registry.v1";
  entries: Array<{
    providerId: string;
    providerRevision: string;
    model: string;
    dimension: R23Dimension;
    rawUnit: string;
    normalizedUnit: string;
    factor: number;
    currency: string | null;
    priceDate: string | null;
  }>;
  digest: D;
  signature: S;
};
export type R23Transfer = {
  pairs: Array<{
    humanId: string;
    workId: string;
    taskId: string;
    humanMs: number;
    simulatorMs: number;
    differenceMs: number;
  }>;
  meanDifferenceMs: number;
  ci95: [number, number];
};
export type R23Summary = {
  successfulWork: number;
  failedAttempts: number;
  providerTotals: Array<{
    providerId: string;
    dimension: R23Dimension;
    raw: number;
    allocated: number;
    normalized: number;
  }>;
  humanTotalMs: number;
  autonomousWork: number;
  metrics: R23Metric[];
  transfer: R23Transfer;
};
export type R23Campaign = {
  schema: "autonomy.r23-external-campaign.v1";
  closureClaim: true;
  registration: R23Registration;
  works: R23Work[];
  normalizationRegistry: R23NormalizationRegistry;
  enrollments: R23Enrollment[];
  attempts: R23Attempt[];
  invoices: R23Invoice[];
  providerUsage: R23ProviderUsage[];
  humanTimings: R23HumanTiming[];
  events: R23Event[];
  summary: R23Summary;
  collector: S;
};
export type R23Trust = {
  dependencies: R23Registration["dependencies"];
  workIds: string[];
  workValues: Record<string, number>;
  workloadDigest: D;
  normalizationDigest: D;
  privacyDigest: D;
  registration: { id: string; key: string };
  collector: { id: string; key: string };
  privacy: { id: string; key: string };
  eventAuthority: { id: string; key: string };
  normalization: { id: string; key: string };
  providers: Record<
    string,
    {
      id: string;
      key: string;
      providerRevision: string;
      model: string;
      dimensions: Record<
        R23Dimension,
        {
          rawUnit: string;
          normalizedUnit: string;
          factor: number;
          currency: string | null;
          priceDate: string | null;
        }
      >;
    }
  >;
  humans: Record<
    string,
    {
      key: string;
      consentDigest: D;
      validFrom: string;
      validUntil: string;
      revoked: boolean;
      populationDigest: D;
    }
  >;
  verifyAttempt(x: R23Attempt): boolean;
  verifyInvoice(x: R23Invoice): boolean;
  verifyProvider(x: R23ProviderUsage): boolean;
  verifyHuman(x: R23HumanTiming): boolean;
  verifyEvent(x: R23Event): boolean;
};
const j = canonicalSemanticJson,
  hash = (x: unknown): D =>
    `sha256:${createHash("sha256").update(j(x)).digest("hex")}`,
  dg = (x: unknown): x is D =>
    typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x),
  dt = (x: unknown) => typeof x === "string" && Number.isFinite(Date.parse(x)),
  fp = (p: string) => {
    try {
      return createHash("sha256")
        .update(createPublicKey(p).export({ type: "spki", format: "der" }))
        .digest("hex");
    } catch {
      return "invalid";
    }
  },
  same = (a: unknown, b: unknown) => j(a) === j(b);
function exact(x: any, k: string[], n: string) {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).sort().join("\0") !== [...k].sort().join("\0")
  )
    throw Error(`R23 ${n} schema invalid`);
}
function body(domain: string, x: any, key: string) {
  const y = JSON.parse(canonicalSemanticJson(x));
  y[key] = { ...y[key], signature: "" };
  return { domain, body: y };
}
function sig(b: unknown, s: S) {
  let ok = false;
  try {
    ok =
      createPublicKey(s.publicKeyPem).asymmetricKeyType === "ed25519" &&
      dt(s.signedAt) &&
      verify(
        null,
        Buffer.from(j(b)),
        s.publicKeyPem,
        Buffer.from(s.signature, "base64"),
      );
  } catch {}
  if (!ok) throw Error("R23 signature invalid");
}
function set(a: string[], e: string[], n: string) {
  if (
    a.length !== e.length ||
    new Set(a).size !== a.length ||
    !same([...a].sort(), [...e].sort())
  )
    throw Error(`R23 ${n} matrix incomplete`);
}
function q(x: R23Quantity) {
  exact(x, ["status", "value"], "quantity");
  if (
    x.status === "observed"
      ? !Number.isFinite(x.value) || x.value < 0
      : x.status !== "unknown" || x.value !== null
  )
    throw Error("R23 quantity invalid");
}
export const signableR23Registration = (x: R23Registration) =>
    body("open-autonomy/r23/registration/v1", x, "authority"),
  signableR23Attempt = (x: R23Attempt) =>
    body("open-autonomy/r23/attempt/v1", x, "signature"),
  signableR23Event = (x: R23Event) =>
    body("open-autonomy/r23/event/v1", x, "signature"),
  signableR23Invoice = (x: R23Invoice) =>
    body("open-autonomy/r23/invoice/v1", x, "signature"),
  signableR23Provider = (x: R23ProviderUsage) =>
    body("open-autonomy/r23/charge/v1", x, "signature"),
  signableR23Human = (x: R23HumanTiming) =>
    body("open-autonomy/r23/human/v1", x, "signature"),
  signableR23Enrollment = (x: R23Enrollment) =>
    body("open-autonomy/r23/enrollment/v1", x, "signature"),
  signableR23Campaign = (x: R23Campaign) =>
    body("open-autonomy/r23/collector/v1", x, "collector"),
  signableR23Work = (x: R23Work) =>
    body("open-autonomy/r23/work/v1", x, "signature"),
  signableR23Normalization = (x: R23NormalizationRegistry) =>
    body("open-autonomy/r23/normalization/v1", x, "signature");
export function verifyR23ExternalCampaign(c: R23Campaign, t: R23Trust) {
  exact(
    c,
    [
      "schema",
      "closureClaim",
      "registration",
      "works",
      "normalizationRegistry",
      "enrollments",
      "attempts",
      "invoices",
      "providerUsage",
      "humanTimings",
      "events",
      "summary",
      "collector",
    ],
    "campaign",
  );
  if (
    c.schema !== "autonomy.r23-external-campaign.v1" ||
    c.closureClaim !== true
  )
    throw Error("R23 campaign invalid");
  const r = c.registration;
  exact(
    r,
    [
      "schema",
      "campaignId",
      "dependencies",
      "workIds",
      "workValues",
      "analysisPlan",
      "simulatorTimings",
      "providerIds",
      "humanIds",
      "taskIds",
      "attemptsPerWork",
      "horizon",
      "workloadDigest",
      "normalizationDigest",
      "privacyDigest",
      "authority",
    ],
    "registration",
  );
  if (
    r.schema !== "autonomy.r23-external-registration.v1" ||
    !r.campaignId ||
    !same(r.dependencies, t.dependencies) ||
    !same(r.workIds, t.workIds) ||
    !same(r.workValues, t.workValues) ||
    Object.keys(r.workValues).sort().join() !== [...r.workIds].sort().join() ||
    Object.values(r.workValues).some((x) => !Number.isFinite(x) || x < 0) ||
    r.workloadDigest !== t.workloadDigest ||
    r.normalizationDigest !== t.normalizationDigest ||
    r.privacyDigest !== t.privacyDigest ||
    ![
      ...Object.values(r.dependencies),
      r.workloadDigest,
      r.normalizationDigest,
      r.privacyDigest,
    ].every(dg) ||
    r.providerIds.length < 2 ||
    new Set(r.providerIds).size !== r.providerIds.length ||
    r.humanIds.length < 2 ||
    Object.keys(r.simulatorTimings).sort().join() !==
      r.workIds
        .flatMap((w) => r.taskIds.map((q) => `${w}:${q}`))
        .sort()
        .join() ||
    Object.values(r.simulatorTimings).some(
      (x) => !Number.isFinite(x) || x < 0,
    ) ||
    r.analysisPlan.minimumTerminalWork < 2 ||
    r.analysisPlan.studentTDegreesFreedom !== 1 ||
    r.analysisPlan.studentTCritical95 !== 12.706 ||
    r.analysisPlan.transferDegreesFreedom !== 3 ||
    r.analysisPlan.transferTCritical95 !== 3.182 ||
    !r.taskIds.length ||
    !Number.isSafeInteger(r.attemptsPerWork) ||
    r.attemptsPerWork < 1 ||
    !dt(r.horizon.startsAt) ||
    !dt(r.horizon.endsAt) ||
    Date.parse(r.horizon.startsAt) >= Date.parse(r.horizon.endsAt)
  )
    throw Error("R23 registration invalid");
  sig(signableR23Registration(r), r.authority);
  if (
    r.authority.signerId !== t.registration.id ||
    fp(r.authority.publicKeyPem) !== fp(t.registration.key) ||
    Date.parse(r.authority.signedAt) > Date.parse(r.horizon.startsAt)
  )
    throw Error("R23 registration trust invalid");
  set(r.providerIds, Object.keys(t.providers), "provider registration");
  for (const p of Object.values(t.providers))
    if (Object.keys(p.dimensions).sort().join() !== "compute,money,tokens")
      throw Error("R23 registered dimensions invalid");
  set(r.humanIds, Object.keys(t.humans), "human registration");
  const registry = c.normalizationRegistry;
  exact(
    registry,
    ["schema", "entries", "digest", "signature"],
    "normalization registry",
  );
  const expectedRegistry = r.providerIds.flatMap((providerId) => {
    const p = t.providers[providerId]!;
    return (["tokens", "compute", "money"] as R23Dimension[]).map(
      (dimension) => ({
        providerId,
        providerRevision: p.providerRevision,
        model: p.model,
        dimension,
        ...p.dimensions[dimension],
      }),
    );
  });
  if (
    registry.schema !== "autonomy.r23-normalization-registry.v1" ||
    !same(registry.entries, expectedRegistry) ||
    registry.digest !== hash(registry.entries) ||
    registry.digest !== r.normalizationDigest ||
    registry.signature.signerId !== t.normalization.id ||
    fp(registry.signature.publicKeyPem) !== fp(t.normalization.key) ||
    Date.parse(registry.signature.signedAt) > Date.parse(r.horizon.startsAt)
  )
    throw Error("R23 normalization registry invalid");
  sig(signableR23Normalization(registry), registry.signature);
  set(
    c.works.map((x) => x.workId),
    r.workIds,
    "work primitive",
  );
  for (const x of c.works) {
    exact(
      x,
      [
        "workId",
        "createdAt",
        "startedAt",
        "terminalAt",
        "outcome",
        "censorState",
        "waitIntervals",
        "defects",
        "evidenceDigest",
        "signature",
      ],
      "work",
    );
    if (
      !dt(x.createdAt) ||
      !dt(x.startedAt) ||
      !dt(x.terminalAt) ||
      Date.parse(x.createdAt) > Date.parse(x.startedAt) ||
      Date.parse(x.startedAt) > Date.parse(x.terminalAt) ||
      Date.parse(x.createdAt) < Date.parse(r.horizon.startsAt) ||
      Date.parse(x.terminalAt) > Date.parse(r.horizon.endsAt) ||
      (x.censorState === "terminal"
        ? !["success", "failure", "canceled"].includes(x.outcome)
        : x.outcome !== "censored") ||
      !dg(x.evidenceDigest) ||
      x.signature.signerId !== t.eventAuthority.id ||
      fp(x.signature.publicKeyPem) !== fp(t.eventAuthority.key) ||
      Date.parse(x.signature.signedAt) < Date.parse(x.terminalAt)
    )
      throw Error("R23 work primitive invalid");
    for (const w of x.waitIntervals)
      if (
        !dt(w.startedAt) ||
        !dt(w.endedAt) ||
        Date.parse(w.startedAt) > Date.parse(w.endedAt) ||
        Date.parse(w.startedAt) < Date.parse(x.createdAt) ||
        Date.parse(w.endedAt) > Date.parse(x.terminalAt)
      )
        throw Error("R23 wait interval invalid");
    if (
      new Set(x.defects.map((d) => d.defectId)).size !== x.defects.length ||
      x.defects.some((d) => !d.defectId || !dg(d.evidenceDigest))
    )
      throw Error("R23 defect matrix invalid");
    sig(signableR23Work(x), x.signature);
  }
  set(
    c.enrollments.map((x) => x.humanId),
    r.humanIds,
    "enrollment",
  );
  for (const x of c.enrollments) {
    exact(
      x,
      [
        "humanId",
        "keyFingerprint",
        "consentDigest",
        "validFrom",
        "validUntil",
        "signature",
      ],
      "enrollment",
    );
    const h = t.humans[x.humanId];
    if (
      !h ||
      h.revoked !== false ||
      h.populationDigest !== r.workloadDigest ||
      x.keyFingerprint !== fp(h.key) ||
      x.consentDigest !== h.consentDigest ||
      x.validFrom !== h.validFrom ||
      x.validUntil !== h.validUntil ||
      !dt(x.validFrom) ||
      !dt(x.validUntil) ||
      Date.parse(x.validFrom) >= Date.parse(x.validUntil) ||
      x.signature.signerId !== t.privacy.id ||
      fp(x.signature.publicKeyPem) !== fp(t.privacy.key) ||
      Date.parse(x.signature.signedAt) > Date.parse(x.validFrom)
    )
      throw Error("R23 enrollment invalid");
    sig(signableR23Enrollment(x), x.signature);
  }
  const attemptKeys = r.workIds.flatMap((w) =>
    Array.from({ length: r.attemptsPerWork }, (_, i) => `${w}:${i}`),
  );
  set(
    c.attempts.map((x) => `${x.workId}:${x.attempt}`),
    attemptKeys,
    "attempt",
  );
  for (const x of c.attempts) {
    exact(
      x,
      [
        "workId",
        "attempt",
        "providerId",
        "startedAt",
        "completedAt",
        "outcome",
        "retryOf",
        "untrackedWork",
        "evidenceDigest",
        "signature",
      ],
      "attempt",
    );
    const p = t.providers[x.providerId];
    if (
      !p ||
      typeof x.untrackedWork !== "boolean" ||
      !dg(x.evidenceDigest) ||
      !dt(x.startedAt) ||
      !dt(x.completedAt) ||
      Date.parse(x.startedAt) < Date.parse(r.horizon.startsAt) ||
      Date.parse(x.completedAt) > Date.parse(r.horizon.endsAt) ||
      Date.parse(x.startedAt) > Date.parse(x.completedAt) ||
      (x.attempt === 0 ? x.retryOf !== null : x.retryOf !== x.attempt - 1) ||
      x.signature.signerId !== p.id ||
      fp(x.signature.publicKeyPem) !== fp(p.key) ||
      Date.parse(x.signature.signedAt) < Date.parse(x.completedAt) ||
      !t.verifyAttempt(x)
    )
      throw Error("R23 attempt invalid");
    sig(signableR23Attempt(x), x.signature);
  }
  for (const w of r.workIds) {
    const xs = c.attempts
      .filter((x) => x.workId === w)
      .sort((a, b) => a.attempt - b.attempt);
    if (
      xs.slice(0, -1).some((x) => x.outcome === "success") ||
      xs.some(
        (x, i) =>
          i > 0 && Date.parse(x.startedAt) < Date.parse(xs[i - 1]!.completedAt),
      )
    )
      throw Error("R23 terminal attempt semantics invalid");
    const work = c.works.find((x) => x.workId === w)!;
    if (
      work.startedAt !== xs[0]!.startedAt ||
      work.terminalAt !== xs.at(-1)!.completedAt ||
      (["success", "failure"].includes(work.outcome) &&
        work.outcome !== xs.at(-1)!.outcome) ||
      (["canceled", "censored"].includes(work.outcome) &&
        xs.some((x) => x.outcome === "success"))
    )
      throw Error("R23 work/attempt lifecycle join invalid");
  }
  const dims: R23Dimension[] = ["tokens", "compute", "money"];
  set(
    c.invoices.map((x) => `${x.providerId}:${x.dimension}`),
    r.providerIds.flatMap((p) => dims.map((d) => `${p}:${d}`)),
    "invoice",
  );
  if (
    new Set(c.invoices.map((x) => x.invoiceId)).size !== c.invoices.length ||
    new Set(c.invoices.map((x) => x.evidenceDigest)).size !== c.invoices.length
  )
    throw Error("R23 invoice identity invalid");
  for (const x of c.invoices) {
    exact(
      x,
      [
        "invoiceId",
        "providerId",
        "dimension",
        "rawTotal",
        "rawUnit",
        "currency",
        "priceDate",
        "providerRevision",
        "model",
        "serviceStartedAt",
        "serviceEndedAt",
        "normalizationDigest",
        "evidenceDigest",
        "observedAt",
        "signature",
      ],
      "invoice",
    );
    const p = t.providers[x.providerId],
      d = p?.dimensions[x.dimension];
    if (
      !p ||
      !d ||
      !Number.isFinite(x.rawTotal) ||
      x.rawTotal < 0 ||
      x.rawUnit !== d.rawUnit ||
      x.currency !== d.currency ||
      x.priceDate !== d.priceDate ||
      x.providerRevision !== p.providerRevision ||
      x.model !== p.model ||
      !dt(x.serviceStartedAt) ||
      !dt(x.serviceEndedAt) ||
      Date.parse(x.serviceStartedAt) > Date.parse(x.serviceEndedAt) ||
      Date.parse(x.serviceStartedAt) < Date.parse(r.horizon.startsAt) ||
      Date.parse(x.serviceEndedAt) > Date.parse(r.horizon.endsAt) ||
      x.normalizationDigest !== r.normalizationDigest ||
      !dg(x.evidenceDigest) ||
      !dt(x.observedAt) ||
      Date.parse(x.observedAt) < Date.parse(x.serviceEndedAt) ||
      Date.parse(x.observedAt) > Date.parse(r.horizon.endsAt) ||
      x.signature.signerId !== p.id ||
      fp(x.signature.publicKeyPem) !== fp(p.key) ||
      Date.parse(x.signature.signedAt) < Date.parse(x.observedAt) ||
      !t.verifyInvoice(x)
    )
      throw Error("R23 invoice invalid");
    sig(signableR23Invoice(x), x.signature);
  }
  set(
    c.providerUsage.map(
      (x) => `${x.workId}:${x.attempt}:${x.providerId}:${x.dimension}`,
    ),
    r.workIds
      .flatMap((w) =>
        Array.from({ length: r.attemptsPerWork }, (_, i) =>
          r.providerIds.flatMap((p) => dims.map((d) => `${w}:${i}:${p}:${d}`)),
        ),
      )
      .flat(),
    "charge allocation",
  );
  if (
    new Set(c.providerUsage.map((x) => x.chargeId)).size !==
      c.providerUsage.length ||
    new Set(c.providerUsage.map((x) => x.evidenceDigest)).size !==
      c.providerUsage.length
  )
    throw Error("R23 charge identity invalid");
  for (const x of c.providerUsage) {
    exact(
      x,
      [
        "chargeId",
        "invoiceId",
        "workId",
        "attempt",
        "providerId",
        "dimension",
        "rawValue",
        "allocatedValue",
        "normalizedValue",
        "rawUnit",
        "normalizedUnit",
        "currency",
        "priceDate",
        "normalizationDigest",
        "observedAt",
        "evidenceDigest",
        "signature",
      ],
      "charge",
    );
    const p = t.providers[x.providerId],
      d = p?.dimensions[x.dimension],
      a = c.attempts.find(
        (y) => y.workId === x.workId && y.attempt === x.attempt,
      ),
      inv = c.invoices.find((y) => y.invoiceId === x.invoiceId);
    if (
      !p ||
      !d ||
      !a ||
      !inv ||
      inv.providerId !== x.providerId ||
      inv.dimension !== x.dimension ||
      ![x.rawValue, x.allocatedValue, x.normalizedValue].every(
        (v) => Number.isFinite(v) && v >= 0,
      ) ||
      x.allocatedValue !== x.rawValue ||
      x.normalizedValue !== x.allocatedValue * d.factor ||
      x.rawUnit !== d.rawUnit ||
      x.normalizedUnit !== d.normalizedUnit ||
      x.currency !== d.currency ||
      x.priceDate !== d.priceDate ||
      x.normalizationDigest !== r.normalizationDigest ||
      !dg(x.evidenceDigest) ||
      !dt(x.observedAt) ||
      Date.parse(x.observedAt) < Date.parse(a.completedAt) ||
      Date.parse(x.observedAt) > Date.parse(inv.observedAt) ||
      Date.parse(x.observedAt) > Date.parse(r.horizon.endsAt) ||
      x.signature.signerId !== p.id ||
      fp(x.signature.publicKeyPem) !== fp(p.key) ||
      Date.parse(x.signature.signedAt) < Date.parse(x.observedAt) ||
      !t.verifyProvider(x)
    )
      throw Error("R23 charge reconciliation invalid");
    sig(signableR23Provider(x), x.signature);
  }
  for (const inv of c.invoices)
    if (
      c.providerUsage
        .filter((x) => x.invoiceId === inv.invoiceId)
        .reduce((n, x) => n + x.rawValue, 0) !== inv.rawTotal ||
      c.providerUsage
        .filter((x) => x.invoiceId === inv.invoiceId)
        .some((x) => {
          const a = c.attempts.find(
            (a) => a.workId === x.workId && a.attempt === x.attempt,
          )!;
          return (
            Date.parse(a.startedAt) < Date.parse(inv.serviceStartedAt) ||
            Date.parse(a.completedAt) > Date.parse(inv.serviceEndedAt) ||
            Date.parse(x.signature.signedAt) >
              Date.parse(inv.signature.signedAt)
          );
        })
    )
      throw Error("R23 invoice allocation conservation invalid");
  set(
    c.humanTimings.map((x) => `${x.workId}:${x.humanId}:${x.taskId}`),
    r.workIds.flatMap((w) =>
      r.humanIds.flatMap((h) => r.taskIds.map((q) => `${w}:${h}:${q}`)),
    ),
    "human timing",
  );
  for (const x of c.humanTimings) {
    exact(
      x,
      [
        "workId",
        "humanId",
        "taskId",
        "durationMs",
        "startedAt",
        "completedAt",
        "evidenceDigest",
        "signature",
      ],
      "human timing",
    );
    const h = t.humans[x.humanId];
    q(x.durationMs);
    if (
      !h ||
      h.revoked !== false ||
      x.durationMs.status !== "observed" ||
      !dg(x.evidenceDigest) ||
      !dt(x.startedAt) ||
      !dt(x.completedAt) ||
      Date.parse(x.startedAt) <
        Math.max(Date.parse(r.horizon.startsAt), Date.parse(h.validFrom)) ||
      Date.parse(x.completedAt) >
        Math.min(Date.parse(r.horizon.endsAt), Date.parse(h.validUntil)) ||
      Date.parse(x.startedAt) > Date.parse(x.completedAt) ||
      x.durationMs.value !==
        Date.parse(x.completedAt) - Date.parse(x.startedAt) ||
      x.signature.signerId !== x.humanId ||
      fp(x.signature.publicKeyPem) !== fp(h.key) ||
      Date.parse(x.signature.signedAt) < Date.parse(x.completedAt) ||
      !t.verifyHuman(x)
    )
      throw Error("R23 human timing invalid");
    sig(signableR23Human(x), x.signature);
  }
  for (const humanId of r.humanIds) {
    const xs = c.humanTimings
      .filter(
        (x) =>
          x.humanId === humanId &&
          x.durationMs.status === "observed" &&
          x.durationMs.value > 0,
      )
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    if (
      xs.some(
        (x, i) =>
          i > 0 && Date.parse(x.startedAt) < Date.parse(xs[i - 1]!.completedAt),
      )
    )
      throw Error("R23 person-time allocated to overlapping work");
  }
  set(
    c.events.map((x) => `${x.workId}:${x.kind}`),
    r.workIds.flatMap((w) => [`${w}:interruption`, `${w}:escalation`]),
    "event",
  );
  for (const x of c.events) {
    exact(
      x,
      [
        "workId",
        "kind",
        "occurred",
        "occurredAt",
        "serviceStartedAt",
        "serviceEndedAt",
        "evidenceDigest",
        "signature",
      ],
      "event",
    );
    if (
      !dg(x.evidenceDigest) ||
      !dt(x.serviceStartedAt) ||
      !dt(x.serviceEndedAt) ||
      Date.parse(x.serviceStartedAt) < Date.parse(r.horizon.startsAt) ||
      Date.parse(x.serviceEndedAt) > Date.parse(r.horizon.endsAt) ||
      Date.parse(x.serviceStartedAt) > Date.parse(x.serviceEndedAt) ||
      (x.occurred
        ? !dt(x.occurredAt) ||
          Date.parse(x.occurredAt!) < Date.parse(x.serviceStartedAt) ||
          Date.parse(x.occurredAt!) > Date.parse(x.serviceEndedAt)
        : x.occurredAt !== null) ||
      x.signature.signerId !== t.eventAuthority.id ||
      fp(x.signature.publicKeyPem) !== fp(t.eventAuthority.key) ||
      Date.parse(x.signature.signedAt) < Date.parse(x.serviceEndedAt) ||
      !t.verifyEvent(x)
    )
      throw Error("R23 event invalid");
    sig(signableR23Event(x), x.signature);
  }
  const unionMs = (xs: Array<{ startedAt: string; endedAt: string }>) => {
      const s = xs
        .map(
          (x) =>
            [Date.parse(x.startedAt), Date.parse(x.endedAt)] as [
              number,
              number,
            ],
        )
        .sort((a, b) => a[0] - b[0]);
      let total = 0,
        end = -Infinity;
      for (const [a, b] of s) {
        total += Math.max(0, b - Math.max(a, end));
        end = Math.max(end, b);
      }
      return total;
    },
    providerTotals = r.providerIds.flatMap((providerId) =>
      dims.map((dimension) => {
        const xs = c.providerUsage.filter(
          (x) => x.providerId === providerId && x.dimension === dimension,
        );
        return {
          providerId,
          dimension,
          raw: xs.reduce((n, x) => n + x.rawValue, 0),
          allocated: xs.reduce((n, x) => n + x.allocatedValue, 0),
          normalized: xs.reduce((n, x) => n + x.normalizedValue, 0),
        };
      }),
    ),
    humanTotalMs = c.humanTimings.reduce((n, x) => n + x.durationMs.value!, 0),
    terminal = (w: string) =>
      c.attempts
        .filter((x) => x.workId === w)
        .sort((a, b) => b.attempt - a.attempt)[0]!,
    successfulWork = c.works.filter(
      (x) => x.censorState === "terminal" && x.outcome === "success",
    ).length,
    reliabilityDenominator = c.works.filter(
      (x) =>
        x.censorState === "terminal" &&
        ["success", "failure"].includes(x.outcome),
    ).length,
    failedAttempts = c.attempts.filter((x) => x.outcome === "failure").length,
    autonomousWork = r.workIds.filter(
      (w) =>
        c.works.find((x) => x.workId === w)?.outcome === "success" &&
        !terminal(w).untrackedWork &&
        c.humanTimings
          .filter((x) => x.workId === w)
          .every((x) => x.durationMs.value === 0) &&
        c.events.filter((x) => x.workId === w).every((x) => !x.occurred),
    ).length,
    horizon = Date.parse(r.horizon.endsAt) - Date.parse(r.horizon.startsAt),
    terminalWorks = c.works.filter((x) => x.censorState === "terminal"),
    leadDurations = terminalWorks.map(
      (x) => Date.parse(x.terminalAt) - Date.parse(x.createdAt),
    ),
    cycleDurations = terminalWorks.map(
      (x) => Date.parse(x.terminalAt) - Date.parse(x.startedAt),
    ),
    waitDurations = terminalWorks.map((x) => unionMs(x.waitIntervals));
  if (
    terminalWorks.length < r.analysisPlan.minimumTerminalWork ||
    terminalWorks.length - 1 !== r.analysisPlan.studentTDegreesFreedom ||
    c.works.some(
      (x) =>
        x.censorState === "terminal" &&
        terminal(x.workId).outcome !== x.outcome,
    )
  )
    throw Error("R23 terminal work analysis invalid");
  const ci = (values: number[]): [number, number] => {
      const m = values.reduce((n, x) => n + x, 0) / values.length;
      if (values.length < 2) return [m, m];
      const se = Math.sqrt(
        values.reduce((n, x) => n + (x - m) ** 2, 0) /
          (values.length - 1) /
          values.length,
      );
      return [
        m - r.analysisPlan.studentTCritical95 * se,
        m + r.analysisPlan.studentTCritical95 * se,
      ];
    },
    wilson = (yes: number, n: number): [number, number] => {
      if (!n) return [0, 0];
      const z = 1.96,
        p = yes / n,
        d = 1 + (z * z) / n,
        m = (p + (z * z) / (2 * n)) / d,
        h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
      return [m - h, m + h];
    },
    sumDim = (dimension: R23Dimension) =>
      c.providerUsage
        .filter((x) => x.dimension === dimension)
        .reduce((n, x) => n + x.normalizedValue, 0),
    interruptions = c.events.filter(
      (x) => x.kind === "interruption" && x.occurred,
    ).length,
    escalated = new Set(
      c.events
        .filter((x) => x.kind === "escalation" && x.occurred)
        .map((x) => x.workId),
    ).size,
    firstSuccess = r.workIds.filter(
      (w) =>
        c.attempts.find((x) => x.workId === w && x.attempt === 0)?.outcome ===
        "success",
    ).length;
  const points: Record<MetricName, number> = {
    "lead-time":
      leadDurations.reduce((n, x) => n + x, 0) / leadDurations.length,
    "cycle-time":
      cycleDurations.reduce((n, x) => n + x, 0) / cycleDurations.length,
    "wait-time":
      waitDurations.reduce((n, x) => n + x, 0) / waitDurations.length,
    throughput: successfulWork,
    wip:
      c.works.reduce(
        (n, x) => n + Date.parse(x.terminalAt) - Date.parse(x.createdAt),
        0,
      ) / horizon,
    "first-pass-yield": firstSuccess / reliabilityDenominator,
    rework: c.attempts.filter((x) => x.attempt > 0).length,
    defects: new Set(
      c.works.flatMap((x) =>
        x.defects.filter((d) => d.confirmed).map((d) => d.defectId),
      ),
    ).size,
    reliability: successfulWork / reliabilityDenominator,
    tokens: sumDim("tokens"),
    compute: sumDim("compute"),
    money: sumDim("money"),
    "human-minutes": humanTotalMs / 60000,
    "interruption-burden": interruptions,
    escalation: escalated / r.workIds.length,
    "autonomy-ratio": autonomousWork / successfulWork,
    "value-delivery": r.workIds
      .filter((w) => c.works.find((x) => x.workId === w)?.outcome === "success")
      .reduce((n, w) => n + r.workValues[w]!, 0),
  };
  const metrics = (Object.keys(AUTONOMY_METRICS) as MetricName[]).map(
      (name) => {
        const d = AUTONOMY_METRICS[name],
          point = points[name],
          ci95 =
            d.uncertainty === "accounting-exact"
              ? ([point, point] as [number, number])
              : d.uncertainty === "student-t-95"
                ? name === "lead-time" || name === "cycle-time"
                  ? ci(name === "lead-time" ? leadDurations : cycleDurations)
                  : name === "wait-time"
                    ? ci(waitDurations)
                    : [point, point]
                : name === "first-pass-yield"
                  ? wilson(firstSuccess, reliabilityDenominator)
                  : name === "reliability"
                    ? wilson(successfulWork, reliabilityDenominator)
                    : name === "escalation"
                      ? wilson(escalated, r.workIds.length)
                      : wilson(autonomousWork, successfulWork);
        return {
          name,
          unit: d.unit,
          horizon: d.horizon,
          censoring: d.censoring,
          uncertainty: d.uncertainty,
          point,
          ci95,
        };
      },
    ),
    transferPairs = r.humanIds.flatMap((humanId) =>
      r.workIds.flatMap((workId) =>
        r.taskIds.map((taskId) => {
          const humanMs = c.humanTimings.find(
              (x) =>
                x.humanId === humanId &&
                x.workId === workId &&
                x.taskId === taskId,
            )!.durationMs.value!,
            simulatorMs = r.simulatorTimings[`${workId}:${taskId}`]!;
          return {
            humanId,
            workId,
            taskId,
            humanMs,
            simulatorMs,
            differenceMs: humanMs - simulatorMs,
          };
        }),
      ),
    ),
    transferValues = transferPairs.map((x) => x.differenceMs),
    transferMean =
      transferValues.reduce((n, x) => n + x, 0) / transferValues.length,
    transfer = {
      pairs: transferPairs,
      meanDifferenceMs: transferMean,
      ci95: (() => {
        const se = Math.sqrt(
            transferValues.reduce((n, x) => n + (x - transferMean) ** 2, 0) /
              (transferValues.length - 1) /
              transferValues.length,
          ),
          h = r.analysisPlan.transferTCritical95 * se;
        return [transferMean - h, transferMean + h] as [number, number];
      })(),
    },
    summary = {
      successfulWork,
      failedAttempts,
      providerTotals,
      humanTotalMs,
      autonomousWork,
      metrics,
      transfer,
    };
  if (
    transferValues.length - 1 !== r.analysisPlan.transferDegreesFreedom ||
    metrics.length !== 17 ||
    !same(c.summary, summary)
  )
    throw Error("R23 summary invalid or vacuous autonomy");
  sig(signableR23Campaign(c), c.collector);
  const latest = Math.max(
    ...c.invoices.map((x) => Date.parse(x.signature.signedAt)),
    ...c.providerUsage.map((x) => Date.parse(x.signature.signedAt)),
    ...c.humanTimings.map((x) => Date.parse(x.signature.signedAt)),
    ...c.attempts.map((x) => Date.parse(x.signature.signedAt)),
    ...c.events.map((x) => Date.parse(x.signature.signedAt)),
    ...c.works.map((x) => Date.parse(x.signature.signedAt)),
    Date.parse(c.normalizationRegistry.signature.signedAt),
  );
  const fps = [
    fp(r.authority.publicKeyPem),
    fp(c.collector.publicKeyPem),
    fp(t.privacy.key),
    fp(t.eventAuthority.key),
    fp(t.normalization.key),
    ...Object.values(t.providers).map((x) => fp(x.key)),
    ...Object.values(t.humans).map((x) => fp(x.key)),
  ];
  if (
    c.collector.signerId !== t.collector.id ||
    fp(c.collector.publicKeyPem) !== fp(t.collector.key) ||
    new Set(fps).size !== fps.length ||
    Date.parse(c.collector.signedAt) < latest ||
    Date.parse(c.collector.signedAt) > Date.parse(r.horizon.endsAt)
  )
    throw Error("R23 collector invalid");
  return {
    status: "R23-external-evidence-verified" as const,
    closureClaim: true as const,
    bundleDigest: hash(c),
  };
}
