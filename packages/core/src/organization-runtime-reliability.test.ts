import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeterministicFaultInjector,
  DisasterRecoveryController,
  FairAdmissionController,
  FileRecoveryJournal,
  MemoryRecoveryJournal,
  ReliabilityOperationsController,
  ReliabilitySloController,
  RUNTIME_SERVICES,
  buildOperatorDrillArtifact,
  diagnoseAlert,
  exerciseRunbook,
  measureSlo,
  orchestrateCompleteRestore,
  simulateResourceSaturation,
  type AdmissionRequest,
  type RuntimeService,
  type RecoveryJournal,
  type ServiceSlo,
} from "./organization-runtime-reliability";

const services: RuntimeService[] = [
  "registry",
  "event-store",
  "compiler",
  "api",
  "reconciler",
  "interaction",
  "worker",
  "adapter",
];
const journalKey = "r21-test-journal-authentication-key";
const slo: ServiceSlo = {
  service: "api",
  windowMs: 60_000,
  availabilityTarget: 0.99,
  latencyTargetMs: 100,
  latencyPercentile: 0.95,
  maxCostPerRequest: 2,
  degradation: "read-only",
};

describe("R21 SLO and error-budget measurement", () => {
  test("missing telemetry cannot report perfect health", () => {
    const report = measureSlo(slo, [], 100);
    expect(report).toMatchObject({ availability: 0, violated: true });
    expect(report.reasons).toContain("telemetry-missing");
  });
  test("measures only the declared window and makes an outage consume the budget", () => {
    const samples = [
      { atMs: 1, successful: false, latencyMs: 999, cost: 100 },
      ...Array.from({ length: 100 }, (_, i) => ({
        atMs: 100_000 + i,
        successful: i !== 0,
        latencyMs: i === 99 ? 101 : 20,
        cost: 1,
      })),
    ];
    const report = measureSlo(slo, samples, 100_100);
    expect(report.samples).toBe(100);
    expect(report.availability).toBe(0.99);
    expect(report.badEvents).toBe(1);
    expect(report.allowedBadEvents).toBeCloseTo(1);
    expect(report.errorBudgetRemaining).toBeCloseTo(0);
    expect(report.violated).toBe(false);
  });
  test("reports availability, tail latency, and cost violations independently", () => {
    const report = measureSlo(
      slo,
      Array.from({ length: 100 }, (_, i) => ({
        atMs: i,
        successful: i > 1,
        latencyMs: 120,
        cost: 3,
      })),
      100,
    );
    expect(report.reasons).toEqual(["availability", "latency", "cost"]);
    expect(report.errorBudgetRemaining).toBeLessThan(0);
  });
});

