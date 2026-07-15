import { describe, expect, test } from "bun:test";
import {
  DiskPaperclipEventStore,
  MemoryPaperclipEventStore,
  PaperclipEventIngestor,
  paperclipEventManifestDigest,
  type PaperclipEventManifest,
  type PaperclipEventPort,
  type PaperclipEventResponse,
} from "./organization-paperclip-events";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const trust = {
  sign: (d: string) => `signed:${d}`,
  verify: (d: string, s: string) => s === `signed:${d}`,
  authenticateManifest: () => true,
  verifySnapshot: () => true,
};
function manifest(
  overrides: Partial<Omit<PaperclipEventManifest, "manifestDigest">> = {},
) {
  const body: Omit<PaperclipEventManifest, "manifestDigest"> = {
    schema: "autonomy.paperclip-events.v1",
    deploymentId: "paperclip-events",
    companyId: "company-1",
    baseEndpoint: "http://127.0.0.1:3216/",
    authBinding: "secret://paperclip/events",
    eventSchema: "paperclip.activity.v1",
    adapter: {
      id: "open-autonomy-paperclip-event-sidecar",
      implementationDigest: `sha256:${"a".repeat(64)}`,
      endpoint: "http://127.0.0.1:4317/",
    },
    health: {
      gitSha: "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
      version: "0.3.1",
      baseEndpoint: "http://127.0.0.1:3216/",
    },
    ...overrides,
  };
  return { ...body, manifestDigest: paperclipEventManifestDigest(body) };
}
const event = (
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
) => ({
  id: `event-${sequence}`,
  sequence,
  occurredAt: `2026-07-15T00:00:${String(sequence).padStart(2, "0")}Z`,
  type,
  payload,
});
const page = (
  after: string | null,
  next: string | null,
  highWaterSequence: number,
  events: ReturnType<typeof event>[],
) => ({
  schema: "paperclip.activity.v1",
  companyId: "company-1",
  after,
  next,
  highWaterSequence,
  events,
});

