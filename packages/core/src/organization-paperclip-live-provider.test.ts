import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DiskPaperclipProviderStateStore,
  MemoryPaperclipProviderStateStore,
  PaperclipLiveProvider,
  paperclipManifestDigest,
  type PaperclipHttpRequest,
  type PaperclipHttpResult,
  type PaperclipManifest,
  type PaperclipNativePort,
  type PaperclipProviderStateStore,
} from "./organization-paperclip-live-provider";

const companyId = "9e40147b-adec-4152-84d4-a8bc318b9b2e";
const agentId = "0e29a63a-ce28-41a6-a357-f3f3b9753867";
const issueId = "253896ae-1d9a-4275-808d-2f3b74ce6367";
const runId = "0dc7ddb3-4a1f-4312-a814-a70e037a7f68";

const trust = {
  signState: (digest: string) => `sig:${digest}`,
  verifyState: (digest: string, signature: string) =>
    signature === `sig:${digest}`,
};

function manifest(
  overrides: Partial<Omit<PaperclipManifest, "manifestDigest">> = {},
) {
  const body: Omit<PaperclipManifest, "manifestDigest"> = {
    schema: "autonomy.paperclip-live-provider.v1",
    deploymentId: "r16-test",
    baseUrl: "http://127.0.0.1:3216/",
    companyId,
    controlAuthBinding: "secret://paperclip/r16-board",
    workerAuthBinding: "secret://paperclip/r16-agent",
    source: {
      repository: "https://github.com/paperclipai/paperclip.git",
      releaseVersion: "0.3.1",
      commit: "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
      treeDigest: `sha256:${"1".repeat(64)}`,
      lockDigest: `sha256:${"2".repeat(64)}`,
    },
    controlProviderId: "paperclip-control",
    workerProviderId: "open-autonomy-r11-worker",
    interactionProviderId: "slack-interaction",
    eventSchema: "paperclip.activity.v1",
    assumptions: [
      {
        id: "paperclip-0.3.1-teardown-boundary",
        statement:
          "The deployment is disposable and its data directory is owned by the bundle.",
        consequence:
          "Pinned Paperclip 0.3.1 cannot hard-delete a budgeted company due to native foreign-key ordering; teardown destroys the isolated deployment.",
      },
    ],
    ...overrides,
  };
  return { ...body, manifestDigest: paperclipManifestDigest(body) };
}

class FakeNative implements PaperclipNativePort {
  readonly requests: PaperclipHttpRequest[] = [];
  sourceValid = true;
  endpointUrl = "http://127.0.0.1:3216/";
  issues: Record<string, Record<string, unknown>> = {};
  companies: Record<string, Record<string, unknown>> = {};
  approvals: Record<string, Record<string, unknown>> = {};
  responseOverride?: (
    request: PaperclipHttpRequest,
  ) => PaperclipHttpResult | undefined;

  verifySource() {
    return this.sourceValid;
  }
  endpoint() {
    return this.endpointUrl;
  }

