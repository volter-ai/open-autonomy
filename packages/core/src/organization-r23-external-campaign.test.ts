import { expect, test } from "bun:test";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  AUTONOMY_METRICS,
  type MetricName,
} from "./organization-autonomy-accounting";
import {
  signableR23Attempt,
  signableR23Campaign,
  signableR23Enrollment,
  signableR23Event,
  signableR23Human,
  signableR23Invoice,
  signableR23Normalization,
  signableR23Provider,
  signableR23Registration,
  signableR23Work,
  verifyR23ExternalCampaign,
  type R23Campaign,
  type R23Dimension,
} from "./organization-r23-external-campaign";
import {
  acceptR23Collection, acceptR23CollectorIntent, acceptR23Evidence, acceptR23Registration,
  acceptR23Summary, assembleR23, createR23State, expectedR23Cells, issueR23Collection,
  issueR23CollectorIntent, issueR23Evidence, issueR23Registration, issueR23Summary,
  type R23Kind, type R23Request, type R23Response,
} from "../../../bench/dev/evidence/r23-acquisition";
const d = (x: string) => `sha256:${x.repeat(64).slice(0, 64)}` as const,
  k = () => generateKeyPairSync("ed25519"),
  pem = (x: ReturnType<typeof k>) =>
    x.publicKey.export({ type: "spki", format: "pem" }).toString(),
  fp = (p: string) =>
    createHash("sha256")
      .update(createPublicKey(p).export({ type: "spki", format: "der" }))
      .digest("hex"),
  seal = (b: any, x: ReturnType<typeof k>) =>
    sign(null, Buffer.from(canonicalSemanticJson(b)), x.privateKey).toString(
      "base64",
    ),
  at = (n: number) => `2026-07-16T00:00:0${n}Z`,
  wilson = (y: number, n: number): [number, number] => {
    const z = 1.96,
      p = y / n,
      q = 1 + (z * z) / n,
      m = (p + (z * z) / (2 * n)) / q,
      h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / q;
    return [m - h, m + h];
  };
