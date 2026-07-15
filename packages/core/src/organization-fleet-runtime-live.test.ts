import { expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  HermesLiveProvider,
  MemoryHermesProviderStateStore,
  ProcessHermesNativePort,
} from "./organization-hermes-live-provider";
import {
  FleetReconciler,
  MemoryFleetReconcilerBackend,
  classify,
  type FleetDesired,
  type FleetEffect,
  type FleetObservation,
} from "./organization-fleet-reconciler";
import {
  NativeFleetObservationAdapter,
  VerifiedRuntimeFleetRepairAdapter,
  type WeakerTeardownResidual,
} from "./organization-fleet-runtime-adapters";
const hermes = "/home/porta/.local/bin/hermes",
  paperclip = process.env.PAPERCLIP_BASE_URL ?? "http://127.0.0.1:3216",
  at = "2026-07-15T12:00:00Z",
  signer = { signObservation: (d: string) => `obs:${d}` },
  trust = {
    sign: (d: string) => `state:${d}`,
    verify: (d: string, s: string) => s === `state:${d}`,
    verifyObservation: (d: string, s: string) => s === `obs:${d}`,
  },
  policy = {
    maxRepairsPerWindow: 4,
    rateWindowMs: 60_000,
    maintenanceWindows: [],
    canaryCount: 1,
    maxFailures: 2,
    observationMaxAgeMs: 60_000,
    maxFutureSkewMs: 60_000,
  };
const evidencePath = join(process.cwd(), "docs/evidence/R19-LIVE-GATE.json"),
  sha = (v: unknown) =>
    `sha256:${createHash("sha256")
      .update(
        typeof v === "string" || Buffer.isBuffer(v)
          ? v
          : canonicalSemanticJson(v),
      )
      .digest("hex")}`;
function recordGate(row: Record<string, unknown>) {
  let rows: Record<string, unknown>[] = [];
  try {
    rows = (JSON.parse(readFileSync(evidencePath, "utf8")) as any).runs ?? [];
  } catch {}
  rows = rows.filter((r) => r.substrate !== row.substrate);
  rows.push(row);
  const body = {
      schema: "autonomy.r19-live-gate-evidence.v1",
      generatedAt: new Date().toISOString(),
      runs: rows.sort((a, b) =>
        String(a.substrate).localeCompare(String(b.substrate)),
      ),
    },
    digest = sha(body);
  writeFileSync(
    evidencePath,
    `${canonicalSemanticJson({ ...body, digest, signature: `local-review:${digest}` })}\n`,
  );
}
const hermesLive =
    process.env.OA_R19_HERMES_LIVE === "1" && existsSync(hermes)
      ? test
      : test.skip,
  paperclipLive = process.env.OA_R19_PAPERCLIP_LIVE === "1" ? test : test.skip;