  request(input: PaperclipHttpRequest): PaperclipHttpResult {
    this.requests.push(structuredClone(input));
    const overridden = this.responseOverride?.(input);
    if (overridden) return overridden;
    if (input.path === "/api/health")
      return result(200, {
        status: "ok",
        version: "0.3.1",
        serverInfo: {
          git: {
            fullSha: "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
          },
        },
      });
    if (input.method === "GET" && input.path.endsWith("/issues"))
      return result(200, Object.values(this.issues));
    if (input.method === "POST" && input.path.endsWith("/issues")) {
      const body = input.body as Record<string, unknown>;
      const issue = { id: issueId, companyId, ...body };
      this.issues[issueId] = issue;
      return result(201, issue);
    }
    if (input.method === "GET" && input.path === `/api/issues/${issueId}`) {
      const issue = this.issues[issueId];
      return issue ? result(200, issue) : result(404, { error: "missing" });
    }
    if (input.path === `/api/issues/${issueId}/checkout`) {
      const issue = {
        ...this.issues[issueId],
        id: issueId,
        status: "in_progress",
        assigneeAgentId: agentId,
        checkoutRunId: runId,
      };
      this.issues[issueId] = issue;
      return result(200, issue);
    }
    if (input.path === `/api/agents/${agentId}/wakeup`)
      return result(202, { id: runId, status: "queued" });
    if (input.path === `/api/agents/${agentId}/pause`)
      return result(200, { id: agentId, status: "paused" });
    if (input.path === `/api/agents/${agentId}/resume`)
      return result(200, { id: agentId, status: "active" });
    if (input.path.endsWith("/budgets") && input.method === "PATCH")
      return result(200, {
        id: companyId,
        budgetMonthlyCents: (input.body as Record<string, unknown>)
          .budgetMonthlyCents,
      });
    if (input.path.endsWith("/budgets/overview"))
      return result(200, { companyId, policies: [] });
    if (input.path === `/api/heartbeat-runs/${runId}`)
      return result(200, { id: runId, companyId, agentId, status: "failed" });
    if (input.method === "POST" && input.path.endsWith("/export"))
      return result(200, {
        rootPath: "r16-backup",
        manifest: { source: { companyId }, includes: input.body },
        files: { "paperclip.yaml": "schemaVersion: 5\n" },
      });
    if (input.method === "GET" && input.path === "/api/companies")
      return result(200, Object.values(this.companies));
    if (input.method === "POST" && input.path === "/api/companies/import") {
      const name = (
        (input.body as Record<string, unknown>).target as Record<
          string,
          unknown
        >
      ).newCompanyName as string;
      const company = { id: "restored-company", name };
      this.companies[company.id] = company;
      return result(200, { company, agents: [], warnings: [] });
    }
    if (input.path === "/api/approvals/approval-1/approve")
      return result(200, { id: "approval-1", status: "approved" });
    if (input.method === "GET" && input.path.endsWith("/approvals"))
      return result(200, Object.values(this.approvals));
    if (input.method === "POST" && input.path.endsWith("/approvals")) {
      const approval = {
        id: "approval-1",
        status: "pending",
        ...(input.body as Record<string, unknown>),
      };
      this.approvals[approval.id] = approval;
      return result(201, approval);
    }
    throw new Error(`unhandled fake route: ${input.method} ${input.path}`);
  }
}

function result(status: number, body: unknown): PaperclipHttpResult {
  return { status, body, headers: {} };
}

function provider(
  native = new FakeNative(),
  store: PaperclipProviderStateStore = new MemoryPaperclipProviderStateStore(),
  value = manifest(),
) {
  return {
    native,
    store,
    provider: new PaperclipLiveProvider(value, native, trust, store),
  };
}