describe("R21 overload, fairness, and isolation", () => {
  const request = (
    tenant: string,
    n: number,
    costUnits = 1,
  ): AdmissionRequest => ({
    id: `${tenant}-${n}`,
    tenant,
    service: "worker",
    submittedAtMs: 0,
    costUnits,
    privileged: false,
  });
  test("bounded queues prevent a noisy tenant from consuming another tenant's allowance", () => {
    const admission = new FairAdmissionController({
      maxInFlight: 2,
      maxQueuedPerTenant: 2,
      maxTotalQueued: 4,
      tenantWeights: { noisy: 1, quiet: 1 },
      shedAfterMs: 100,
    });
    expect(
      [0, 1, 2].map((n) => admission.submit(request("noisy", n)).status),
    ).toEqual(["queued", "queued", "shed"]);
    expect(admission.submit(request("quiet", 0)).status).toBe("queued");
    const dispatched = admission.dispatch(1);
    expect(new Set(dispatched.map((r) => r.tenant))).toEqual(
      new Set(["noisy", "quiet"]),
    );
    expect(admission.snapshot().shedByTenant).toEqual({ noisy: 1 });
  });
  test("configured tenant reservation survives a noisy tenant filling first", () => {
    const admission = new FairAdmissionController({
      maxInFlight: 1,
      maxQueuedPerTenant: 4,
      maxTotalQueued: 4,
      tenantWeights: { noisy: 1, quiet: 1 },
      shedAfterMs: 100,
    });
    expect(
      [0, 1, 2, 3].map((n) => admission.submit(request("noisy", n)).status),
    ).toEqual(["queued", "queued", "shed", "shed"]);
    expect(admission.submit(request("quiet", 0)).status).toBe("queued");
  });
  test("load/soak accounting remains fair over repeated saturation", () => {
    const admission = new FairAdmissionController({
      maxInFlight: 1,
      maxQueuedPerTenant: 200,
      maxTotalQueued: 400,
      tenantWeights: { a: 1, b: 1 },
      shedAfterMs: 10_000,
    });
    for (let i = 0; i < 100; i++) {
      admission.submit(request("a", i));
      admission.submit(request("b", i));
    }
    for (let i = 0; i < 200; i++) {
      const [next] = admission.dispatch(i);
      expect(next).toBeDefined();
      admission.complete(next!.id);
    }
    expect(admission.snapshot().admittedByTenant).toEqual({ a: 100, b: 100 });
    expect(admission.snapshot().costByTenant).toEqual({ a: 100, b: 100 });
  });
  test("sheds stale work and forbids privileged mutation in degraded/read-only and pause modes", () => {
    const admission = new FairAdmissionController({
      maxInFlight: 1,
      maxQueuedPerTenant: 2,
      maxTotalQueued: 2,
      tenantWeights: {},
      shedAfterMs: 5,
    });
    admission.submit(request("a", 1));
    expect(admission.dispatch(6)).toEqual([]);
    expect(admission.snapshot().shedByTenant.a).toBe(1);
    const privileged = { ...request("a", 2), privileged: true };
    admission.setMode("read-only");
    expect(admission.submit(privileged).reason).toBe("read-only");
    admission.setMode("degraded");
    expect(admission.submit({ ...privileged, id: "a-3" }).reason).toBe(
      "degraded-privileged",
    );
    admission.setMode("normal");
    admission.pauseTenant("a", true);
    expect(admission.submit({ ...privileged, id: "a-4" }).reason).toBe(
      "paused",
    );
    admission.pauseTenant("a", false);
    expect(admission.submit(request("b", 1)).status).toBe("queued");
  });
  test("mode and pause changes also constrain work that was already queued", () => {
    const admission = new FairAdmissionController({
      maxInFlight: 1,
      maxQueuedPerTenant: 4,
      maxTotalQueued: 8,
      tenantWeights: { a: 1, b: 1 },
      shedAfterMs: 100,
    });
    admission.submit({ ...request("a", 10), privileged: true });
    admission.setMode("read-only");
    expect(admission.dispatch(1)).toEqual([]);
    expect(admission.snapshot().shedByTenant.a).toBe(1);
    admission.setMode("normal");
    admission.submit(request("a", 11));
    admission.submit(request("b", 11));
    admission.pauseTenant("a", true);
    expect(admission.dispatch(2).map((x) => x.tenant)).toEqual(["b"]);
  });
});