describe("R16 durable Paperclip event ingestion", () => {
  test("persists signed event checkpoints across process reconstruction and stale locks", () => {
    const root = mkdtempSync(join(tmpdir(), "paperclip-events-")),
      a = new PaperclipEventIngestor(
        manifest(),
        trust,
        new DiskPaperclipEventStore(root),
      );
    a.initialize();
    a.ingest(
      page(null, null, 1, [
        event(1, "work.created", { id: "w", status: "todo", revision: "1" }),
      ]),
    );
    const lock = join(root, "paperclip-events.json.lock");
    writeFileSync(
      lock,
      JSON.stringify({ pid: 999999, start: "dead", token: "dead" }),
    );
    utimesSync(lock, new Date(0), new Date(0));
    const b = new PaperclipEventIngestor(
      manifest(),
      trust,
      new DiskPaperclipEventStore(root),
    );
    expect(b.current().works.w.status).toBe("todo");
    b.reconcile({
      companyId: "company-1",
      asOfSequence: 1,
      works: [{ id: "w", status: "todo", assigneeId: null, revision: "1" }],
      approvals: [],
      heartbeats: [],
    });
  });
  test("authenticates checkpoint and binds exact health SHA, version and endpoint before fetching", () => {
    let health: any = {
      gitSha: manifest().health.gitSha,
      version: "0.3.1",
      baseEndpoint: "http://127.0.0.1:3216/",
      adapterId: manifest().adapter.id,
      implementationDigest: manifest().adapter.implementationDigest,
    };
    const requests: any[] = [];
    const port: PaperclipEventPort = {
      attestAdapter: () => true,
      request(r) {
        requests.push(r);
        return r.path.endsWith("/health")
          ? { status: 200, body: health }
          : { status: 200, body: page(null, null, 0, []) };
      },
    };
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
      port,
    );
    i.initialize();
    i.sync();
    expect(
      requests.every((r) => r.authBinding === "secret://paperclip/events"),
    ).toBe(true);
    health = { ...health, gitSha: "attacker" };
    expect(() => i.sync()).toThrow(/manifest-bound/);
    expect(i.current().generation).toBe(2);
    expect(
      requests.some((r) =>
        r.path.startsWith("/open-autonomy/paperclip-events/v1/"),
      ),
    ).toBe(true);
  });
  test("refuses a native-shaped or substituted event source without sidecar attestation", () => {
    const requests: unknown[] = [];
    const port: PaperclipEventPort = {
      attestAdapter: () => false,
      request(input) {
        requests.push(input);
        return { status: 200, body: [] };
      },
    };
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
      port,
    );
    i.initialize();
    expect(() => i.sync()).toThrow(/sidecar adapter attestation/);
    expect(requests).toHaveLength(0);
    expect(i.current()).toMatchObject({ generation: 1, scanCursor: null });
  });
  test("requires authenticated provenance and non-leaking endpoint/auth bindings", () => {
    expect(
      () =>
        new PaperclipEventIngestor(
          manifest(),
          { ...trust, authenticateManifest: () => false },
          new MemoryPaperclipEventStore(),
        ),
    ).toThrow(/manifest is not trusted/);
    expect(
      () =>
        new PaperclipEventIngestor(
          manifest({
            baseEndpoint: "http://example.test/",
            health: {
              ...manifest().health,
              baseEndpoint: "http://example.test/",
            },
          }),
          trust,
          new MemoryPaperclipEventStore(),
        ),
    ).toThrow(/loopback/);
    expect(
      () =>
        new PaperclipEventIngestor(
          manifest({ authBinding: "https://attacker.test/token" }),
          trust,
          new MemoryPaperclipEventStore(),
        ),
    ).toThrow(/credential reference/);
  });
  test("projects complete work, approval, heartbeat, activity and timeline data without imputing economics", () => {
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
    );
    i.initialize();
    const s = i.ingest(
      page(null, "c5", 5, [
        event(1, "work.created", {
          id: "w",
          status: "todo",
          assigneeId: null,
          revision: "w1",
        }),
        event(2, "approval.requested", {
          id: "a",
          state: "pending",
          workIds: ["w"],
          revision: "a1",
        }),
        event(3, "heartbeat.started", {
          id: "h",
          state: "running",
          workId: "w",
          agentId: "agent",
          revision: "h1",
        }),
        event(4, "activity.recorded", {
          id: "x",
          workId: "w",
          actorId: "agent",
          action: "commented",
          detail: { body: "hi" },
        }),
        event(5, "heartbeat.completed", {
          id: "h",
          state: "succeeded",
          workId: "w",
          agentId: "agent",
          revision: "h2",
          costCents: 37,
        }),
      ]),
    );
    expect(s.works.w.status).toBe("todo");
    expect(s.approvals.a.workIds).toEqual(["w"]);
    expect(s.heartbeats.h).toMatchObject({
      costCents: 37,
      costEvidence: "observed",
    });
    expect(s.activities).toHaveLength(1);
    expect(s.timeline).toHaveLength(5);
    const s2 = i.ingest(
      page("c5", null, 6, [
        event(6, "heartbeat.started", {
          id: "h2",
          state: "running",
          agentId: "agent",
          revision: "h3",
        }),
      ]),
    );
    expect(s2.heartbeats.h2).toMatchObject({
      costCents: null,
      costEvidence: "missing",
    });
  });
  test("restart, replay and duplicates are deterministic while conflicting duplicates are rejected", () => {
    const store = new MemoryPaperclipEventStore(),
      a = new PaperclipEventIngestor(manifest(), trust, store);
    a.initialize();
    const p = page(null, "one", 1, [
      event(1, "work.created", { id: "w", status: "todo", revision: "1" }),
    ]);
    a.ingest(p);
    const b = new PaperclipEventIngestor(manifest(), trust, store);
    expect(b.current().works.w.revision).toBe("1");
    const duplicate = b.ingest(page("one", "two", 1, p.events));
    expect(duplicate.timeline).toHaveLength(1);
    expect(() =>
      b.ingest(
        page("two", null, 1, [
          {
            ...p.events[0]!,
            payload: { id: "w", status: "done", revision: "evil" },
          },
        ]),
      ),
    ).toThrow(/conflicting/);
    expect(b.current()).toEqual(duplicate);
    expect(() =>
      b.ingest(
        page("two", null, 2, [{ ...event(2, "future", {}), id: "event-1" }]),
      ),
    ).toThrow(/duplicate event identity/);
  });
  test("delayed and lost events never materialize past a hole and gap closes on delayed delivery", () => {
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
    );
    i.initialize();
    let s = i.ingest(
      page(null, "late", 3, [
        event(1, "work.created", { id: "w", status: "todo", revision: "1" }),
        event(3, "work.updated", { id: "w", status: "done", revision: "3" }),
      ]),
    );
    expect(s.contiguousSequence).toBe(1);
    expect(s.works.w.status).toBe("todo");
    expect(s.gaps).toContainEqual(
      expect.objectContaining({ kind: "sequence-gap", atSequence: 2 }),
    );
    s = i.ingest(
      page("late", null, 3, [
        event(2, "activity.recorded", {
          id: "x",
          workId: "w",
          actorId: null,
          action: "worked",
          detail: {},
        }),
      ]),
    );
    expect(s.contiguousSequence).toBe(3);
    expect(s.works.w.status).toBe("done");
    expect(s.gaps.some((g) => g.kind === "sequence-gap")).toBe(false);
  });
  test("terminal holes are explicit truncation and cyclic cursors cannot trap restart", () => {
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
    );
    i.initialize();
    let s = i.ingest(page(null, "cursor-a", 2, [event(2, "future", {})]));
    expect(s.gaps.map((g) => g.kind)).toContain("sequence-gap");
    expect(() => i.ingest(page("cursor-a", "cursor-a", 2, []))).toThrow(
      /cursor cycle/,
    );
    s = i.ingest(page("cursor-a", null, 2, []));
    expect(s.gaps.map((g) => g.kind)).toContain("history-truncated");
  });
  test("partition and failed pages do not advance durable cursor", () => {
    let fail = true;
    const port: PaperclipEventPort = {
      attestAdapter: () => true,
      request(r): PaperclipEventResponse {
        if (r.path.endsWith("/health"))
          return {
            status: 200,
            body: {
              ...manifest().health,
              adapterId: manifest().adapter.id,
              implementationDigest: manifest().adapter.implementationDigest,
            },
          };
        if (fail) throw new Error("partition");
        return { status: 503, body: {} };
      },
    };
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
      port,
    );
    i.initialize();
    expect(() => i.sync()).toThrow();
    expect(i.current()).toMatchObject({ generation: 1, scanCursor: null });
    fail = false;
    expect(() => i.sync()).toThrow(/503/);
    expect(i.current()).toMatchObject({ generation: 1, scanCursor: null });
  });
  test("strict bounds, cursor continuity and high-water rollback resist attacks", () => {
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
    );
    i.initialize();
    expect(() => i.ingest(page("forged", null, 0, []))).toThrow(
      /cursor misbound/,
    );
    expect(() =>
      i.ingest(
        page(
          null,
          null,
          0,
          Array.from({ length: 501 }, (_, n) => event(n + 1, "x", {})),
        ),
      ),
    ).toThrow(/bounds/);
    i.ingest(page(null, "c", 2, [event(1, "x", {}), event(2, "x", {})]));
    expect(() => i.ingest(page("c", null, 1, []))).toThrow(/rollback/);
    expect(i.current().scanCursor).toBe("c");
  });
  test("unknown and malformed native semantics become typed gaps rather than invented facts", () => {
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
    );
    i.initialize();
    const s = i.ingest(
      page(null, null, 2, [
        event(1, "future.quantum", { costCents: 99 }),
        event(2, "heartbeat.completed", {
          id: "h",
          state: "done",
          agentId: "a",
          revision: "r",
          costCents: -5,
        }),
      ]),
    );
    expect(s.gaps.map((g) => g.kind)).toContain("unsupported-event");
    expect(s.gaps.map((g) => g.kind)).toContain("malformed-payload");
    expect(s.heartbeats.h).toBeUndefined();
  });
  test("terminal lifecycle events require observed native predecessors", () => {
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
    );
    i.initialize();
    const s = i.ingest(
      page(null, null, 2, [
        event(1, "approval.resolved", {
          id: "a",
          state: "approved",
          workIds: ["w"],
          revision: "1",
        }),
        event(2, "heartbeat.completed", {
          id: "h",
          state: "done",
          workId: "w",
          agentId: "agent",
          revision: "1",
          costCents: 9,
        }),
      ]),
    );
    expect(s.approvals.a).toBeUndefined();
    expect(s.heartbeats.h).toBeUndefined();
    expect(s.gaps.filter((g) => g.kind === "malformed-payload")).toHaveLength(
      2,
    );
  });
  test("heartbeat ownership and observed economics cannot disappear or equivocate", () => {
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
    );
    i.initialize();
    let s = i.ingest(
      page(null, "cost-1", 2, [
        event(1, "heartbeat.started", {
          id: "h",
          state: "running",
          workId: "w",
          agentId: "agent",
          revision: "1",
          costCents: 37,
        }),
        event(2, "heartbeat.completed", {
          id: "h",
          state: "done",
          workId: "w",
          agentId: "agent",
          revision: "2",
        }),
      ]),
    );
    expect(s.heartbeats.h).toMatchObject({
      costCents: 37,
      costEvidence: "observed",
    });
    s = i.ingest(
      page("cost-1", null, 4, [
        event(3, "heartbeat.completed", {
          id: "h",
          state: "done",
          workId: "w",
          agentId: "agent",
          revision: "3",
          costCents: 38,
        }),
        event(4, "heartbeat.completed", {
          id: "h",
          state: "done",
          workId: "other",
          agentId: "attacker",
          revision: "4",
          costCents: 37,
        }),
      ]),
    );
    expect(s.heartbeats.h).toMatchObject({
      workId: "w",
      agentId: "agent",
      costCents: 37,
    });
    expect(s.gaps.filter((g) => g.kind === "malformed-payload")).toHaveLength(
      2,
    );
  });
  test("snapshot reconciliation detects omissions and revision divergence without overwriting event truth", () => {
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
    );
    i.initialize();
    i.ingest(
      page(null, null, 2, [
        event(1, "work.created", { id: "w", status: "todo", revision: "w1" }),
        event(2, "approval.requested", {
          id: "a",
          state: "pending",
          workIds: ["w"],
          revision: "a1",
        }),
      ]),
    );
    const s = i.reconcile({
      companyId: "company-1",
      asOfSequence: 2,
      works: [{ id: "w", status: "done", revision: "w2" }],
      approvals: [],
      heartbeats: [],
    });
    expect(s.gaps.filter((g) => g.kind === "snapshot-divergence")).toHaveLength(
      2,
    );
    expect(s.works.w).toMatchObject({ status: "todo", revision: "w1" });
    expect(s.reconciliations).toHaveLength(1);
    expect(() =>
      i.reconcile({
        companyId: "other",
        asOfSequence: 2,
        works: [],
        approvals: [],
        heartbeats: [],
      }),
    ).toThrow(/cross-tenant/);
  });
  test("rejects unauthenticated reconciliation before changing durable state", () => {
    const store = new MemoryPaperclipEventStore();
    const i = new PaperclipEventIngestor(
      manifest(),
      { ...trust, verifySnapshot: () => false },
      store,
    );
    i.initialize();
    const before = i.current();
    expect(() =>
      i.reconcile({
        companyId: "company-1",
        asOfSequence: 0,
        works: [],
        approvals: [],
        heartbeats: [],
      }),
    ).toThrow(/provenance is untrusted/);
    expect(i.current()).toEqual(before);
  });
  test("reconciliation rejects historical, hole-ahead, and schema-smuggled snapshots", () => {
    const i = new PaperclipEventIngestor(
      manifest(),
      trust,
      new MemoryPaperclipEventStore(),
    );
    i.initialize();
    i.ingest(
      page(null, "hole", 3, [
        event(1, "work.created", { id: "w", status: "todo", revision: "1" }),
        event(3, "work.updated", { id: "w", status: "done", revision: "3" }),
      ]),
    );
    for (const asOfSequence of [0, 2, 3])
      expect(() =>
        i.reconcile({
          companyId: "company-1",
          asOfSequence,
          works: [],
          approvals: [],
          heartbeats: [],
        }),
      ).toThrow(/contiguous projection cut/);
    expect(() =>
      i.reconcile({
        companyId: "company-1",
        asOfSequence: 1,
        works: [
          { id: "w", status: "todo", revision: "1", smuggled: true } as never,
        ],
        approvals: [],
        heartbeats: [],
      }),
    ).toThrow(/unsupported members/);
  });
  test("tampered checkpoints and manifest/server rebinding are rejected on restart", () => {
    const inner = new MemoryPaperclipEventStore();
    const i = new PaperclipEventIngestor(manifest(), trust, inner);
    i.initialize();
    const malicious = {
      load(id: string) {
        const s = inner.load(id)!;
        return { ...s, scanCursor: "forged" };
      },
      compareAndSwap() {
        return false;
      },
    };
    expect(() =>
      new PaperclipEventIngestor(manifest(), trust, malicious).current(),
    ).toThrow(/authentication/);
    const changed = manifest({
      health: { ...manifest().health, version: "0.3.2" },
    });
    expect(() =>
      new PaperclipEventIngestor(changed, trust, inner).current(),
    ).toThrow(/misbound/);
  });
});