describe("R16 live Paperclip provider", () => {
  test("requires exact source, tree, and lock pins before creating durable state", () => {
    const fixture = provider();
    fixture.native.sourceValid = false;
    expect(() => fixture.provider.deploy()).toThrow("source/tree/lock pin");
    fixture.native.sourceValid = true;
    const state = fixture.provider.deploy();
    expect(state.companyId).toBe(companyId);
    expect(fixture.provider.deploy()).toEqual(state);
    expect(
      fixture.native.requests.filter(
        (request) => request.path === "/api/health",
      ),
    ).toHaveLength(2);
  });

  test("binds the contacted endpoint and server revision/version to the manifest", () => {
    const wrongEndpoint = provider();
    wrongEndpoint.native.endpointUrl = "http://127.0.0.1:3217/";
    expect(() => wrongEndpoint.provider.deploy()).toThrow(
      "endpoint is not manifest-bound",
    );
    const wrongServer = provider();
    wrongServer.native.responseOverride = (request) =>
      request.path === "/api/health"
        ? result(200, {
            status: "ok",
            version: "0.3.1",
            serverInfo: { git: { fullSha: "0".repeat(40) } },
          })
        : undefined;
    expect(() => wrongServer.provider.deploy()).toThrow("health is not ready");
  });

  test("rejects provider coupling and untrusted cleartext remote endpoints", () => {
    const coupled = manifest({ workerProviderId: "paperclip-control" });
    expect(
      () =>
        new PaperclipLiveProvider(
          coupled,
          new FakeNative(),
          trust,
          new MemoryPaperclipProviderStateStore(),
        ),
    ).toThrow("coupled");
    const remote = manifest({ baseUrl: "http://example.com/" });
    expect(
      () =>
        new PaperclipLiveProvider(
          remote,
          new FakeNative(),
          trust,
          new MemoryPaperclipProviderStateStore(),
        ),
    ).toThrow("malformed");
  });

  test("creates hierarchical work idempotently and rejects effect equivocation", () => {
    const fixture = provider();
    fixture.provider.deploy();
    const input = {
      effectId: "create-child",
      title: "Child",
      description: "Concrete work",
      parentId: "11111111-1111-4111-8111-111111111111",
      priority: "high" as const,
    };
    const first = fixture.provider.createIssue(input);
    const second = fixture.provider.createIssue(input);
    expect(first).toEqual(second);
    expect(
      fixture.native.requests.filter(
        (request) =>
          request.method === "POST" && request.path.endsWith("/issues"),
      ),
    ).toHaveLength(1);
    expect(first.parentId).toBe(input.parentId);
    expect(() =>
      fixture.provider.createIssue({ ...input, title: "equivocation" }),
    ).toThrow("equivocation");
  });

  test("reconciles create after native success and before local acknowledgement", () => {
    const fixture = provider();
    fixture.provider.deploy();
    const marker = "[open-autonomy-effect:";
    fixture.native.issues[issueId] = {
      id: issueId,
      companyId,
      title: "Recovered",
      description: `survived crash\n\n${marker}effect:ignored]`,
    };
    // The exact marker is content-derived, so capture it from an interrupted
    // first request and install the already-created native row on retry.
    let observedBody: Record<string, unknown> | undefined;
    fixture.native.responseOverride = (request) => {
      if (request.method === "POST" && request.path.endsWith("/issues")) {
        observedBody = request.body as Record<string, unknown>;
        throw new Error("simulated process death after remote commit");
      }
      return undefined;
    };
    const input = {
      effectId: "crash",
      title: "Recovered",
      description: "survived crash",
      priority: "medium" as const,
    };
    expect(() => fixture.provider.createIssue(input)).toThrow("process death");
    fixture.native.responseOverride = undefined;
    fixture.native.issues[issueId] = {
      id: issueId,
      companyId,
      ...observedBody,
    };
    expect(fixture.provider.createIssue(input).id).toBe(issueId);
    expect(
      fixture.native.requests.filter(
        (request) =>
          request.method === "POST" && request.path.endsWith("/issues"),
      ),
    ).toHaveLength(1);
  });

  test("binds checkout to an existing Paperclip run and verifies observed ownership", () => {
    const fixture = provider();
    fixture.provider.deploy();
    fixture.native.issues[issueId] = {
      id: issueId,
      companyId,
      status: "backlog",
    };
    const checked = fixture.provider.checkout({
      effectId: "checkout",
      issueId,
      agentId,
      runId,
      expectedStatuses: ["backlog"],
    });
    expect(checked.checkoutRunId).toBe(runId);
    const request = fixture.native.requests.find((value) =>
      value.path.endsWith("/checkout"),
    );
    expect(request?.headers).toEqual({ "x-paperclip-run-id": runId });
    expect(request?.authBinding).toBe("secret://paperclip/r16-agent");
  });

  test("does not count HTTP success without the requested checkout mutation", () => {
    const fixture = provider();
    fixture.provider.deploy();
    fixture.native.issues[issueId] = {
      id: issueId,
      companyId,
      status: "backlog",
    };
    fixture.native.responseOverride = (request) =>
      request.path.endsWith("/checkout")
        ? result(200, {
            id: issueId,
            status: "backlog",
            assigneeAgentId: agentId,
            checkoutRunId: null,
          })
        : undefined;
    expect(() =>
      fixture.provider.checkout({
        effectId: "bad-checkout",
        issueId,
        agentId,
        runId,
        expectedStatuses: ["backlog"],
      }),
    ).toThrow("without ownership");
  });

  test("uses Paperclip heartbeat id, pause/resume post-state, and durable receipts", () => {
    const fixture = provider();
    fixture.provider.deploy();
    expect(
      fixture.provider.wakeAgent("wake", agentId, "assigned", issueId),
    ).toBe(runId);
    expect(fixture.provider.pauseAgent("pause", agentId)).toBe(agentId);
    expect(fixture.provider.resumeAgent("resume", agentId)).toBe(agentId);
    const receipts = Object.values(fixture.store.load("r16-test")!.effects);
    expect(receipts).toHaveLength(3);
    expect(receipts.map((receipt) => receipt.status)).toEqual([
      "acknowledged",
      "acknowledged",
      "acknowledged",
    ]);
    expect(
      fixture.native.requests.find((request) =>
        request.path.endsWith("/wakeup"),
      )?.body,
    ).toMatchObject({ payload: { issueId } });
  });

  test("lifts portable observations without adding native enums to Organization IR", () => {
    const fixture = provider();
    expect(
      fixture.provider.projectNativeEvent({
        type: "issue.updated",
        issueId,
        status: "blocked",
        revision: "42",
        assigneeAgentId: agentId,
      }),
    ).toEqual({
      kind: "work.observed",
      work: issueId,
      status: "blocked",
      assignee: agentId,
      nativeRevision: "42",
    });
    expect(
      fixture.provider.projectNativeEvent({
        type: "heartbeat.run",
        issueId,
        runId,
        agentId,
        status: "failed",
        costCents: 17,
      }),
    ).toEqual({
      kind: "attempt.observed",
      work: issueId,
      attempt: runId,
      actor: agentId,
      state: "failed",
      costCents: 17,
      costEvidence: "observed",
    });
    expect(
      fixture.provider.projectNativeEvent({ type: "future.native.event" }),
    ).toEqual({
      kind: "gap",
      nativeType: "future.native.event",
      reason: "unsupported Paperclip event",
    });
  });

  test("covers native budget, approval, heartbeat, and timeline semantics", () => {
    const fixture = provider();
    fixture.provider.deploy();
    expect(fixture.provider.setCompanyBudget("budget", 12_000)).toBe(12_000);
    expect(fixture.provider.budgetOverview()).toEqual({
      companyId,
      policies: [],
    });
    expect(fixture.provider.heartbeatRun(runId)).toMatchObject({
      id: runId,
      status: "failed",
    });
    expect(
      fixture.provider.createApproval({
        effectId: "create-approval",
        type: "request_board_approval",
        requestedByAgentId: agentId,
        payload: { summary: "Need a decision" },
        issueIds: [issueId],
      }),
    ).toBe("approval-1");
    expect(
      fixture.provider.createApproval({
        effectId: "create-approval",
        type: "request_board_approval",
        requestedByAgentId: agentId,
        payload: { summary: "Need a decision" },
        issueIds: [issueId],
      }),
    ).toBe("approval-1");
    expect(
      fixture.native.requests.filter(
        (request) =>
          request.method === "POST" && request.path.endsWith("/approvals"),
      ),
    ).toHaveLength(1);
    expect(
      fixture.provider.resolveApproval({
        effectId: "approve",
        approvalId: "approval-1",
        decision: "approve",
        decisionNote: "evidence accepted",
      }),
    ).toBe("approval-1");
    expect(
      fixture.provider.liftTimeline({
        spans: [
          {
            actorId: `agent:${agentId}`,
            runId,
            issueId,
            status: "failed",
            usage: { costCents: 9 },
          },
        ],
        events: [{ actorId: "user:board", kind: "created", issueId }],
        pagination: { limit: 5, offset: 0, totalIssues: 1, hasMore: false },
        window: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-15T00:00:00.000Z",
          capped: false,
        },
      }),
    ).toEqual({
      observations: [
        {
          kind: "attempt.observed",
          work: issueId,
          attempt: runId,
          actor: agentId,
          state: "failed",
          costCents: 9,
          costEvidence: "observed",
        },
        {
          kind: "gap",
          nativeType: "timeline.created",
          reason: "timeline event lacks a total portable work-state projection",
        },
      ],
      nextOffset: null,
      nativeWindow: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-15T00:00:00.000Z",
        capped: false,
      },
    });
    expect(
      fixture.provider.liftTimeline({
        spans: [
          { actorId: `agent:${agentId}`, runId, issueId, status: "failed" },
        ],
        events: [],
        pagination: { limit: 1, offset: 0, totalIssues: 1, hasMore: false },
        window: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-15T00:00:00.000Z",
          capped: false,
        },
      }).observations[0],
    ).toMatchObject({ costCents: null, costEvidence: "missing" });
  });

  test("rejects inconsistent timeline pagination and cross-tenant economic state", () => {
    const fixture = provider();
    fixture.provider.deploy();
    expect(() =>
      fixture.provider.liftTimeline({
        spans: [],
        events: [],
        pagination: { limit: 5, offset: 0, totalIssues: 6, hasMore: false },
        window: {
          from: "2026-07-01T00:00:00Z",
          to: "2026-07-02T00:00:00Z",
          capped: false,
        },
      }),
    ).toThrow("pagination is inconsistent");
    fixture.native.responseOverride = (request) =>
      request.path.endsWith("/budgets/overview")
        ? result(200, { companyId: "other-tenant", policies: [] })
        : undefined;
    expect(() => fixture.provider.budgetOverview()).toThrow("cross-tenant");
  });

  test("exports a tenant-bound portable backup and restores it idempotently", () => {
    const fixture = provider();
    fixture.provider.deploy();
    const backup = fixture.provider.exportPortableBackup();
    expect(backup).toMatchObject({
      schema: "autonomy.paperclip-portable-backup.v1",
      sourceCompanyId: companyId,
      native: { rootPath: "r16-backup" },
    });
    const restored = fixture.provider.restorePortableBackup("restore", backup);
    expect(restored).toBe("restored-company");
    expect(fixture.provider.restorePortableBackup("restore", backup)).toBe(
      restored,
    );
    expect(
      fixture.native.requests.filter(
        (request) => request.path === "/api/companies/import",
      ),
    ).toHaveLength(1);
    expect(() =>
      fixture.provider.restorePortableBackup("tampered", {
        ...backup,
        sourceCompanyId: "other-tenant",
      }),
    ).toThrow("invalid or misbound");
  });

  test("rejects unsafe export paths and source-company substitution", () => {
    const fixture = provider();
    fixture.provider.deploy();
    fixture.native.responseOverride = (request) =>
      request.path.endsWith("/export")
        ? result(200, {
            rootPath: "bad",
            manifest: { source: { companyId: "other-tenant" } },
            files: { "../escape": "secret" },
          })
        : undefined;
    expect(() => fixture.provider.exportPortableBackup()).toThrow(
      "incomplete or misbound",
    );
  });

  test("rejects signed-state tampering before every operation", () => {
    const inner = new MemoryPaperclipProviderStateStore();
    const fixture = provider(new FakeNative(), inner);
    fixture.provider.deploy();
    const original = inner.load("r16-test")!;
    const malicious: PaperclipProviderStateStore = {
      load: () => ({ ...original, companyId: "other-tenant" }),
      compareAndSwap: (...args) => inner.compareAndSwap(...args),
    };
    const attacked = provider(fixture.native, malicious).provider;
    expect(() => attacked.health()).toThrow("invalid or misbound");
  });

  test("persists signed CAS state across independent disk-store reconstruction", () => {
    const root = mkdtempSync(join(tmpdir(), "oa-r16-provider-"));
    try {
      const firstStore = new DiskPaperclipProviderStateStore(root),
        fixture = provider(new FakeNative(), firstStore);
      fixture.provider.deploy();
      fixture.provider.wakeAgent("durable-wake", agentId, "work", issueId);
      const observed = firstStore.load("r16-test")!;
      const secondStore = new DiskPaperclipProviderStateStore(root),
        reconstructed = provider(fixture.native, secondStore).provider;
      expect(
        reconstructed.wakeAgent("durable-wake", agentId, "work", issueId),
      ).toBe(runId);
      expect(secondStore.load("r16-test")).toEqual(observed);
      const key = createHash("sha256").update("r16-test").digest("hex"),
        deadLock = join(root, `${key}.json.lock`);
      mkdirSync(deadLock);
      writeFileSync(join(deadLock, "owner"), "999999999\n");
      expect(
        firstStore.compareAndSwap("r16-test", observed.sequence - 1, observed),
      ).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports assumptions as explicit residuals and provider independence structurally", () => {
    const value = manifest({
      assumptions: [
        {
          id: "paperclip-recovery",
          statement: "scheduler enabled",
          consequence: "recovery latency follows scheduler cadence",
        },
      ],
    });
    const fixture = provider(
      new FakeNative(),
      new MemoryPaperclipProviderStateStore(),
      value,
    );
    fixture.provider.deploy();
    expect(fixture.provider.health()).toMatchObject({
      healthy: true,
      independentControl: true,
      separateWorker: true,
      separateInteraction: true,
      residuals: [{ kind: "assumption", id: "paperclip-recovery" }],
    });
  });
});