describe("R21 disaster recovery and safe operations", () => {
  const policy = {
    backupFrequencyMs: 10,
    rpoMs: 20,
    rtoMs: 30,
    restoreOrder: services,
    supportedSchemaVersions: [1, 2],
    versionSkew: 1,
  };
  const base = {
    sequence: 7,
    capturedAtMs: 100,
    authorities: [
      {
        id: "credential",
        tenant: "a",
        status: "active" as const,
        changedAtMs: 80,
      },
    ],
    effects: [
      { id: "effect-1", tenant: "a", acknowledgedAtMs: 90, privileged: true },
    ],
    schemaVersion: 1,
    componentState: { healthy: true },
  };
  const backupTrust = { signer: "backup-service", sign: (digest: string) => createHmac("sha256", "backup-key").update(digest).digest("hex"), verify(signer: string, digest: string, signature: string) { return signer === this.signer && this.sign(digest) === signature; } };
  const recovery = (journal: RecoveryJournal = new MemoryRecoveryJournal()) => new DisasterRecoveryController(policy, backupTrust, journal);
  test("measures dependency/region RPO and RTO and declares missed objectives", () => {
    const controller = recovery(),
      backup = controller.backup(base, 100);
    expect(controller.backupDue(109)).toBe(false);
    expect(controller.backupDue(110)).toBe(true);
    const drill = controller.restore(backup, "region", 115, 140, 2, false);
    expect({
      rpo: drill.rpoMs,
      rto: drill.rtoMs,
      ok: drill.withinRpo && drill.withinRto,
    }).toEqual({ rpo: 15, rto: 25, ok: true });
    expect(() =>
      controller.restore(backup, "storage", 130, 170, 2, false),
    ).toThrow("without error-budget violation");
    expect(
      controller.restore(backup, "storage", 130, 170, 2, true)
        .errorBudgetViolation,
    ).toBe(true);
  });
  test("restore overlays revocation tombstones and acknowledged effects so neither can be resurrected/repeated", () => {
    const controller = recovery(),
      backup = controller.backup(base, 100);
    controller.observeAuthority({
      id: "credential",
      tenant: "a",
      status: "revoked",
      changedAtMs: 108,
    });
    controller.acknowledge({
      id: "effect-2",
      tenant: "a",
      acknowledgedAtMs: 109,
      privileged: true,
    });
    const restored = controller.restore(
      backup,
      "control-plane",
      110,
      120,
      1,
      false,
    ).restored;
    expect(restored.authorities).toContainEqual(
      expect.objectContaining({ id: "credential", status: "revoked" }),
    );
    expect(restored.effects.map((e) => e.id)).toEqual(["effect-1", "effect-2"]);
    expect(() =>
      controller.observeAuthority({
        id: "credential",
        tenant: "a",
        status: "active",
        changedAtMs: 109,
      }),
    ).toThrow(/resurrected/);
  });
  test("same local authority and effect IDs remain tenant isolated", () => {
    const controller = recovery(),
      backup = controller.backup(
        {
          ...base,
          authorities: [
            ...base.authorities,
            {
              id: "credential",
              tenant: "b",
              status: "active",
              changedAtMs: 80,
            },
          ],
          effects: [
            ...base.effects,
            {
              id: "effect-1",
              tenant: "b",
              acknowledgedAtMs: 90,
              privileged: true,
            },
          ],
        },
        100,
      );
    controller.observeAuthority({
      id: "credential",
      tenant: "a",
      status: "revoked",
      changedAtMs: 108,
    });
    controller.acknowledge({
      id: "effect-1",
      tenant: "a",
      acknowledgedAtMs: 90,
      privileged: true,
    });
    const restored = controller.restore(
      backup,
      "region",
      110,
      120,
      1,
      false,
    ).restored;
    expect(restored.authorities.find((a) => a.tenant === "a")?.status).toBe(
      "revoked",
    );
    expect(restored.authorities.find((a) => a.tenant === "b")?.status).toBe(
      "active",
    );
    expect(restored.effects.filter((e) => e.id === "effect-1")).toHaveLength(2);
  });
  test("enforces restore ordering and safe rolling upgrade/downgrade skew", () => {
    const controller = recovery();
    controller.assertRestoreOrder(services);
    controller.assertUpgrade(1, 2);
    controller.assertUpgrade(2, 1);
    expect(() => controller.assertRestoreOrder([...services].reverse())).toThrow(
      "unsafe restore ordering",
    );
    expect(() => controller.assertUpgrade(1, 3)).toThrow(
      "unsupported rolling version skew",
    );
  });
  test("authenticates backups and preserves revocation/effect journal across a fresh controller", () => { const journal = new MemoryRecoveryJournal(), first = recovery(journal), backup = first.backup(base, 100); first.observeAuthority({ id: "credential", tenant: "a", status: "revoked", changedAtMs: 108 }); first.acknowledge({ id: "effect-2", tenant: "a", acknowledgedAtMs: 109, privileged: true }); const fresh = recovery(journal); expect(fresh.backupDue(109)).toBe(false); const restored = fresh.restore(backup, "region", 110, 120, 1, false).restored; expect(restored.authorities.find((a) => a.id === "credential")?.status).toBe("revoked"); expect(restored.effects.map((e) => e.id)).toContain("effect-2"); const forged = { ...backup, signature: "forged" }; expect(() => fresh.restore(forged, "region", 110, 120, 1, false)).toThrow("integrity"); });
  test("filesystem journal survives complete journal and controller reconstruction", () => { const root = mkdtempSync(join(tmpdir(), "r21-journal-")); try { const first = recovery(new FileRecoveryJournal(root, journalKey)), backup = first.backup(base, 100); first.observeAuthority({ id: "credential", tenant: "a", status: "revoked", changedAtMs: 108 }); first.acknowledge({ id: "effect-2", tenant: "a", acknowledgedAtMs: 109, privileged: true }); const reopened = recovery(new FileRecoveryJournal(root, journalKey)), restored = reopened.restore(backup, "storage", 110, 120, 1, false).restored; expect(restored.authorities.find((a) => a.id === "credential")?.status).toBe("revoked"); expect(restored.effects.map((e) => e.id)).toContain("effect-2"); } finally { rmSync(root, { recursive: true, force: true }); } });
  test("fresh controller fails closed on journal tampering, truncation, and reorder", () => { for (const mutation of ["tamper", "truncate", "reorder"] as const) { const root = mkdtempSync(join(tmpdir(), `r21-${mutation}-`)); try { const first = recovery(new FileRecoveryJournal(root, journalKey)), backup = first.backup(base, 100); first.observeAuthority({ id: "credential", tenant: "a", status: "revoked", changedAtMs: 108 }); first.acknowledge({ id: "effect-2", tenant: "a", acknowledgedAtMs: 109, privileged: true }); const path = join(root, "recovery-journal.json"), parsed = JSON.parse(readFileSync(path, "utf8")); if (mutation === "tamper") parsed.entries[1].value.status = "active"; else if (mutation === "truncate") parsed.entries.pop(); else [parsed.entries[0], parsed.entries[1]] = [parsed.entries[1], parsed.entries[0]]; writeFileSync(path, JSON.stringify(parsed)); expect(() => recovery(new FileRecoveryJournal(root, journalKey))).toThrow(/authentication|truncation|sequence|chain|rollback/); expect(backup.state.sequence).toBe(base.sequence); } finally { rmSync(root, { recursive: true, force: true }); } } });
  test("process-safe concurrent writers lose no acknowledged effects", async () => { const root = mkdtempSync(join(tmpdir(), "r21-race-")); try { new FileRecoveryJournal(root, journalKey); const script = `import { FileRecoveryJournal } from './packages/core/src/organization-runtime-reliability.ts'; const j=new FileRecoveryJournal(process.argv[1],process.argv[2]); j.appendEffect({id:process.argv[3],tenant:'race',acknowledgedAtMs:Number(process.argv[4]),privileged:true});`; const children = Array.from({ length: 12 }, (_, i) => Bun.spawn([process.execPath, "-e", script, root, journalKey, `effect-${i}`, String(100 + i)], { cwd: join(import.meta.dir, "../../.."), stdout: "pipe", stderr: "pipe" })); const results = await Promise.all(children.map(async (child) => ({ exit: await child.exited, stderr: await new Response(child.stderr).text() }))); expect(results).toEqual(results.map(() => ({ exit: 0, stderr: "" }))); const effects = new FileRecoveryJournal(root, journalKey).effects(); expect(effects).toHaveLength(12); expect(new Set(effects.map((effect) => effect.id)).size).toBe(12); } finally { rmSync(root, { recursive: true, force: true }); } });
});