function fixture() {
  const reg = k(),
    collect = k(),
    privacy = k(),
    eventKey = k(),
    normalizationKey = k(),
    pk = { p1: k(), p2: k() },
    humans = { h1: k(), h2: k() },
    dependencies = { R18: d("1"), R20: d("2"), R22: d("3") },
    workValues = { w1: 10, w2: 20 },
    dims: R23Dimension[] = ["tokens", "compute", "money"],
    units: any = {
      tokens: ["token", "normalized-microtokens"],
      compute: ["gpu-ms", "compute-milliseconds"],
      money: ["usd", "currency-micros"],
    },
    factor: any = { p1: 2, p2: 3 },
    registryEntries = ["p1", "p2"].flatMap((providerId) =>
      dims.map((dimension) => ({
        providerId,
        providerRevision: `${providerId}-rev`,
        model: `${providerId}-model`,
        dimension,
        rawUnit: units[dimension][0],
        normalizedUnit: units[dimension][1],
        factor: factor[providerId],
        currency: dimension === "money" ? "USD" : null,
        priceDate: dimension === "money" ? "2026-07-16" : null,
      })),
    ),
    registryDigest =
      `sha256:${createHash("sha256").update(canonicalSemanticJson(registryEntries)).digest("hex")}` as `sha256:${string}`,
    registration: any = {
      schema: "autonomy.r23-external-registration.v1",
      campaignId: "c",
      dependencies,
      workIds: ["w1", "w2"],
      workValues,
      providerIds: ["p1", "p2"],
      humanIds: ["h1", "h2"],
      taskIds: ["review"],
      analysisPlan: {
        minimumTerminalWork: 2,
        studentTDegreesFreedom: 1,
        studentTCritical95: 12.706,
        transferDegreesFreedom: 3,
        transferTCritical95: 3.182,
      },
      simulatorTimings: { "w1:review": 500, "w2:review": 500 },
      attemptsPerWork: 1,
      horizon: { startsAt: at(1), endsAt: at(9) },
      workloadDigest: d("4"),
      normalizationDigest: registryDigest,
      privacyDigest: d("6"),
      authority: {
        signerId: "registrar",
        publicKeyPem: pem(reg),
        signedAt: at(0),
        signature: "",
      },
    };
  registration.authority.signature = seal(
    signableR23Registration(registration),
    reg,
  );
  const enrollments = Object.entries(humans).map(([humanId, key]) => {
    const x: any = {
      humanId,
      keyFingerprint: fp(pem(key)),
      consentDigest: d(humanId === "h1" ? "7" : "8"),
      validFrom: at(1),
      validUntil: at(9),
      signature: {
        signerId: "privacy",
        publicKeyPem: pem(privacy),
        signedAt: at(0),
        signature: "",
      },
    };
    x.signature.signature = seal(signableR23Enrollment(x), privacy);
    return x;
  });
  const attempts = registration.workIds.map((workId: string) => {
      const providerId = workId === "w1" ? "p1" : "p2",
        x: any = {
          workId,
          attempt: 0,
          providerId,
          startedAt: at(2),
          completedAt: at(3),
          outcome: "success",
          retryOf: null,
          untrackedWork: false,
          evidenceDigest: d("8"),
          signature: {
            signerId: `${providerId}-authority`,
            publicKeyPem: pem(pk[providerId]),
            signedAt: at(4),
            signature: "",
          },
        };
      x.signature.signature = seal(signableR23Attempt(x), pk[providerId]);
      return x;
    }),
    invoices: any[] = [],
    providerUsage: any[] = [];
  const normalizationRegistry: any = {
    schema: "autonomy.r23-normalization-registry.v1",
    entries: registryEntries,
    digest: registryDigest,
    signature: {
      signerId: "normalization",
      publicKeyPem: pem(normalizationKey),
      signedAt: at(0),
      signature: "",
    },
  };
  normalizationRegistry.signature.signature = seal(
    signableR23Normalization(normalizationRegistry),
    normalizationKey,
  );
  const works = registration.workIds.map((workId: string, i: number) => {
    const x: any = {
      workId,
      createdAt: "2026-07-16T00:00:01.100Z",
      startedAt: at(2),
      terminalAt: at(3),
      outcome: "success",
      censorState: "terminal",
      waitIntervals: [
        {
          startedAt: "2026-07-16T00:00:01.200Z",
          endedAt: "2026-07-16T00:00:01.400Z",
        },
      ],
      defects:
        i === 0
          ? [{ defectId: "defect-1", confirmed: true, evidenceDigest: d("f") }]
          : [],
      evidenceDigest: d("a"),
      signature: {
        signerId: "event-authority",
        publicKeyPem: pem(eventKey),
        signedAt: at(4),
        signature: "",
      },
    };
    x.signature.signature = seal(signableR23Work(x), eventKey);
    return x;
  });
  let z = 10;
  for (const providerId of registration.providerIds)
    for (const dimension of dims) {
      const key = pk[providerId as keyof typeof pk],
        invoiceId = `inv-${providerId}-${dimension}`,
        currency = dimension === "money" ? "USD" : null,
        priceDate = dimension === "money" ? "2026-07-16" : null,
        inv: any = {
          invoiceId,
          providerId,
          dimension,
          rawTotal: 4,
          rawUnit: units[dimension][0],
          currency,
          priceDate,
          providerRevision: `${providerId}-rev`,
          model: `${providerId}-model`,
          serviceStartedAt: at(2),
          serviceEndedAt: at(3),
          normalizationDigest: registryDigest,
          evidenceDigest: `sha256:${(z++).toString(16).padStart(64, "0")}`,
          observedAt: at(4),
          signature: {
            signerId: `${providerId}-authority`,
            publicKeyPem: pem(key),
            signedAt: at(5),
            signature: "",
          },
        };
      inv.signature.signature = seal(signableR23Invoice(inv), key);
      invoices.push(inv);
      for (const workId of registration.workIds) {
        const row: any = {
          chargeId: `charge-${workId}-${providerId}-${dimension}`,
          invoiceId,
          workId,
          attempt: 0,
          providerId,
          dimension,
          rawValue: 2,
          allocatedValue: 2,
          normalizedValue: 2 * factor[providerId],
          rawUnit: units[dimension][0],
          normalizedUnit: units[dimension][1],
          currency,
          priceDate,
          normalizationDigest: registryDigest,
          observedAt: at(4),
          evidenceDigest: `sha256:${(z++).toString(16).padStart(64, "0")}`,
          signature: {
            signerId: `${providerId}-authority`,
            publicKeyPem: pem(key),
            signedAt: at(5),
            signature: "",
          },
        };
        row.signature.signature = seal(signableR23Provider(row), key);
        providerUsage.push(row);
      }
    }
  const humanTimings: any[] = registration.workIds.flatMap(
      (workId: string, i: number) =>
        registration.humanIds.map((humanId: string) => {
          const key = humans[humanId as keyof typeof humans],
            value = i ? 0 : humanId === "h1" ? 1000 : 500;
          const x: any = {
            workId,
            humanId,
            taskId: "review",
            durationMs: { status: "observed", value },
            startedAt: value
              ? new Date(Date.parse(at(3)) - value).toISOString()
              : at(3),
            completedAt: at(3),
            evidenceDigest: d("d"),
            signature: {
              signerId: humanId,
              publicKeyPem: pem(key),
              signedAt: at(5),
              signature: "",
            },
          };
          x.signature.signature = seal(signableR23Human(x), key);
          return x;
        }),
    ),
    events = registration.workIds.flatMap((workId: string) =>
      ["interruption", "escalation"].map((kind, i) => {
        const x: any = {
          workId,
          kind,
          occurred: workId === "w1" && i === 0,
          occurredAt: workId === "w1" && i === 0 ? at(3) : null,
          serviceStartedAt: at(2),
          serviceEndedAt: at(4),
          evidenceDigest: d("e"),
          signature: {
            signerId: "event-authority",
            publicKeyPem: pem(eventKey),
            signedAt: at(5),
            signature: "",
          },
        };
        x.signature.signature = seal(signableR23Event(x), eventKey);
        return x;
      }),
    ),
    points: any = {
      "lead-time": 1900,
      "cycle-time": 1000,
      "wait-time": 200,
      throughput: 2,
      wip: 0.475,
      "first-pass-yield": 1,
      rework: 0,
      defects: 1,
      reliability: 1,
      tokens: 20,
      compute: 20,
      money: 20,
      "human-minutes": 0.025,
      "interruption-burden": 1,
      escalation: 0,
      "autonomy-ratio": 0.5,
      "value-delivery": 30,
    },
    metrics = (Object.keys(AUTONOMY_METRICS) as MetricName[]).map((name) => {
      const a = AUTONOMY_METRICS[name],
        point = points[name],
        ci95 =
          a.uncertainty === "accounting-exact" ||
          a.uncertainty === "student-t-95"
            ? [point, point]
            : name === "escalation"
              ? wilson(0, 2)
              : name === "autonomy-ratio"
                ? wilson(1, 2)
                : wilson(2, 2);
      return {
        name,
        unit: a.unit,
        horizon: a.horizon,
        censoring: a.censoring,
        uncertainty: a.uncertainty,
        point,
        ci95,
      };
    }),
    providerTotals = registration.providerIds.flatMap((providerId: string) =>
      dims.map((dimension) => ({
        providerId,
        dimension,
        raw: 4,
        allocated: 4,
        normalized: 4 * factor[providerId],
      })),
    ),
    summary = {
      successfulWork: 2,
      failedAttempts: 0,
      providerTotals,
      humanTotalMs: 1500,
      autonomousWork: 1,
      metrics,
      transfer: (() => {
        const pairs = [
            {
              humanId: "h1",
              workId: "w1",
              taskId: "review",
              humanMs: 1000,
              simulatorMs: 500,
              differenceMs: 500,
            },
            {
              humanId: "h1",
              workId: "w2",
              taskId: "review",
              humanMs: 0,
              simulatorMs: 500,
              differenceMs: -500,
            },
            {
              humanId: "h2",
              workId: "w1",
              taskId: "review",
              humanMs: 500,
              simulatorMs: 500,
              differenceMs: 0,
            },
            {
              humanId: "h2",
              workId: "w2",
              taskId: "review",
              humanMs: 0,
              simulatorMs: 500,
              differenceMs: -500,
            },
          ],
          meanDifferenceMs = -125,
          se = Math.sqrt(
            pairs.reduce(
              (n, x) => n + (x.differenceMs - meanDifferenceMs) ** 2,
              0,
            ) /
              3 /
              4,
          ),
          h = 3.182 * se;
        return {
          pairs,
          meanDifferenceMs,
          ci95: [meanDifferenceMs - h, meanDifferenceMs + h],
        };
      })(),
    },
    campaign: any = {
      schema: "autonomy.r23-external-campaign.v1",
      closureClaim: true,
      registration,
      works,
      normalizationRegistry,
      enrollments,
      attempts,
      invoices,
      providerUsage,
      humanTimings,
      events,
      summary,
      collector: {
        signerId: "collector",
        publicKeyPem: pem(collect),
        signedAt: at(8),
        signature: "",
      },
    };
  campaign.collector.signature = seal(signableR23Campaign(campaign), collect);
  const providers: any = Object.fromEntries(
    registration.providerIds.map((id: string) => [
      id,
      {
        id: `${id}-authority`,
        key: pem(pk[id as keyof typeof pk]),
        providerRevision: `${id}-rev`,
        model: `${id}-model`,
        dimensions: Object.fromEntries(
          dims.map((dimension) => [
            dimension,
            {
              rawUnit: units[dimension][0],
              normalizedUnit: units[dimension][1],
              factor: factor[id],
              currency: dimension === "money" ? "USD" : null,
              priceDate: dimension === "money" ? "2026-07-16" : null,
            },
          ]),
        ),
      },
    ]),
  );
  return {
    campaign: campaign as R23Campaign,
    _keys: { reg, collect, privacy, eventKey, normalizationKey, pk, humans },
    trust: {
      dependencies,
      workIds: ["w1", "w2"],
      workValues,
      workloadDigest: d("4"),
      normalizationDigest: registryDigest,
      privacyDigest: d("6"),
      registration: { id: "registrar", key: pem(reg) },
      collector: { id: "collector", key: pem(collect) },
      privacy: { id: "privacy", key: pem(privacy) },
      eventAuthority: { id: "event-authority", key: pem(eventKey) },
      normalization: { id: "normalization", key: pem(normalizationKey) },
      providers,
      humans: {
        h1: {
          key: pem(humans.h1),
          consentDigest: d("7"),
          validFrom: at(1),
          validUntil: at(9),
          revoked: false,
          populationDigest: d("4"),
        },
        h2: {
          key: pem(humans.h2),
          consentDigest: d("8"),
          validFrom: at(1),
          validUntil: at(9),
          revoked: false,
          populationDigest: d("4"),
        },
      },
      verifyAttempt: () => true,
      verifyInvoice: () => true,
      verifyProvider: () => true,
      verifyHuman: () => true,
      verifyEvent: () => true,
    },
  };
}
test("verifies full derived R23 metrics and signed dimensioned accounting", () => {
  const { campaign, trust } = fixture();
  expect(verifyR23ExternalCampaign(campaign, trust).closureClaim).toBe(true);
  expect(campaign.summary.metrics).toHaveLength(17);
});
test("reconstructs the exact registered accounting product through causal acquisition", () => {
  const { campaign: source, trust, _keys: keys } = fixture(), publicKeys: Record<string, string> = {
    registration: pem(keys.reg), collector: pem(keys.collect), privacy: pem(keys.privacy), event: pem(keys.eventKey), normalization: pem(keys.normalizationKey),
    p1: pem(keys.pk.p1), p2: pem(keys.pk.p2), h1: pem(keys.humans.h1), h2: pem(keys.humans.h2),
  }, state = createR23State({ campaignId: source.registration.campaignId, createdAt: at(0), registrationKeyId: "registration", collectorKeyId: "collector", privacyKeyId: "privacy", eventKeyId: "event", normalizationKeyId: "normalization", providerKeyIds: { p1: "p1", p2: "p2" }, humanKeyIds: { h1: "h1", h2: "h2" }, publicKeys });
  const keyFor = (q: R23Request) => q.action === "registration" ? "registration" : q.action === "summary" || q.action === "collector-intent" || q.action === "collection" ? "collector" : q.kind === "normalization" ? "normalization" : q.kind === "enrollments" ? "privacy" : q.kind === "works" || q.kind === "events" ? "event" : q.signerId;
  const privateKeys: any = { registration: keys.reg.privateKey, collector: keys.collect.privateKey, privacy: keys.privacy.privateKey, event: keys.eventKey.privateKey, normalization: keys.normalizationKey.privateKey, p1: keys.pk.p1.privateKey, p2: keys.pk.p2.privateKey, h1: keys.humans.h1.privateKey, h2: keys.humans.h2.privateKey };
  const respond = (q: R23Request, fragment: unknown): R23Response => { const signerKeyId = keyFor(q), body = { schema: "open-autonomy.bench-r23-acquisition-response.v1" as const, requestDigest: `sha256:${createHash("sha256").update(canonicalSemanticJson(q)).digest("hex")}` as const, fragmentDigest: `sha256:${createHash("sha256").update(canonicalSemanticJson(fragment)).digest("hex")}` as const, signerKeyId, signedAt: at(9) }; return { ...body, signature: sign(null, Buffer.from(canonicalSemanticJson(body)), privateKeys[signerKeyId]).toString("base64"), fragment }; };
  const acceptOne = (kind: R23Kind, id: string, fragment: any) => { const q = issueR23Evidence(state, kind, id, kind === "attempts" ? fragment.providerId : undefined); acceptR23Evidence(state, kind, id, respond(q, fragment)); };
  let q = issueR23Registration(state); acceptR23Registration(state, respond(q, source.registration));
  acceptOne("normalization", "registry", source.normalizationRegistry);
  for (const x of source.enrollments) acceptOne("enrollments", encodeURIComponent(x.humanId), x);
  for (const x of source.attempts) acceptOne("attempts", [x.workId, String(x.attempt)].map(encodeURIComponent).join("/"), x);
  for (const x of source.works) acceptOne("works", encodeURIComponent(x.workId), x);
  for (const x of source.invoices) acceptOne("invoices", [x.providerId, x.dimension].map(encodeURIComponent).join("/"), x);
  for (const x of source.providerUsage) acceptOne("usage", [x.workId, String(x.attempt), x.providerId, x.dimension].map(encodeURIComponent).join("/"), x);
  for (const x of source.humanTimings) acceptOne("humans", [x.workId, x.humanId, x.taskId].map(encodeURIComponent).join("/"), x);
  for (const x of source.events) acceptOne("events", [x.workId, x.kind].map(encodeURIComponent).join("/"), x);
  expect(Object.values(expectedR23Cells(state)).reduce((n, xs) => n + xs.length, 0)).toBe(33);
  q = issueR23Summary(state); acceptR23Summary(state, respond(q, source.summary));
  q = issueR23CollectorIntent(state); const { signature: _, ...intent } = source.collector; acceptR23CollectorIntent(state, respond(q, intent));
  q = issueR23Collection(state); acceptR23Collection(state, respond(q, { campaignSignature: source.collector.signature }));
  const assembled = assembleR23(state); expect(canonicalSemanticJson(assembled)).toBe(canonicalSemanticJson(source)); expect(verifyR23ExternalCampaign(assembled, trust).closureClaim).toBe(true);
});
test("rejects invoice, charge, normalization, enrollment, terminal, metric and autonomy fraud", () => {
  const ms = [
    (x: any) => x.invoices.pop(),
    (x: any) => x.providerUsage.pop(),
    (x: any) => (x.invoices[0].rawTotal = 3),
    (x: any) => (x.providerUsage[0].normalizedValue = 0),
    (x: any) => (x.providerUsage[0].normalizationDigest = d("f")),
    (x: any) => (x.enrollments[0].validUntil = at(0)),
    (x: any) => (x.attempts[0].signature.signature = "bad"),
    (x: any) => (x.events[0].signature.signerId = "wrong"),
    (x: any) => (x.normalizationRegistry.entries[0].factor = 99),
    (x: any) => (x.works[0].createdAt = x.works[0].terminalAt),
    (x: any) => (x.works[0].startedAt = "2026-07-16T00:00:02.100Z"),
    (x: any) => (x.works[0].signature.signedAt = at(2)),
    (x: any) =>
      x.works[0].waitIntervals.push({
        startedAt: "2026-07-16T00:00:01.300Z",
        endedAt: "2026-07-16T00:00:01.500Z",
      }),
    (x: any) => (x.works[0].waitIntervals[0].endedAt = at(0)),
    (x: any) => x.works[0].defects.push(x.works[0].defects[0]),
    (x: any) => (x.invoices[0].serviceEndedAt = at(5)),
    (x: any) => (x.invoices[0].serviceStartedAt = at(3)),
    (x: any) => (x.invoices[0].signature.signedAt = at(4)),
    (x: any) => delete x.registration.simulatorTimings["w2:review"],
    (x: any) => (x.summary.transfer.meanDifferenceMs = 0),
    (x: any) => (x.attempts[0].untrackedWork = true),
    (x: any) => x.summary.metrics.pop(),
    (x: any) => (x.summary.metrics[0].point = 0),
    (x: any) => (x.providerUsage[1].chargeId = x.providerUsage[0].chargeId),
  ];
  for (const m of ms) {
    const { campaign, trust } = fixture();
    m(campaign);
    expect(() => verifyR23ExternalCampaign(campaign, trust)).toThrow();
  }
});
test("rejects self-consistent alternate dimensions and censored-work summary upgrades", () => {
  const a: any = fixture();
  a.trust.providers.p1.dimensions.other = {
    ...a.trust.providers.p1.dimensions.tokens,
  };
  expect(() => verifyR23ExternalCampaign(a.campaign, a.trust)).toThrow(
    "registered dimensions",
  );
  const b: any = fixture(),
    work = b.campaign.works.find((x: any) => x.workId === "w2"),
    attempt = b.campaign.attempts.find((x: any) => x.workId === "w2");
  work.outcome = "censored";
  work.censorState = "right-censored";
  work.signature.signature = seal(signableR23Work(work), b._keys.eventKey);
  attempt.outcome = "failure";
  attempt.signature.signature = seal(
    signableR23Attempt(attempt),
    b._keys.pk.p2,
  );
  b.campaign.collector.signature = seal(
    signableR23Campaign(b.campaign),
    b._keys.collect,
  );
  expect(() => verifyR23ExternalCampaign(b.campaign, b.trust)).toThrow(
    "terminal work analysis",
  );
});
