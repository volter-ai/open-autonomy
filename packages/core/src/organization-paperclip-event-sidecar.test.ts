import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DiskPaperclipSidecarStore,
  MemoryPaperclipSidecarStore,
  PaperclipEventSidecarService,
  PaperclipPollingEventSidecar,
  type PaperclipNativePollPort,
  type PaperclipSidecarStore,
} from "./organization-paperclip-event-sidecar";
import {
  MemoryPaperclipEventStore,
  PaperclipEventIngestor,
  paperclipEventManifestDigest,
  type PaperclipEventManifest,
} from "./organization-paperclip-events";

const eventTrust = {
  sign: (d: string) => `event:${d}`,
  verify: (d: string, s: string) => s === `event:${d}`,
  authenticateManifest: () => true,
  verifySnapshot: () => true,
};
const sidecarTrust = {
  sign: (d: string) => `sidecar:${d}`,
  verify: (d: string, s: string) => s === `sidecar:${d}`,
};
function manifest(): PaperclipEventManifest {
  const body: Omit<PaperclipEventManifest, "manifestDigest"> = {
    schema: "autonomy.paperclip-events.v1",
    deploymentId: "sidecar-test",
    companyId: "company",
    baseEndpoint: "http://127.0.0.1:3216/",
    authBinding: "secret://sidecar/consumer",
    eventSchema: "paperclip.sidecar-events.v1",
    adapter: {
      id: "paperclip-polling-sidecar",
      implementationDigest: `sha256:${"c".repeat(64)}`,
      endpoint: "http://127.0.0.1:4317/",
    },
    health: {
      gitSha: "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
      version: "0.3.1",
      baseEndpoint: "http://127.0.0.1:3216/",
    },
  };
  return { ...body, manifestDigest: paperclipEventManifestDigest(body) };
}
class Native implements PaperclipNativePollPort {
  requests: string[] = [];
  activities: Record<string, unknown>[] = [
    {
      id: "activity-1",
      createdAt: "2026-07-15T00:00:01Z",
      type: "heartbeat",
      actorId: "agent",
      entityType: "issue",
      entityId: "work",
      action: "heartbeat.started",
      details: { runId: "run" },
    },
  ];
  issues: Record<string, unknown>[] = [
    {
      id: "work",
      status: "todo",
      assigneeAgentId: "agent",
      createdAt: "2026-07-15T00:00:02Z",
      updatedAt: "2026-07-15T00:00:02Z",
    },
  ];
  approvals: Record<string, unknown>[] = [
    {
      id: "approval",
      status: "pending",
      issueIds: ["work"],
      createdAt: "2026-07-15T00:00:03Z",
      updatedAt: "2026-07-15T00:00:03Z",
    },
  ];
  run: Record<string, unknown> = {
    id: "run",
    status: "running",
    issueId: "work",
    agentId: "agent",
    createdAt: "2026-07-15T00:00:04Z",
    updatedAt: "2026-07-15T00:00:04Z",
    costCents: null,
  };
  request(input: { path: string; authBinding: string }) {
    if (input.authBinding !== "secret://paperclip/native")
      return { status: 403, body: {} };
    this.requests.push(input.path);
    if (input.path.includes("/activity?limit=500"))
      return { status: 200, body: structuredClone(this.activities) };
    if (input.path.includes("/issues?limit=500&offset=")) {
      const offset = Number(new URL(input.path, "http://local").searchParams.get("offset"));
      return {
        status: 200,
        body: structuredClone(this.issues.slice(offset, offset + 500)),
      };
    }
    if (input.path.endsWith("/approvals"))
      return { status: 200, body: structuredClone(this.approvals) };
    if (input.path.endsWith("/heartbeat-runs?limit=1000"))
      return { status: 200, body: [structuredClone(this.run)] };
    return { status: 404, body: {} };
  }
}
function fixture(
  native = new Native(),
  store: PaperclipSidecarStore = new MemoryPaperclipSidecarStore(),
) {
  const m = manifest();
  const sidecar = new PaperclipPollingEventSidecar(
    m,
    native,
    "secret://paperclip/native",
    store,
    sidecarTrust,
  );
  return { m, native, store, sidecar };
}