describe("R21 complete service, fault, operations and saturation models", () => {
  test("requires and evaluates all eight SLOs with automatic degradation", () => { const slos = RUNTIME_SERVICES.map((service) => ({ ...slo, service, degradation: service === "event-store" ? "read-only" as const : "degraded" as const })), controller = new ReliabilitySloController(slos), samples = Object.fromEntries(RUNTIME_SERVICES.map((service) => [service, [{ atMs: 100, successful: service !== "event-store", latencyMs: 10, cost: 1 }]])) as Record<RuntimeService, Array<{ atMs: number; successful: boolean; latencyMs: number; cost: number }>>, result = controller.evaluate(samples, 100); expect(Object.keys(result.reports)).toHaveLength(8); expect(result.modes["event-store"]).toBe("read-only"); expect(result.modes.api).toBe("normal"); expect(() => new ReliabilitySloController(slos.slice(1))).toThrow("all eight"); });
  test("injects every declared fault domain through explicit topology", () => { const topology = RUNTIME_SERVICES.map((service, i) => ({ service, zone: i % 2 ? "z2" : "z1", region: i < 4 ? "east" : "west", dependencies: service === "api" ? ["registry"] : service === "registry" ? ["postgres"] : [] })), injector = new DeterministicFaultInjector(topology), fixtures: Array<[Parameters<typeof injector.inject>[0]["domain"], string]> = [["dependency","postgres"],["zone","z1"],["region","west"],["network","adapter"],["storage","event-store"],["control-plane","reconciler"]]; for (const [domain,target] of fixtures) { const impact = injector.inject({ domain, target, atMs: 100, durationMs: 20 }); expect(impact.unavailable.length).toBeGreaterThan(0); expect(impact.trace.at(-1)).toBe("recover@120"); } expect(injector.inject({ domain: "dependency", target: "postgres", atMs: 0, durationMs: 1 }).degraded).toContain("api"); });
  test("orchestrates the complete restore in policy order and measures wall-clock RTO", () => { const policy = { backupFrequencyMs: 10, rpoMs: 20, rtoMs: 10, restoreOrder: [...RUNTIME_SERVICES], supportedSchemaVersions: [1,2], versionSkew: 1 }, calls: RuntimeService[] = [], report = orchestrateCompleteRestore(policy, Object.fromEntries(RUNTIME_SERVICES.map((s) => [s, { state: s }])), 100, { restore(service) { calls.push(service); return { service, durationMs: 1, receipt: `receipt:${service}` }; } }); expect(calls).toEqual([...RUNTIME_SERVICES]); expect(report).toEqual(expect.objectContaining({ completedAtMs: 108, wallClockRtoMs: 8, withinRto: true })); });
  test("executes maintenance, schema rollout, rolling upgrade/downgrade, credential rotation and safe decommission", () => { const initial = RUNTIME_SERVICES.map((service) => ({ service, version: 1, schemaVersion: 1, credential: `old:${service}`, credentialStatus: "active" as const, maintenance: false, drained: false, decommissioned: false })), operations = new ReliabilityOperationsController(initial, [1,2], 1); operations.beginMaintenance("worker", 15, { startMs: 10, endMs: 20 }); operations.rolloutSchema("worker", 2); operations.rollVersion("worker", 2); operations.rollVersion("worker", 1); operations.beginCredentialRotation("worker", "new:worker"); operations.finishCredentialRotation("worker"); operations.drain("worker"); operations.decommission("worker", "backup:worker"); expect(operations.snapshot().services.worker).toEqual(expect.objectContaining({ version: 1, schemaVersion: 2, credential: "new:worker", credentialStatus: "revoked", decommissioned: true })); expect(() => operations.beginMaintenance("worker", 15, { startMs: 10, endMs: 20 })).toThrow("unsafe"); });
  test("allocates saturated CPU/memory/token resources without starving equal tenants", () => { const report = simulateResourceSaturation({ cpu: 20, memory: 20, tokens: 20 }, [{ tenant: "a", cpu: 20, memory: 20, tokens: 20, weight: 1 }, { tenant: "b", cpu: 20, memory: 20, tokens: 20, weight: 1 }]); expect(report.starved).toEqual([]); expect(report.allocations.a).toEqual(report.allocations.b); expect(report.dominantShares.a).toBe(report.dominantShares.b); });
  test("orders asymmetric tenants by dominant share rather than CPU share", () => { const report = simulateResourceSaturation({ cpu: 10, memory: 10, tokens: 10 }, [{ tenant: "a", cpu: 10, memory: 10, tokens: 0, weight: 1 }, { tenant: "b", cpu: 0, memory: 10, tokens: 0, weight: 1 }]); expect(report.starved).toEqual([]); expect(report.allocations.a.cpu).toBeGreaterThan(0); expect(Math.abs(report.dominantShares.a - report.dominantShares.b)).toBeLessThanOrEqual(0.1); });
});