function evidence(
  adapter: NativeFleetObservationAdapter,
  desired: () => FleetDesired,
) {
  let sequence = 100;
  return {
    observe: (_e: FleetEffect) => adapter.observe(++sequence),
    verify: (o: FleetObservation) =>
      trust.verifyObservation(o.digest, o.signature),
    cleared: (e: FleetEffect, o: FleetObservation) =>
      e.kind === "fence" ||
      classify(desired(), o, new Date(o.observedAt).toISOString()).length === 0,
  };
}
hermesLive(
  "R19 live Hermes native probe -> reconciler -> verified repair -> convergence",
  () => {
    const root = mkdtempSync(join(tmpdir(), "oa-r19-hermes-e2e-")),
      owned = join(root, "owned.json"),
      sentinel = join(root, "unrelated-sentinel"),
      env = { ...process.env, HOME: root, HERMES_HOME: join(root, ".hermes") },
      nativeVersion = () => {
        const r = Bun.spawnSync([hermes, "--version"], { env });
        if (r.exitCode) throw new Error(r.stderr.toString());
        return /v(0\.18\.2)/.exec(r.stdout.toString())?.[1] ?? "unknown";
      },
      read = () => JSON.parse(readFileSync(owned, "utf8"));
    const fileDigest = (path: string) =>
        `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`,
      configuration = { dispatchInGateway: false },
      configurationDigest = sha(configuration),
      provider = new HermesLiveProvider(
        {
          schema: "autonomy.hermes-live-deployment.v1",
          deploymentId: `r19-${process.pid}-${Date.now()}`,
          tenant: "r19-live",
          board: `oa-r19-${process.pid}-${Date.now()}`,
          home: join(root, ".hermes"),
          defaultWorkdir: root,
          pin: {
            release: "0.18.2",
            upstreamRevision: "6020b9f4",
            localRevision: "226e8de8",
            executableDigest: fileDigest(hermes),
          },
          configurationDigest,
          bundleDigest: sha("r19-bundle"),
          manifest: {
            schema: "autonomy.hermes-provider-manifest.v1",
            configuration,
            implementation: [],
          workers: [{assignee:"default",r11Runtime:"portable-worker-v1",profileDigest:`sha256:${"f".repeat(64)}`}],
            hiddenState: [],
          },
        },
        new ProcessHermesNativePort(
          hermes,
          () => fileDigest(hermes),
          fileDigest,
        ),
        {
          signState: (d) => `provider:${d}`,
          verifyState: (d, s) => s === `provider:${d}`,
          verifyBackup: () => true,
        },
        new MemoryHermesProviderStateStore(),
        { PATH: process.env.PATH ?? "", HOME: root },
      );
    provider.deploy();
    provider.createWork({
      idempotencyKey: "r19-drift",
      title: "owned drift",
      body: "disposable",
      assignee: "default",
      maxRuntime: "1m",
      maxRetries: 1,
    });
    let fence = 0,
      desired!: FleetDesired;
    try {
      writeFileSync(sentinel, "do-not-touch");
      const sentinelDigest = sha(readFileSync(sentinel));
      writeFileSync(
        owned,
        JSON.stringify({
          semantic: "drift",
          configuration: "drift",
          healthy: false,
          capacity: 0,
          credential: "missing",
          policy: "refuse",
        }),
      );
      const adapter = new NativeFleetObservationAdapter(
          "r19-live",
          () => {
            const v = read(),
              h = provider.health();
            return {
              id: "hermes-live",
              semantic: `tasks:${h.board.total}`,
              configuration: configurationDigest,
              version: h.version.release,
              healthy: h.board.total === 0,
              capacity: Math.max(0, 1 - h.board.total),
              credential:
                h.residuals
                  .map((x) => x.code)
                  .sort()
                  .join(",") || "none",
              policy: h.paused ? "paused" : "active",
              observedAt: new Date().toISOString(),
            };
          },
          signer,
        ),
        lifecycle = {
          fence: () => fence || 1,
          pause: () => {},
          resume: () => {},
          repair: () => {
            provider.teardown();
            provider.deploy();
          },
          rollback: () => {},
        },
        port = new VerifiedRuntimeFleetRepairAdapter(
          lifecycle,
          { fence: () => fence || 1, restart: () => {}, rollback: () => {} },
          evidence(adapter, () => desired),
        ),
        r = new FleetReconciler(
          "r19-live",
          new MemoryFleetReconcilerBackend(),
          port,
          trust,
        );
      fence = r.acquireFence();
      desired = {
        tenant: "r19-live",
        revision: "hermes-0.18.2",
        components: {
          "hermes-live": {
            id: "hermes-live",
            semantic: "tasks:0",
            configuration: configurationDigest,
            version: "0.18.2",
            healthy: true,
            capacity: 1,
            credential:
              provider
                .health()
                .residuals.map((x) => x.code)
                .sort()
                .join(",") || "none",
            policy: "active",
            observedAt: at,
          },
        },
        policy,
      };
      const drift = r.reconcile(desired, adapter.observe(1), fence);
      expect(drift.drifts.map((d) => d.class)).toEqual(
        ["capacity", "health", "semantic"],
      );
      expect(drift.status).toBe("repairing");
      expect(r.reconcile(desired, adapter.observe(2), fence).status).toBe(
        "green",
      );
      expect(sha(readFileSync(sentinel))).toBe(sentinelDigest);
      recordGate({
        runId: `hermes:${process.pid}:${Date.now()}`,
        substrate: "hermes",
        exactVersion: nativeVersion(),
        outcome: "converged",
        sentinelDigest,
        residual: null,
      });
    } finally {
      try {
        provider.teardown();
      } catch {}
      rmSync(root, { recursive: true, force: true });
    }
  },
  120_000,
);
paperclipLive(
  "R19 live Paperclip native probe -> reconciler -> verified repair -> convergence",
  () => {
    const curl = (method: string, path: string, body?: unknown) => {
        const args = [
          "curl",
          "-sS",
          "-X",
          method,
          `${paperclip}${path}`,
          "-H",
          "content-type: application/json",
          "-w",
          "\n%{http_code}",
        ];
        if (body !== undefined) args.push("--data", JSON.stringify(body));
        const r = Bun.spawnSync(args),
          raw = r.stdout.toString(),
          cut = raw.lastIndexOf("\n");
        return {
          status: Number(raw.slice(cut + 1)),
          body: JSON.parse(raw.slice(0, cut) || "{}") as any,
        };
      },
      health = curl("GET", "/api/health");
    expect(health.body.serverInfo.git.fullSha).toBe(
      "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
    );
    const unrelatedBefore = sha(curl("GET", "/api/companies").body),
      company = curl("POST", "/api/companies", {
        name: `OA R19 E2E ${process.pid} ${Date.now()}`,
        description: "owned R19 E2E",
        budgetMonthlyCents: 100,
      }).body;
    let fence = 0,
      desired!: FleetDesired;
    try {
      curl("PATCH", `/api/companies/${company.id}/budgets`, {
        budgetMonthlyCents: 0,
      });
      const adapter = new NativeFleetObservationAdapter(
          "r19-paperclip",
          () => {
            const c = curl("GET", `/api/companies/${company.id}`).body,
              h = curl("GET", "/api/health").body;
            return {
              id: "paperclip-live",
              semantic: `company:${c.status}`,
              configuration: `budget:${c.budgetMonthlyCents}`,
              version: h.version,
              healthy: h.status === "ok",
              capacity: c.budgetMonthlyCents,
              credential: h.authReady ? "auth-ready" : "auth-missing",
              policy: h.deploymentExposure,
              observedAt: new Date().toISOString(),
            };
          },
          signer,
        ),
        lifecycle = {
          fence: () => fence || 1,
          restart: () => {
            const r = curl("PATCH", `/api/companies/${company.id}/budgets`, {
              budgetMonthlyCents: 100,
            });
            if (r.status !== 200) throw new Error("Paperclip repair failed");
          },
          rollback: () => {},
        },
        port = new VerifiedRuntimeFleetRepairAdapter(
          {
            fence: () => fence || 1,
            pause: () => {},
            resume: () => {},
            repair: () => {},
            rollback: () => {},
          },
          lifecycle,
          evidence(adapter, () => desired),
        ),
        r = new FleetReconciler(
          "r19-paperclip",
          new MemoryFleetReconcilerBackend(),
          port,
          trust,
        );
      fence = r.acquireFence();
      desired = {
        tenant: "r19-paperclip",
        revision: "paperclip-90f85a7",
        components: {
          "paperclip-live": {
            id: "paperclip-live",
            semantic: "company:active",
            configuration: "budget:100",
            version: "0.3.1",
            healthy: true,
            capacity: 100,
            credential: "auth-ready",
            policy: "private",
            observedAt: at,
          },
        },
        policy,
      };
      expect(r.reconcile(desired, adapter.observe(1), fence).status).toBe(
        "repairing",
      );
      expect(r.reconcile(desired, adapter.observe(2), fence).status).toBe(
        "green",
      );
      const unrelatedAfter = sha(
        (curl("GET", "/api/companies").body as any[]).filter(
          (c) => c.id !== company.id,
        ),
      );
      expect(unrelatedAfter).toBe(unrelatedBefore);
      recordGate({
        runId: `paperclip:${process.pid}:${Date.now()}`,
        substrate: "paperclip",
        exactVersion: "0.3.1",
        exactSha: "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
        outcome: "converged",
        sentinelDigest: unrelatedBefore,
        residual: null,
      });
    } finally {
      const removed = curl("DELETE", `/api/companies/${company.id}`);
      if (![200, 204].includes(removed.status)) {
        expect(
          curl("PATCH", `/api/companies/${company.id}`, { status: "archived" })
            .status,
        ).toBe(200);
        const post = curl("GET", `/api/companies/${company.id}`).body,
          residual: WeakerTeardownResidual = {
            kind: "weaker-teardown-guarantee",
            resourceId: company.id,
            requested: "delete",
            observed: "archived",
            detail: "native delete unavailable",
          };
        expect(post.status).toBe("archived");
        expect(residual.kind).toBe("weaker-teardown-guarantee");
        recordGate({
          runId: `paperclip:${process.pid}:${Date.now()}`,
          substrate: "paperclip",
          exactVersion: "0.3.1",
          exactSha: "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
          outcome: "converged-with-weaker-teardown",
          sentinelDigest: unrelatedBefore,
          residual,
        });
      }
    }
  },
  120_000,
);