test("manifest digest is deterministic and content-sensitive", () => {
  const first = manifest();
  const second = manifest({ eventSchema: "paperclip.activity.v2" });
  expect(first.manifestDigest).not.toBe(second.manifestDigest);
  expect(
    createHash("sha256").update(first.manifestDigest).digest("hex"),
  ).toHaveLength(64);
});

const live =
  process.env.OPEN_AUTONOMY_PAPERCLIP_LIVE === "1" ? test : test.skip;

live(
  "exercises the pinned disposable Paperclip process through native HTTP",
  () => {
    const repo =
      process.env.PAPERCLIP_REPO ??
      "/mnt/c/users/porta/research/repos/paperclip";
    const baseUrl = process.env.PAPERCLIP_BASE_URL ?? "http://127.0.0.1:3216";
    const git = (args: string[]) => {
      const output = Bun.spawnSync(["git", "-C", repo, ...args]);
      if (output.exitCode !== 0) throw new Error(output.stderr.toString());
      return output.stdout;
    };
    const commit = git(["rev-parse", "HEAD"]).toString().trim();
    expect(commit).toBe("90f85a7d11c517b1d09db90dbec97f4de7d96b83");
    const treeDigest = `sha256:${createHash("sha256")
      .update(git(["ls-files", "-s", "-z"]))
      .digest("hex")}`;
    const lockBytes = Bun.file(`${repo}/pnpm-lock.yaml`).arrayBuffer();

    return lockBytes.then((bytes) => {
      class CurlNative implements PaperclipNativePort {
        bindings = new Map<string, string>([["board", ""]]);
        verifySource(source: PaperclipManifest["source"]) {
          return (
            source.commit === commit &&
            source.treeDigest === treeDigest &&
            source.lockDigest ===
              `sha256:${createHash("sha256").update(Buffer.from(bytes)).digest("hex")}` &&
            git(["status", "--porcelain"]).toString().trim() === ""
          );
        }
        endpoint() {
          return `${baseUrl}/`;
        }
        request(input: PaperclipHttpRequest): PaperclipHttpResult {
          const args = [
            "curl",
            "-sS",
            "--fail-with-body",
            "-X",
            input.method,
            `${baseUrl}${input.path}`,
            "-H",
            "content-type: application/json",
          ];
          const token = this.bindings.get(input.authBinding);
          if (token === undefined) throw new Error("unknown live auth binding");
          if (token) args.push("-H", `authorization: Bearer ${token}`);
          for (const [name, value] of Object.entries(input.headers ?? {}))
            args.push("-H", `${name}: ${value}`);
          if (input.body !== undefined)
            args.push("--data", JSON.stringify(input.body));
          args.push("-w", "\n%{http_code}");
          const output = Bun.spawnSync(args),
            raw = output.stdout.toString(),
            split = raw.lastIndexOf("\n");
          const status = Number(raw.slice(split + 1));
          let body: unknown;
          try {
            body = JSON.parse(raw.slice(0, split));
          } catch {
            body = raw.slice(0, split);
          }
          return { status: status || 599, body, headers: {} };
        }
      }
      const native = new CurlNative();
      const company = native.request({
        method: "POST",
        path: "/api/companies",
        authBinding: "board",
        requestId: "setup-company",
        body: {
          name: `OA R16 TCK ${Date.now()}`,
          description: "Disposable live conformance fixture",
          budgetMonthlyCents: 10_000,
        },
      });
      expect(company.status).toBe(201);
      const liveCompanyId = (company.body as Record<string, unknown>)
        .id as string;
      let restoredCompanyId: string | undefined;
      try {
        const agent = native.request({
          method: "POST",
          path: `/api/companies/${liveCompanyId}/agents`,
          authBinding: "board",
          requestId: "setup-agent",
          body: {
            name: "R16 TCK worker",
            role: "engineer",
            adapterType: "acpx_local",
            adapterConfig: {},
            budgetMonthlyCents: 5_000,
          },
        });
        expect(agent.status).toBe(201);
        const liveAgentId = (agent.body as Record<string, unknown>)
          .id as string;
        const key = native.request({
          method: "POST",
          path: `/api/agents/${liveAgentId}/keys`,
          authBinding: "board",
          requestId: "setup-key",
          body: { name: "R16 ephemeral" },
        });
        expect(key.status).toBe(201);
        native.bindings.set(
          "worker",
          (key.body as Record<string, unknown>).token as string,
        );
        const body: Omit<PaperclipManifest, "manifestDigest"> = {
          schema: "autonomy.paperclip-live-provider.v1",
          deploymentId: `r16-live-${liveCompanyId}`,
          baseUrl: `${baseUrl}/`,
          companyId: liveCompanyId,
          controlAuthBinding: "board",
          workerAuthBinding: "worker",
          source: {
            repository: "https://github.com/paperclipai/paperclip.git",
            releaseVersion: "0.3.1",
            commit,
            treeDigest,
            lockDigest: `sha256:${createHash("sha256").update(Buffer.from(bytes)).digest("hex")}`,
          },
          controlProviderId: "paperclip-control",
          workerProviderId: "open-autonomy-r11-worker",
          interactionProviderId: "slack-interaction",
          eventSchema: "paperclip.timeline.v1",
          assumptions: [
            {
              id: "paperclip-0.3.1-teardown-boundary",
              statement:
                "The deployment is disposable and its data directory is owned by the bundle.",
              consequence:
                "Pinned Paperclip 0.3.1 cannot hard-delete a budgeted company due to native foreign-key ordering; teardown destroys the isolated deployment.",
            },
          ],
        };
        const provider = new PaperclipLiveProvider(
          { ...body, manifestDigest: paperclipManifestDigest(body) },
          native,
          trust,
          new MemoryPaperclipProviderStateStore(),
        );
        provider.deploy();
        const issue = provider.createIssue({
          effectId: "live-issue",
          title: "R16 live checkout",
          description: "TCK",
          priority: "medium",
        });
        const liveIssueId = issue.id as string;
        const liveRunId = provider.wakeAgent(
          "live-wake",
          liveAgentId,
          "r16_tck",
          liveIssueId,
        )!;
        expect(
          provider.checkout({
            effectId: "live-checkout",
            issueId: liveIssueId,
            agentId: liveAgentId,
            runId: liveRunId,
            expectedStatuses: ["backlog"],
          }),
        ).toMatchObject({
          id: liveIssueId,
          checkoutRunId: liveRunId,
          status: "in_progress",
        });
        expect(provider.setCompanyBudget("live-budget", 12_345)).toBe(12_345);
        expect(provider.budgetOverview()).toMatchObject({
          companyId: liveCompanyId,
        });
        expect(provider.heartbeatRun(liveRunId)).toMatchObject({
          id: liveRunId,
          companyId: liveCompanyId,
        });
        const liveApprovalId = provider.createApproval({
          effectId: "live-approval",
          type: "request_board_approval",
          requestedByAgentId: liveAgentId,
          payload: { summary: "R16 live approval" },
          issueIds: [liveIssueId],
        })!;
        expect(
          provider.resolveApproval({
            effectId: "live-approval-resolve",
            approvalId: liveApprovalId,
            decision: "approve",
            decisionNote: "R16 TCK approved",
          }),
        ).toBe(liveApprovalId);
        const timeline = native.request({
          method: "GET",
          path: `/api/companies/${liveCompanyId}/timeline?limit=5`,
          authBinding: "board",
          requestId: "timeline",
        });
        expect(timeline.status).toBe(200);
        expect(
          provider.liftTimeline(timeline.body).observations.length,
        ).toBeGreaterThan(0);
        const backup = provider.exportPortableBackup();
        expect(backup.sourceCompanyId).toBe(liveCompanyId);
        restoredCompanyId = provider.restorePortableBackup(
          "live-restore",
          backup,
        )!;
        expect(restoredCompanyId).not.toBe(liveCompanyId);
      } finally {
        const routines = native.request({
          method: "GET",
          path: `/api/companies/${liveCompanyId}/routines`,
          authBinding: "board",
          requestId: "teardown:routines",
        });
        if (routines.status === 200 && Array.isArray(routines.body)) {
          for (const routine of routines.body) {
            if (
              typeof routine === "object" &&
              routine !== null &&
              typeof (routine as Record<string, unknown>).id === "string" &&
              (routine as Record<string, unknown>).assigneeAgentId !== null
            ) {
              native.request({
                method: "PATCH",
                path: `/api/routines/${(routine as Record<string, unknown>).id}`,
                authBinding: "board",
                requestId: "teardown:routine-unassign",
                body: {
                  assigneeAgentId: null,
                  baseRevisionId:
                    (routine as Record<string, unknown>).latestRevisionId ??
                    null,
                },
              });
            }
          }
        }
        expect(
          native.request({
            method: "POST",
            path: `/api/companies/${liveCompanyId}/archive`,
            authBinding: "board",
            requestId: "logical-teardown",
            body: {},
          }),
        ).toMatchObject({
          status: 200,
          body: { id: liveCompanyId, status: "archived" },
        });
        if (restoredCompanyId) {
          expect(
            native.request({
              method: "POST",
              path: `/api/companies/${restoredCompanyId}/archive`,
              authBinding: "board",
              requestId: "logical-teardown:restored",
              body: {},
            }),
          ).toMatchObject({
            status: 200,
            body: { id: restoredCompanyId, status: "archived" },
          });
        }
      }
    });
  },
  120_000,
);