describe("R21 alert to root cause to exercised runbook", () => {
  test("produces an integrity-bound diagnosis an unfamiliar operator can execute", () => {
    const diagnosis = diagnoseAlert(
      [
        {
          service: "worker",
          kind: "queue",
          value: 11,
          threshold: 10,
          tenant: "a",
        },
        {
          service: "adapter",
          kind: "dependency",
          value: 1,
          threshold: 0,
          dependency: "paperclip",
        },
      ],
      {
        "dependency:paperclip": [
          { id: "inspect", action: "inspect" },
          { id: "read-only", action: "read-only", requires: ["inspect"] },
          { id: "failover", action: "failover", requires: ["read-only"] },
        ],
      },
    );
    expect(diagnosis.rootCause).toBe("dependency:paperclip");
    const exercise = exerciseRunbook(diagnosis, 1_000, () => true);
    expect(exercise.resolved).toBe(true);
    expect(exercise.completed).toEqual(["inspect", "read-only", "failover"]);
    expect(exercise.trace.map((x) => x.atMs)).toEqual([1000, 1001, 1002]);
  });
  test("will not claim resolution when a prerequisite or operator action fails", () => {
    const diagnosis = diagnoseAlert(
      [{ service: "event-store", kind: "integrity", value: 1, threshold: 0 }],
      {
        "integrity:event-store": [
          { id: "pause", action: "pause" },
          { id: "restore", action: "restore", requires: ["pause"] },
        ],
      },
    );
    const exercise = exerciseRunbook(
      diagnosis,
      0,
      (step) => step.id !== "pause",
    );
    expect(exercise.resolved).toBe(false);
    expect(exercise.skipped).toEqual(["pause", "restore"]);
  });
  test("emits an executable drill artifact without pretending a simulated operator is unfamiliar human evidence", () => { const diagnosis = diagnoseAlert([{ service: "registry", kind: "dependency", value: 1, threshold: 0, dependency: "postgres" }], { "dependency:postgres": [{ id: "inspect", action: "inspect" }, { id: "failover", action: "failover", requires: ["inspect"] }] }), exercise = exerciseRunbook(diagnosis, 100, () => true), artifact = buildOperatorDrillArtifact({ id: "deterministic-fixture", familiarity: "simulated" }, diagnosis, exercise, 100, 102, ["trace://synthetic-drill"]); expect(artifact).toEqual(expect.objectContaining({ schema: "autonomy.operator-drill.v1", synthetic: true, resolvedRootCause: "dependency:postgres" })); expect(artifact.digest).toBeTruthy(); });
});