describe("R16 real Paperclip polling event sidecar", () => {
  test("polls only actual native array/object routes and integrates with the attested ingestor", () => {
    const f = fixture();
    const ingestor = new PaperclipEventIngestor(
      f.m,
      eventTrust,
      new MemoryPaperclipEventStore(),
      f.sidecar,
    );
    ingestor.initialize();
    const state = ingestor.sync();
    expect(f.native.requests).toEqual([
      "/api/companies/company/activity?limit=500",
      "/api/companies/company/issues?limit=500&offset=0",
      "/api/companies/company/approvals",
      "/api/companies/company/heartbeat-runs?limit=1000",
    ]);
    expect(state.works.work).toMatchObject({
      status: "todo",
      assigneeId: "agent",
    });
    expect(state.approvals.approval.state).toBe("pending");
    expect(state.heartbeats.run).toMatchObject({
      state: "running",
      costEvidence: "missing",
    });
    expect(state.activities).toHaveLength(1);
  });

  test("overlap polling is durable, deduplicated, ordered, and restart-safe", () => {
    const f = fixture();
    const first = f.sidecar.poll();
    const again = f.sidecar.poll();
    expect(again.asOfSequence).toBe(first.asOfSequence);
    f.native.issues[0] = {
      ...f.native.issues[0],
      status: "done",
      updatedAt: "2026-07-15T00:00:05Z",
    };
    const restarted = fixture(f.native, f.store).sidecar;
    const changed = restarted.poll();
    expect(changed.asOfSequence).toBe(first.asOfSequence + 1);
    expect(changed.works[0]!.status).toBe("done");
    f.native.issues = [];
    const deleted = restarted.poll();
    expect(deleted.works).toHaveLength(0);
  });

  test("paginates the complete issue set and never tombstones from a partial poll", () => {
    const native = new Native();
    native.issues = Array.from({ length: 501 }, (_, index) => ({
      id: `work-${index}`,
      status: "todo",
      createdAt: "2026-07-15T00:00:02Z",
      updatedAt: "2026-07-15T00:00:02Z",
    }));
    const f = fixture(native), first = f.sidecar.poll();
    expect(first.works).toHaveLength(501);
    expect(native.requests).toContain(
      "/api/companies/company/issues?limit=500&offset=500",
    );
    const original = native.request.bind(native);
    native.request = (input) =>
      input.path.includes("offset=500")
        ? { status: 503, body: {} }
        : original(input);
    const partial = f.sidecar.poll();
    expect(partial.works).toHaveLength(501);
    const response = f.sidecar.request({
      method: "GET",
      path: `/open-autonomy/paperclip-events/v1/companies/company/events?after=${first.asOfSequence}&limit=500`,
      authBinding: f.m.authBinding,
      requestId: "partial-issues",
    });
    expect((response.body as any).events).toContainEqual(
      expect.objectContaining({
        type: "sidecar.history-truncated",
        payload: expect.objectContaining({ source: "issues" }),
      }),
    );
  });

  test("does not infer terminal approval or heartbeat events from nonterminal updates", () => {
    const f = fixture();
    const initial = f.sidecar.poll().asOfSequence;
    f.native.approvals[0] = {
      ...f.native.approvals[0],
      updatedAt: "2026-07-15T00:00:05Z",
      note: "still waiting",
    };
    f.native.run = {
      ...f.native.run,
      updatedAt: "2026-07-15T00:00:06Z",
      progress: 1,
    };
    f.sidecar.poll();
    const page = f.sidecar.request({
      method: "GET",
      path: `/open-autonomy/paperclip-events/v1/companies/company/events?after=${initial}&limit=20`,
      authBinding: f.m.authBinding,
      requestId: "nonterminal",
    }).body as any;
    expect(page.events.map((event: any) => event.type)).toEqual([
      "approval.observed",
      "heartbeat.observed",
    ]);
    f.native.approvals[0] = {
      ...f.native.approvals[0],
      status: "approved",
      updatedAt: "2026-07-15T00:00:07Z",
    };
    f.native.run = {
      ...f.native.run,
      status: "succeeded",
      updatedAt: "2026-07-15T00:00:08Z",
    };
    const terminal = f.sidecar.poll();
    expect(terminal.approvals[0]!.state).toBe("approved");
    expect(terminal.heartbeats[0]!.state).toBe("succeeded");
  });

  test("detects the exact 500-row native ambiguity as typed history truncation", () => {
    const native = new Native();
    native.activities = Array.from({ length: 500 }, (_, index) => ({
      id: `a-${index}`,
      createdAt: new Date(1_700_000_000_000 + index).toISOString(),
      type: "commented",
      action: "commented",
      actorId: "agent",
      entityType: "issue",
      entityId: "work",
    }));
    const f = fixture(native);
    f.sidecar.poll();
    const response = f.sidecar.request({
      method: "GET",
      path: "/open-autonomy/paperclip-events/v1/companies/company/events?after=500&limit=500",
      authBinding: f.m.authBinding,
      requestId: "second-page",
    });
    expect(response.status).toBe(200);
    expect((response.body as any).events).toContainEqual(
      expect.objectContaining({ type: "sidecar.history-truncated" }),
    );
  });

  test("rejects native identity equivocation and preserves the last durable state", () => {
    const f = fixture();
    const before = f.sidecar.poll();
    f.native.activities[0] = { ...f.native.activities[0], type: "rewritten" };
    expect(() => f.sidecar.poll()).toThrow(/identity equivocation/);
    expect(f.sidecar.snapshot()).toEqual(before);
  });
  test("survives disk reconstruction, dead-owner lock recovery, and owned listener restart", () => {
    const root = mkdtempSync(join(tmpdir(), "paperclip-sidecar-")),
      native = new Native(),
      firstStore = new DiskPaperclipSidecarStore(root),
      first = fixture(native, firstStore).sidecar;
    const before = first.poll();
    const lock = join(root, "sidecar-test.json.lock");
    writeFileSync(
      lock,
      JSON.stringify({ pid: 999999, start: "dead", token: "dead" }),
    );
    utimesSync(lock, new Date(0), new Date(0));
    const second = fixture(native, new DiskPaperclipSidecarStore(root)).sidecar;
    expect(second.poll()).toEqual(before);
    let handler: any,
      up = false;
    const listener = {
      listen(_endpoint: string, value: any) {
        handler = value;
        up = true;
      },
      close() {
        up = false;
      },
      healthy() {
        return up;
      },
    };
    const service = new PaperclipEventSidecarService(
      manifest().adapter.endpoint,
      second,
      listener,
    );
    service.start();
    expect(service.health()).toBe(true);
    expect(
      handler({
        method: "GET",
        path: "/open-autonomy/paperclip-events/v1/health",
        authBinding: manifest().authBinding,
        requestId: "health",
      }).status,
    ).toBe(200);
    service.stop();
    expect(service.health()).toBe(false);
  });
});

