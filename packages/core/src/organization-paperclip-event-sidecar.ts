import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";
import type {
  PaperclipEventManifest,
  PaperclipEventPage,
  PaperclipEventPort,
  PaperclipEventRequest,
  PaperclipEventResponse,
  PaperclipNativeEvent,
  PaperclipReconciliationSnapshot,
} from "./organization-paperclip-events";

export type PaperclipNativePollRequest = {
  method: "GET";
  path: string;
  authBinding: string;
};
export interface PaperclipNativePollPort {
  request(input: PaperclipNativePollRequest): { status: number; body: unknown };
}
export type PaperclipSidecarState = {
  version: number;
  companyId: string;
  adapterDigest: string;
  nativeDigests: Record<string, string>;
  entityDigests: Record<string, string>;
  events: PaperclipNativeEvent[];
  heartbeatIds: string[];
  truncationObserved: boolean;
  digest: string;
  signature: string;
};
export interface PaperclipSidecarStore {
  load(id: string): PaperclipSidecarState | undefined;
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: PaperclipSidecarState,
  ): boolean;
}
export interface PaperclipSidecarTrust {
  sign(digest: string): string;
  verify(digest: string, signature: string): boolean;
}
export class MemoryPaperclipSidecarStore implements PaperclipSidecarStore {
  private values = new Map<string, PaperclipSidecarState>();
  load(id: string) {
    const value = this.values.get(id);
    return value && structuredClone(value);
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: PaperclipSidecarState,
  ) {
    if (this.values.get(id)?.version !== expected) return false;
    this.values.set(id, structuredClone(next));
    return true;
  }
}
export class DiskPaperclipSidecarStore implements PaperclipSidecarStore {
  constructor(private root: string) {
    mkdirSync(root, { recursive: true });
  }
  private path(id: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("unsafe sidecar id");
    return resolve(this.root, `${id}.json`);
  }
  load(id: string) {
    const p = this.path(id);
    return existsSync(p)
      ? (JSON.parse(readFileSync(p, "utf8")) as PaperclipSidecarState)
      : undefined;
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: PaperclipSidecarState,
  ) {
    const p = this.path(id),
      l = `${p}.lock`,
      token = `${process.pid}:${Date.now()}:${Math.random()}`,
      owner = {
        pid: process.pid,
        start: sidecarProcessStart(process.pid),
        token,
      };
    for (let n = 0; n < 1000; n++) {
      try {
        const fd = openSync(l, "wx", 0o600);
        try {
          writeFileSync(fd, canonicalSemanticJson(owner));
          if (this.load(id)?.version !== expected) return false;
          const t = `${p}.${process.pid}.tmp`;
          writeFileSync(t, canonicalSemanticJson(next), { mode: 0o600 });
          const data = openSync(t, "r");
          try {
            fsyncSync(data);
          } finally {
            closeSync(data);
          }
          renameSync(t, p);
          const directory = openSync(this.root, "r");
          try {
            fsyncSync(directory);
          } finally {
            closeSync(directory);
          }
          return true;
        } finally {
          closeSync(fd);
          try {
            const observed = JSON.parse(readFileSync(l, "utf8"));
            if (observed.token === token) removeOwnedLock(l, token);
          } catch {}
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        try {
          const observed = JSON.parse(readFileSync(l, "utf8")) as {
            pid: number;
            start: string;
            token: string;
          };
          if (!sidecarProcessAlive(observed.pid, observed.start)) {
            removeOwnedLock(l, observed.token);
            continue;
          }
        } catch {}
        Bun.sleepSync(10);
      }
    }
    throw new Error("sidecar lock timeout");
  }
}
function removeOwnedLock(path: string, token: string) {
  try {
    const first = JSON.parse(readFileSync(path, "utf8")) as { token?: string };
    if (first.token !== token) return false;
    const quarantine = `${path}.reap.${process.pid}.${Math.random()}`;
    renameSync(path, quarantine);
    const moved = JSON.parse(readFileSync(quarantine, "utf8")) as {
      token?: string;
    };
    if (moved.token !== token) {
      if (!existsSync(path)) renameSync(quarantine, path);
      return false;
    }
    rmSync(quarantine, { force: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
}
function sidecarProcessStart(pid: number) {
  try {
    return (
      readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[21] ?? "unknown"
    );
  } catch {
    return "unknown";
  }
}
function sidecarProcessAlive(pid: number, start: string) {
  try {
    process.kill(pid, 0);
    return sidecarProcessStart(pid) === start;
  } catch {
    return false;
  }
}

export class PaperclipPollingEventSidecar implements PaperclipEventPort {
  constructor(
    private readonly manifest: PaperclipEventManifest,
    private readonly native: PaperclipNativePollPort,
    private readonly nativeAuthBinding: string,
    private readonly store: PaperclipSidecarStore,
    private readonly trust: PaperclipSidecarTrust,
  ) {
    if (!nativeAuthBinding || nativeAuthBinding === manifest.authBinding)
      throw new Error(
        "sidecar native and consumer credentials must be distinct",
      );
  }
  attestAdapter(binding: PaperclipEventManifest["adapter"]) {
    return stable(binding) === stable(this.manifest.adapter);
  }
  binding() {
    return structuredClone(this.manifest.adapter);
  }
  request(input: PaperclipEventRequest): PaperclipEventResponse {
    if (input.authBinding !== this.manifest.authBinding)
      return { status: 403, body: { error: "forbidden" } };
    if (input.path === "/open-autonomy/paperclip-events/v1/health")
      return {
        status: 200,
        body: {
          ...this.manifest.health,
          adapterId: this.manifest.adapter.id,
          implementationDigest: this.manifest.adapter.implementationDigest,
        },
      };
    const match = input.path.match(
      /^\/open-autonomy\/paperclip-events\/v1\/companies\/([^/]+)\/events\?after=([^&]*)&limit=(\d+)$/,
    );
    if (!match || decodeURIComponent(match[1]!) !== this.manifest.companyId)
      return { status: 404, body: { error: "not found" } };
    const after = match[2] ? decodeURIComponent(match[2]) : null;
    const limit = Number(match[3]);
    this.poll();
    return { status: 200, body: this.page(after, limit) };
  }
  poll() {
    const old = this.currentOrCreate();
    const activity = this.array(
      `/api/companies/${encodeURIComponent(this.manifest.companyId)}/activity?limit=500`,
    );
    const issuePoll = this.issuePages(),
      issues = issuePoll.rows;
    const approvals = this.array(
      `/api/companies/${encodeURIComponent(this.manifest.companyId)}/approvals`,
    );
    const heartbeatRuns = this.array(
      `/api/companies/${encodeURIComponent(this.manifest.companyId)}/heartbeat-runs?limit=1000`,
    );
    const state = structuredClone(old);
    const candidates: Array<{
      key: string;
      at: string;
      type: string;
      payload: Record<string, unknown>;
      digest: string;
    }> = [];
    for (const raw of activity) {
      const id = required(raw.id, "activity.id"),
        at = timestamp(raw.createdAt ?? raw.occurredAt, "activity.createdAt"),
        digest = hash(raw),
        key = `activity:${id}`;
      if (state.nativeDigests[key] && state.nativeDigests[key] !== digest)
        throw new Error("native activity identity equivocation");
      state.nativeDigests[key] = digest;
      for (const field of ["heartbeatRunId", "runId"])
        if (
          typeof raw[field] === "string" &&
          !state.heartbeatIds.includes(raw[field] as string)
        )
          state.heartbeatIds.push(raw[field] as string);
      if (!old.nativeDigests[key])
        candidates.push({
          key,
          at,
          type: "activity.recorded",
          digest,
          payload: {
            id,
            workId: raw.entityType === "issue" ? nullable(raw.entityId) : null,
            actorId: nullable(raw.actorId ?? raw.agentId),
            action: required(raw.action, "activity.action"),
            detail: { ...raw, details: raw.details ?? null },
          },
        });
    }
    if (activity.length === 500 && !state.truncationObserved) {
      state.truncationObserved = true;
      candidates.push({
        key: "history:500-boundary",
        at: activity
          .map((row) =>
            timestamp(row.createdAt ?? row.occurredAt, "activity.createdAt"),
          )
          .sort()
          .at(-1)!,
        type: "sidecar.history-truncated",
        digest: hash({ boundary: 500 }),
        payload: {
          source: "activity",
          boundary: 500,
          reason:
            "native activity endpoint returned its maximum row count; earlier rows cannot be proven complete",
        },
      });
    }
    this.entities("work", issues, state, old, candidates);
    if (issuePoll.complete) this.workTombstones(issues, state, old, candidates);
    else {
      const key = `history:issues:${hash(issuePoll.reason)}`,
        digest = hash({ source: "issues", reason: issuePoll.reason });
      if (!state.nativeDigests[key]) {
        state.nativeDigests[key] = digest;
        candidates.push({
          key,
          at: new Date(0).toISOString(),
          type: "sidecar.history-truncated",
          digest,
          payload: {
            source: "issues",
            boundary: issuePoll.rows.length,
            reason: issuePoll.reason,
          },
        });
      }
    }
    this.entities("approval", approvals, state, old, candidates);
    this.entities("heartbeat", heartbeatRuns, state, old, candidates);
    if (
      heartbeatRuns.length === 1000 &&
      !state.nativeDigests["history:heartbeat:1000"]
    ) {
      const digest = hash({ source: "heartbeat-runs", boundary: 1000 });
      state.nativeDigests["history:heartbeat:1000"] = digest;
      candidates.push({
        key: "history:heartbeat:1000",
        at: heartbeatRuns
          .map((row) =>
            timestamp(
              row.updatedAt ?? row.finishedAt ?? row.startedAt ?? row.createdAt,
              "heartbeat timestamp",
            ),
          )
          .sort()
          .at(-1)!,
        type: "sidecar.history-truncated",
        digest,
        payload: {
          source: "heartbeat-runs",
          boundary: 1000,
          reason:
            "native heartbeat endpoint reached its maximum window; older runs cannot be proven complete",
        },
      });
    }
    candidates.sort(
      (a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key),
    );
    for (const item of candidates) {
      const sequence = state.events.length + 1;
      state.events.push({
        id: `sidecar:${item.key}:${item.digest}`,
        sequence,
        occurredAt: item.at,
        type: item.type,
        payload: item.payload,
      });
    }
    state.version++;
    this.commit(old.version, state);
    return this.snapshot(state);
  }
  snapshot(input = this.currentOrCreate()): PaperclipReconciliationSnapshot {
    const latest = <T extends Record<string, unknown>>(kind: string) =>
      Object.entries(input.entityDigests)
        .filter(([key]) => key.startsWith(`${kind}:`))
        .map(([, encoded]) => JSON.parse(String(encoded)) as T);
    return {
      companyId: this.manifest.companyId,
      asOfSequence: input.events.length,
      works: latest<any>("work").map((x) => ({
        id: x.id,
        status: x.status,
        assigneeId: x.assigneeAgentId ?? null,
        revision: hash(x),
      })),
      approvals: latest<any>("approval").map((x) => ({
        id: x.id,
        state: x.status,
        workIds: x.issueIds ?? [],
        revision: hash(x),
      })),
      heartbeats: latest<any>("heartbeat").map((x) => ({
        id: x.id,
        state: x.status,
        workId: x.issueId,
        agentId: x.agentId,
        revision: hash(x),
        costCents: x.costCents ?? null,
      })),
    };
  }
  private entities(
    kind: "work" | "approval" | "heartbeat",
    rows: Record<string, unknown>[],
    state: PaperclipSidecarState,
    old: PaperclipSidecarState,
    out: Array<any>,
  ) {
    for (const row of rows) {
      const id = required(row.id, `${kind}.id`),
        key = `${kind}:${id}`,
        digest = hash(row),
        prior = old.entityDigests[key];
      state.entityDigests[key] = stable(row);
      if (prior === stable(row)) continue;
      const at = timestamp(
        row.updatedAt ?? row.finishedAt ?? row.startedAt ?? row.createdAt,
        `${kind}.updatedAt`,
      );
      if (kind === "work")
        out.push({
          key,
          at,
          digest,
          type: prior ? "work.updated" : "work.observed",
          payload: {
            id,
            status: required(row.status, "work.status"),
            assigneeId: nullable(row.assigneeAgentId),
            revision: digest,
          },
        });
      if (kind === "approval")
        out.push({
          key,
          at,
          digest,
          type:
            prior &&
            ["approved", "rejected"].includes(String(row.status)) &&
            String((JSON.parse(prior) as Record<string, unknown>).status) !==
              String(row.status)
              ? "approval.resolved"
              : "approval.observed",
          payload: {
            id,
            state: required(row.status, "approval.status"),
            workIds: Array.isArray(row.issueIds) ? row.issueIds : [],
            revision: digest,
          },
        });
      if (kind === "heartbeat")
        out.push({
          key,
          at,
          digest,
          type:
            prior &&
            row.status === "failed" &&
            (JSON.parse(prior) as Record<string, unknown>).status !== "failed"
              ? "heartbeat.failed"
              : prior &&
                  row.status === "succeeded" &&
                  (JSON.parse(prior) as Record<string, unknown>).status !==
                    "succeeded"
                ? "heartbeat.completed"
                : "heartbeat.observed",
          payload: {
            id,
            state: required(row.status, "heartbeat.status"),
            workId: nullable(row.issueId),
            agentId: required(row.agentId, "heartbeat.agentId"),
            revision: digest,
            costCents: row.costCents ?? null,
          },
        });
    }
  }
  private workTombstones(
    rows: Record<string, unknown>[],
    state: PaperclipSidecarState,
    old: PaperclipSidecarState,
    out: Array<any>,
  ) {
    const seen = new Set(rows.map((row) => required(row.id, "work.id")));
    for (const [key, encoded] of Object.entries(old.entityDigests)) {
      if (!key.startsWith("work:") || seen.has(key.slice(5))) continue;
      const prior = JSON.parse(encoded) as Record<string, unknown>,
        id = key.slice(5),
        digest = hash({ id, prior, deleted: true });
      delete state.entityDigests[key];
      out.push({
        key: `${key}:deleted`,
        at: timestamp(
          prior.updatedAt ?? prior.createdAt,
          "work deletion timestamp",
        ),
        digest,
        type: "work.deleted",
        payload: {
          id,
          status: "deleted",
          assigneeId: nullable(prior.assigneeAgentId),
          revision: digest,
        },
      });
    }
  }
  private page(after: string | null, limit: number): PaperclipEventPage {
    const state = this.currentOrCreate(),
      offset = after === null ? 0 : Number(after);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > state.events.length ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      throw new Error("sidecar cursor or limit invalid");
    const events = state.events.slice(offset, offset + limit),
      nextOffset = offset + events.length;
    return {
      schema: this.manifest.eventSchema,
      companyId: this.manifest.companyId,
      after,
      next: nextOffset < state.events.length ? String(nextOffset) : null,
      highWaterSequence: state.events.length,
      events: structuredClone(events),
    };
  }
  private array(path: string) {
    const result = this.native.request({
      method: "GET",
      path,
      authBinding: this.nativeAuthBinding,
    });
    if (
      result.status !== 200 ||
      !Array.isArray(result.body) ||
      result.body.some((x) => !record(x))
    )
      throw new Error(`native Paperclip array poll failed: ${path}`);
    return result.body as Record<string, unknown>[];
  }
  private issuePages() {
    const rows: Record<string, unknown>[] = [],
      seen = new Set<string>(),
      company = encodeURIComponent(this.manifest.companyId);
    for (let page = 0; page < 200; page++) {
      const offset = page * 500,
        path = `/api/companies/${company}/issues?limit=500&offset=${offset}`;
      let batch: Record<string, unknown>[];
      try {
        batch = this.array(path);
      } catch (error) {
        return {
          rows,
          complete: false,
          reason: `issue page ${page} unavailable: ${(error as Error).message}`,
        };
      }
      for (const row of batch) {
        const id = required(row.id, "work.id");
        if (seen.has(id))
          return {
            rows,
            complete: false,
            reason: `issue pagination repeated identity '${id}'`,
          };
        seen.add(id);
        rows.push(row);
      }
      if (batch.length < 500) return { rows, complete: true, reason: "" };
    }
    return {
      rows,
      complete: false,
      reason: "issue pagination exceeded the 100000-row safety bound",
    };
  }
  private object(path: string) {
    const result = this.native.request({
      method: "GET",
      path,
      authBinding: this.nativeAuthBinding,
    });
    if (result.status !== 200 || !record(result.body))
      throw new Error(`native Paperclip object poll failed: ${path}`);
    return result.body;
  }
  private currentOrCreate(): PaperclipSidecarState {
    const found = this.store.load(this.manifest.deploymentId);
    if (found) {
      this.verify(found);
      return found;
    }
    const body = {
      version: 1,
      companyId: this.manifest.companyId,
      adapterDigest: this.manifest.adapter.implementationDigest,
      nativeDigests: {},
      entityDigests: {},
      events: [],
      heartbeatIds: [],
      truncationObserved: false,
    };
    const next = seal(body, this.trust);
    if (!this.store.compareAndSwap(this.manifest.deploymentId, undefined, next))
      return this.currentOrCreate();
    return next;
  }
  private commit(expected: number, state: PaperclipSidecarState) {
    const { digest: _d, signature: _s, ...body } = state;
    const next = seal(body, this.trust);
    if (!this.store.compareAndSwap(this.manifest.deploymentId, expected, next))
      throw new Error("sidecar CAS contention");
  }
  private verify(state: PaperclipSidecarState) {
    const { digest, signature, ...body } = state;
    if (
      state.companyId !== this.manifest.companyId ||
      state.adapterDigest !== this.manifest.adapter.implementationDigest ||
      digest !== hash(body) ||
      !this.trust.verify(digest, signature)
    )
      throw new Error("sidecar state provenance failure");
  }
}
export interface PaperclipSidecarListener {
  listen(
    endpoint: string,
    handler: (request: PaperclipEventRequest) => PaperclipEventResponse,
  ): void;
  close(): void;
  healthy(endpoint: string): boolean;
}
export class PaperclipEventSidecarService {
  private running = false;
  constructor(
    private endpoint: string,
    private sidecar: PaperclipPollingEventSidecar,
    private listener: PaperclipSidecarListener,
  ) {}
  start() {
    if (!this.running) {
      this.listener.listen(this.endpoint, (request) =>
        this.sidecar.request(request),
      );
      this.running = true;
    }
    if (!this.listener.healthy(this.endpoint))
      throw new Error("sidecar listener unhealthy");
  }
  stop() {
    if (this.running) this.listener.close();
    this.running = false;
  }
  health() {
    return (
      this.running &&
      this.listener.healthy(this.endpoint) &&
      this.sidecar.attestAdapter(this.sidecar.binding())
    );
  }
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const stable = (v: unknown) => canonicalSemanticJson(v);
const hash = (v: unknown) =>
  `sha256:${createHash("sha256").update(stable(v)).digest("hex")}`;
const required = (v: unknown, f: string) => {
  if (typeof v !== "string" || !v) throw new Error(`${f} invalid`);
  return v;
};
const nullable = (v: unknown) => (typeof v === "string" && v ? v : null);
const timestamp = (v: unknown, f: string) => {
  const s = required(v, f);
  if (!Number.isFinite(Date.parse(s))) throw new Error(`${f} invalid`);
  return s;
};
function seal(
  body: Omit<PaperclipSidecarState, "digest" | "signature">,
  trust: PaperclipSidecarTrust,
): PaperclipSidecarState {
  const digest = hash(body);
  return { ...structuredClone(body), digest, signature: trust.sign(digest) };
}