const realUrl = process.env.PAPERCLIP_REAL_URL;
const realCompany = process.env.PAPERCLIP_REAL_COMPANY_ID;
const realToken = process.env.PAPERCLIP_REAL_TOKEN;
test.skipIf(!(realUrl && realCompany && realToken))(
  "opt-in: converts pinned real Paperclip activity/issues/approvals responses",
  () => {
    const get = (path: string) => {
      const result = spawnSync(
        "curl",
        [
          "-fsS",
          "-H",
          `Authorization: Bearer ${realToken}`,
          `${realUrl!.replace(/\/$/, "")}${path}`,
        ],
        { encoding: "utf8" },
      );
      if (result.status !== 0) throw new Error(result.stderr);
      return { status: 200, body: JSON.parse(result.stdout) };
    };
    const activity = get(
      `/api/companies/${encodeURIComponent(realCompany!)}/activity?limit=500`,
    );
    const issues = get(
      `/api/companies/${encodeURIComponent(realCompany!)}/issues`,
    );
    const approvals = get(
      `/api/companies/${encodeURIComponent(realCompany!)}/approvals`,
    );
    const health = get("/api/health").body as {
      version?: string;
      serverInfo?: { git?: { fullSha?: string } };
    };
    expect(health.version).toBe("0.3.1");
    expect(health.serverInfo?.git?.fullSha).toBe(
      "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
    );
    expect(Array.isArray(activity.body)).toBe(true);
    expect(Array.isArray(issues.body)).toBe(true);
    expect(Array.isArray(approvals.body)).toBe(true);
    const base = new URL(realUrl!);
    const original = manifest();
    const body: Omit<PaperclipEventManifest, "manifestDigest"> = {
      ...original,
      deploymentId: `real-sidecar-${Date.now()}`,
      companyId: realCompany!,
      baseEndpoint: base.href,
      health: {
        gitSha: health.serverInfo!.git!.fullSha!,
        version: health.version!,
        baseEndpoint: base.href,
      },
    };
    const realManifest = {
      ...body,
      manifestDigest: paperclipEventManifestDigest(body),
    };
    const converter = new PaperclipPollingEventSidecar(
      realManifest,
      { request: ({ path }) => get(path) },
      "secret://paperclip/real-native",
      new MemoryPaperclipSidecarStore(),
      sidecarTrust,
    );
    const converted = converter.poll();
    expect(converted.companyId).toBe(realCompany!);
    expect(converted.asOfSequence).toBeGreaterThanOrEqual(0);
  },
);
