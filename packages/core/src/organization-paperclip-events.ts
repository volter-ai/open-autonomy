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
import { dirname, resolve } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";

export type PaperclipEventManifest = {
  schema: "autonomy.paperclip-events.v1";
  deploymentId: string;
  companyId: string;
  baseEndpoint: string;
  authBinding: string;
  eventSchema: string;
  adapter: { id: string; implementationDigest: string; endpoint: string };
  health: { gitSha: string; version: string; baseEndpoint: string };
  manifestDigest: string;
};

export type PaperclipNativeEvent = {
  id: string;
  sequence: number;
  occurredAt: string;
  type: string;
  payload: Record<string, unknown>;
};

export type PaperclipEventPage = {
  schema: string;
  companyId: string;
  after: string | null;
  next: string | null;
  highWaterSequence: number;
  events: PaperclipNativeEvent[];
};

export type PaperclipReconciliationSnapshot = {
  companyId: string;
  asOfSequence: number;
  works: Array<{
    id: string;
    status: string;
    assigneeId?: string | null;
    revision: string;
  }>;
  approvals: Array<{
    id: string;
    state: string;
    workIds: string[];
    revision: string;
  }>;
  heartbeats: Array<{
    id: string;
    state: string;
    workId?: string;
    agentId: string;
    revision: string;
    costCents?: number | null;
  }>;
};

export type PaperclipProjectionGap = {
  id: string;
  kind:
    | "sequence-gap"
    | "unsupported-event"
    | "malformed-payload"
    | "snapshot-divergence"
    | "history-truncated";
  atSequence: number;
  nativeType?: string;
  entity?: string;
  detail: string;
};

export type PaperclipWorkProjection = {
  id: string;
  status: string;
  assigneeId: string | null;
  revision: string;
  lastSequence: number;
  deleted: boolean;
};
export type PaperclipApprovalProjection = {
  id: string;
  state: string;
  workIds: string[];
  revision: string;
  lastSequence: number;
};
export type PaperclipHeartbeatProjection = {
  id: string;
  state: string;
  workId: string | null;
  agentId: string;
  revision: string;
  lastSequence: number;
  costCents: number | null;
  costEvidence: "observed" | "missing";
};
export type PaperclipActivityProjection = {
  id: string;
  workId: string | null;
  actorId: string | null;
  action: string;
  occurredAt: string;
  sequence: number;
  detail: Record<string, unknown>;
};
export type PaperclipTimelineProjection = {
  eventId: string;
  sequence: number;
  occurredAt: string;
  nativeType: string;
  entityIds: string[];
};

export type PaperclipEventState = {
  schema: "autonomy.paperclip-event-state.v1";
  deploymentId: string;
  companyId: string;
  manifestDigest: string;
  serverBinding: { gitSha: string; version: string; baseEndpoint: string };
  generation: number;
  scanCursor: string | null;
  seenCursors: Record<string, true>;
  contiguousSequence: number;
  observedHighWater: number;
  events: Record<string, PaperclipNativeEvent>;
  eventDigests: Record<string, string>;
  works: Record<string, PaperclipWorkProjection>;
  approvals: Record<string, PaperclipApprovalProjection>;
  heartbeats: Record<string, PaperclipHeartbeatProjection>;
  activities: PaperclipActivityProjection[];
  timeline: PaperclipTimelineProjection[];
  gaps: PaperclipProjectionGap[];
  reconciliations: Array<{ snapshotDigest: string; asOfSequence: number }>;
  digest: string;
  signature: string;
};

export interface PaperclipEventTrust {
  sign(digest: string): string;
  verify(digest: string, signature: string): boolean;
  authenticateManifest(manifest: PaperclipEventManifest): boolean;
  verifySnapshot(
    snapshot: PaperclipReconciliationSnapshot,
    digest: string,
  ): boolean;
}
export interface PaperclipEventStore {
  load(deploymentId: string): PaperclipEventState | undefined;
  compareAndSwap(
    deploymentId: string,
    expectedGeneration: number | undefined,
    next: PaperclipEventState,
  ): boolean;
}
export class MemoryPaperclipEventStore implements PaperclipEventStore {
  private readonly values = new Map<string, PaperclipEventState>();
  load(id: string) {
    const value = this.values.get(id);
    return value && structuredClone(value);
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: PaperclipEventState,
  ) {
    if (this.values.get(id)?.generation !== expected) return false;
    this.values.set(id, structuredClone(next));
    return true;
  }
}
export class DiskPaperclipEventStore implements PaperclipEventStore {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }
  private path(id: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("unsafe event store id");
    return resolve(this.root, `${id}.json`);
  }
  load(id: string) {
    const path = this.path(id);
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as PaperclipEventState)
      : undefined;
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: PaperclipEventState,
  ) {
    return diskLock(this.path(id), () => {
      if (this.load(id)?.generation !== expected) return false;
      const path = this.path(id),
        tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmp, canonicalSemanticJson(next), { mode: 0o600 });
      const data = openSync(tmp, "r");
      try {
        fsyncSync(data);
      } finally {
        closeSync(data);
      }
      renameSync(tmp, path);
      const directory = openSync(dirname(path), "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
      return true;
    });
  }
}
function diskLock<T>(path: string, fn: () => T): T {
  const lock = `${path}.lock`,
    token = `${process.pid}:${Date.now()}:${Math.random()}`,
    owner = { pid: process.pid, start: processStart(process.pid), token };
  for (let n = 0; n < 1000; n++) {
    try {
      const fd = openSync(lock, "wx", 0o600);
      try {
        writeFileSync(fd, canonicalSemanticJson(owner));
        return fn();
      } finally {
        closeSync(fd);
        try {
          const observed = JSON.parse(readFileSync(lock, "utf8"));
          if (observed.token === token) removeEventLock(lock, token);
        } catch {}
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const observed = JSON.parse(readFileSync(lock, "utf8")) as {
          pid: number;
          start: string;
          token: string;
        };
        if (!processAlive(observed.pid, observed.start)) {
          removeEventLock(lock, observed.token);
          continue;
        }
      } catch {}
      Bun.sleepSync(10);
    }
  }
  throw new Error("event store lock timeout");
}
function removeEventLock(path: string, token: string) {
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
function processStart(pid: number) {
  try {
    return (
      readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[21] ?? "unknown"
    );
  } catch {
    return "unknown";
  }
}
function processAlive(pid: number, start: string) {
  try {
    process.kill(pid, 0);
    return processStart(pid) === start;
  } catch {
    return false;
  }
}

export type PaperclipEventRequest = {
  method: "GET";
  path: string;
  authBinding: string;
  requestId: string;
};
export type PaperclipEventResponse = { status: number; body: unknown };
export interface PaperclipEventPort {
  attestAdapter(binding: PaperclipEventManifest["adapter"]): boolean;
  request(input: PaperclipEventRequest): PaperclipEventResponse;
}

const MAX_PAGE = 500,
  MAX_BUFFERED = 20_000,
  MAX_CURSOR_BYTES = 4096,
  MAX_EVENT_BYTES = 1024 * 1024;
const rec = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const hash = (v: unknown) =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(v)).digest("hex")}`;
const text = (v: unknown, field: string) => {
  if (typeof v !== "string" || !v || Buffer.byteLength(v) > 4096)
    throw new Error(`${field} is invalid`);
  return v;
};
const seq = (v: unknown, field: string) => {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    throw new Error(`${field} is invalid`);
  return v as number;
};
const instant = (v: unknown, field: string) => {
  const s = text(v, field);
  if (!Number.isFinite(Date.parse(s))) throw new Error(`${field} is invalid`);
  return s;
};
const nullableText = (v: unknown, field: string) =>
  v == null ? null : text(v, field);
const exactKeys = (
  v: Record<string, unknown>,
  allowed: string[],
  field: string,
) => {
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    throw new Error(`${field} has unsupported members`);
};

export function paperclipEventManifestDigest(
  value: Omit<PaperclipEventManifest, "manifestDigest">,
) {
  return hash(value);
}

function validateManifest(m: PaperclipEventManifest) {
  const { manifestDigest, ...body } = m;
  if (
    m.schema !== "autonomy.paperclip-events.v1" ||
    manifestDigest !== hash(body)
  )
    throw new Error("Paperclip event manifest digest is invalid");
  for (const [k, v] of [
    ["deploymentId", m.deploymentId],
    ["companyId", m.companyId],
    ["authBinding", m.authBinding],
    ["eventSchema", m.eventSchema],
    ["adapter.id", m.adapter.id],
    ["adapter.implementationDigest", m.adapter.implementationDigest],
    ["health.gitSha", m.health.gitSha],
    ["health.version", m.health.version],
  ] as const)
    text(v, k);
  let endpoint: URL, healthEndpoint: URL;
  try {
    endpoint = new URL(m.baseEndpoint);
    healthEndpoint = new URL(m.health.baseEndpoint);
  } catch {
    throw new Error("Paperclip base endpoint is invalid");
  }
  if (
    endpoint.href !== healthEndpoint.href ||
    endpoint.username ||
    endpoint.password ||
    !["http:", "https:"].includes(endpoint.protocol)
  )
    throw new Error("Paperclip health/base endpoint binding is invalid");
  if (
    endpoint.protocol === "http:" &&
    !["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname)
  )
    throw new Error("Paperclip cleartext event endpoint must be loopback");
  if (!/^(?:secret|env):\/\/[A-Za-z0-9._/-]+$/.test(m.authBinding))
    throw new Error(
      "Paperclip event auth binding is not a credential reference",
    );
  let adapterEndpoint: URL;
  try {
    adapterEndpoint = new URL(m.adapter.endpoint);
  } catch {
    throw new Error("Paperclip event adapter endpoint is invalid");
  }
  if (
    adapterEndpoint.protocol !== "https:" &&
    !(
      adapterEndpoint.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(adapterEndpoint.hostname)
    )
  )
    throw new Error("Paperclip event adapter endpoint is untrusted cleartext");
  if (adapterEndpoint.href === endpoint.href)
    throw new Error("Paperclip native and event adapter endpoints must differ");
}

function blank(
  m: PaperclipEventManifest,
): Omit<PaperclipEventState, "digest" | "signature"> {
  return {
    schema: "autonomy.paperclip-event-state.v1",
    deploymentId: m.deploymentId,
    companyId: m.companyId,
    manifestDigest: m.manifestDigest,
    serverBinding: structuredClone(m.health),
    generation: 1,
    scanCursor: null,
    seenCursors: {},
    contiguousSequence: 0,
    observedHighWater: 0,
    events: {},
    eventDigests: {},
    works: {},
    approvals: {},
    heartbeats: {},
    activities: [],
    timeline: [],
    gaps: [],
    reconciliations: [],
  };
}
function seal(
  body: Omit<PaperclipEventState, "digest" | "signature">,
  trust: PaperclipEventTrust,
): PaperclipEventState {
  const digest = hash(body);
  return { ...body, digest, signature: trust.sign(digest) };
}
function unseal(
  state: PaperclipEventState,
  m: PaperclipEventManifest,
  trust: PaperclipEventTrust,
) {
  const { digest, signature, ...body } = state;
  if (digest !== hash(body) || !trust.verify(digest, signature))
    throw new Error("Paperclip event checkpoint authentication failed");
  if (
    state.deploymentId !== m.deploymentId ||
    state.companyId !== m.companyId ||
    state.manifestDigest !== m.manifestDigest ||
    canonicalSemanticJson(state.serverBinding) !==
      canonicalSemanticJson(m.health)
  )
    throw new Error("Paperclip event checkpoint is misbound");
  if (
    !Number.isSafeInteger(state.generation) ||
    state.generation < 1 ||
    !Number.isSafeInteger(state.contiguousSequence) ||
    state.contiguousSequence < 0 ||
    state.observedHighWater < state.contiguousSequence
  )
    throw new Error("Paperclip event checkpoint bounds are invalid");
  return structuredClone(state);
}

function gap(
  state: PaperclipEventState,
  value: Omit<PaperclipProjectionGap, "id">,
) {
  const id = hash(value);
  if (!state.gaps.some((g) => g.id === id)) state.gaps.push({ ...value, id });
}
function knownPayload(
  state: PaperclipEventState,
  e: PaperclipNativeEvent,
  keys: string[],
): Record<string, unknown> | undefined {
  try {
    exactKeys(e.payload, keys, `event ${e.id} payload`);
    return e.payload;
  } catch (error) {
    gap(state, {
      kind: "malformed-payload",
      atSequence: e.sequence,
      nativeType: e.type,
      detail: (error as Error).message,
    });
    return undefined;
  }
}
function cost(value: unknown): {
  costCents: number | null;
  costEvidence: "observed" | "missing";
} {
  if (value === undefined || value === null)
    return { costCents: null, costEvidence: "missing" };
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error("heartbeat.costCents is invalid");
  return { costCents: Number(value), costEvidence: "observed" };
}
function materialize(state: PaperclipEventState, e: PaperclipNativeEvent) {
  const entityIds: string[] = [];
  try {
    if (
      [
        "work.observed",
        "work.created",
        "work.updated",
        "work.deleted",
      ].includes(e.type)
    ) {
      const p = knownPayload(state, e, [
        "id",
        "status",
        "assigneeId",
        "revision",
      ]);
      if (!p) return;
      const id = text(p.id, "work.id"),
        prior = state.works[id];
      entityIds.push(id);
      if (!["work.created", "work.observed"].includes(e.type) && !prior)
        throw new Error("work update has no observed predecessor");
      state.works[id] = {
        id,
        status: text(p.status, "work.status"),
        assigneeId: nullableText(p.assigneeId, "work.assigneeId"),
        revision: text(p.revision, "work.revision"),
        lastSequence: e.sequence,
        deleted: e.type === "work.deleted",
      };
    } else if (
      ["approval.observed", "approval.requested", "approval.resolved"].includes(
        e.type,
      )
    ) {
      const p = knownPayload(state, e, ["id", "state", "workIds", "revision"]);
      if (!p) return;
      if (!Array.isArray(p.workIds) || p.workIds.length > 1000)
        throw new Error("approval.workIds is invalid");
      const id = text(p.id, "approval.id"),
        workIds = p.workIds.map((v) => text(v, "approval.workId")),
        prior = state.approvals[id];
      entityIds.push(id, ...workIds);
      if (e.type === "approval.resolved" && !prior)
        throw new Error("approval resolution has no observed request");
      if (
        prior &&
        canonicalSemanticJson(prior.workIds) !== canonicalSemanticJson(workIds)
      )
        throw new Error("approval work binding changed");
      state.approvals[id] = {
        id,
        state: text(p.state, "approval.state"),
        workIds,
        revision: text(p.revision, "approval.revision"),
        lastSequence: e.sequence,
      };
    } else if (
      [
        "heartbeat.observed",
        "heartbeat.started",
        "heartbeat.completed",
        "heartbeat.failed",
      ].includes(e.type)
    ) {
      const p = knownPayload(state, e, [
        "id",
        "state",
        "workId",
        "agentId",
        "revision",
        "costCents",
      ]);
      if (!p) return;
      const id = text(p.id, "heartbeat.id"),
        workId = nullableText(p.workId, "heartbeat.workId"),
        agentId = text(p.agentId, "heartbeat.agentId"),
        incoming = cost(p.costCents),
        prior = state.heartbeats[id];
      entityIds.push(id, ...(workId ? [workId] : []));
      if (
        !["heartbeat.started", "heartbeat.observed"].includes(e.type) &&
        !prior
      )
        throw new Error("heartbeat terminal event has no observed start");
      if (prior && (prior.workId !== workId || prior.agentId !== agentId))
        throw new Error("heartbeat ownership binding changed");
      if (
        prior?.costEvidence === "observed" &&
        incoming.costEvidence === "observed" &&
        prior.costCents !== incoming.costCents
      )
        throw new Error("heartbeat cost evidence conflicts");
      const economic =
        incoming.costEvidence === "observed" || !prior
          ? incoming
          : { costCents: prior.costCents, costEvidence: prior.costEvidence };
      state.heartbeats[id] = {
        id,
        state: text(p.state, "heartbeat.state"),
        workId,
        agentId,
        revision: text(p.revision, "heartbeat.revision"),
        lastSequence: e.sequence,
        ...economic,
      };
    } else if (e.type === "activity.recorded") {
      const p = knownPayload(state, e, [
        "id",
        "workId",
        "actorId",
        "action",
        "detail",
      ]);
      if (!p) return;
      const id = text(p.id, "activity.id"),
        workId = nullableText(p.workId, "activity.workId"),
        actorId = nullableText(p.actorId, "activity.actorId");
      if (!rec(p.detail)) throw new Error("activity.detail is invalid");
      entityIds.push(id, ...(workId ? [workId] : []));
      state.activities.push({
        id,
        workId,
        actorId,
        action: text(p.action, "activity.action"),
        occurredAt: e.occurredAt,
        sequence: e.sequence,
        detail: structuredClone(p.detail),
      });
    } else if (e.type === "sidecar.history-truncated") {
      const p = knownPayload(state, e, ["source", "boundary", "reason"]);
      if (!p) return;
      gap(state, {
        kind: "history-truncated",
        atSequence: e.sequence,
        nativeType: e.type,
        detail: text(p.reason, "history truncation reason"),
      });
    } else
      gap(state, {
        kind: "unsupported-event",
        atSequence: e.sequence,
        nativeType: e.type,
        detail: "no lossless portable projection is registered",
      });
  } catch (error) {
    gap(state, {
      kind: "malformed-payload",
      atSequence: e.sequence,
      nativeType: e.type,
      detail: (error as Error).message,
    });
  } finally {
    state.timeline.push({
      eventId: e.id,
      sequence: e.sequence,
      occurredAt: e.occurredAt,
      nativeType: e.type,
      entityIds,
    });
  }
}

export class PaperclipEventIngestor {
  constructor(
    private readonly manifest: PaperclipEventManifest,
    private readonly trust: PaperclipEventTrust,
    private readonly store: PaperclipEventStore,
    private readonly port?: PaperclipEventPort,
  ) {
    validateManifest(manifest);
    if (!trust.authenticateManifest(manifest))
      throw new Error("Paperclip event manifest is not trusted");
  }
  initialize() {
    const old = this.store.load(this.manifest.deploymentId);
    if (old) return unseal(old, this.manifest, this.trust);
    const next = seal(blank(this.manifest), this.trust);
    if (!this.store.compareAndSwap(this.manifest.deploymentId, undefined, next))
      throw new Error("concurrent Paperclip event checkpoint creation");
    return structuredClone(next);
  }
  current() {
    const value = this.store.load(this.manifest.deploymentId);
    if (!value) throw new Error("Paperclip event ingestor is not initialized");
    return unseal(value, this.manifest, this.trust);
  }
  sync(limit = MAX_PAGE) {
    if (!this.port) throw new Error("Paperclip event port is unavailable");
    if (!this.port.attestAdapter(this.manifest.adapter))
      throw new Error("Paperclip event sidecar adapter attestation failed");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE)
      throw new Error("Paperclip event page limit is invalid");
    const before = this.current(),
      health = this.port.request({
        method: "GET",
        path: "/open-autonomy/paperclip-events/v1/health",
        authBinding: this.manifest.authBinding,
        requestId: `events:health:${before.generation}`,
      });
    if (
      health.status !== 200 ||
      !rec(health.body) ||
      health.body.gitSha !== this.manifest.health.gitSha ||
      health.body.version !== this.manifest.health.version ||
      health.body.baseEndpoint !== this.manifest.health.baseEndpoint ||
      health.body.adapterId !== this.manifest.adapter.id ||
      health.body.implementationDigest !==
        this.manifest.adapter.implementationDigest
    )
      throw new Error(
        "contacted Paperclip server health is not manifest-bound",
      );
    const after =
        before.scanCursor === null ? "" : encodeURIComponent(before.scanCursor),
      response = this.port.request({
        method: "GET",
        path: `/open-autonomy/paperclip-events/v1/companies/${encodeURIComponent(this.manifest.companyId)}/events?after=${after}&limit=${limit}`,
        authBinding: this.manifest.authBinding,
        requestId: `events:page:${before.generation}`,
      });
    if (response.status !== 200)
      throw new Error(`Paperclip event page failed with ${response.status}`);
    return this.ingest(response.body);
  }
  ingest(input: unknown) {
    const old = this.current();
    if (!rec(input) || !Array.isArray(input.events))
      throw new Error("Paperclip event page is malformed");
    exactKeys(
      input,
      ["schema", "companyId", "after", "next", "highWaterSequence", "events"],
      "event page",
    );
    if (
      input.schema !== this.manifest.eventSchema ||
      input.companyId !== this.manifest.companyId ||
      input.after !== old.scanCursor
    )
      throw new Error(
        "Paperclip event page is schema, tenant, or cursor misbound",
      );
    if (input.events.length > MAX_PAGE)
      throw new Error("Paperclip event page exceeds bounds");
    const next =
        input.next === null ? null : text(input.next, "event page next"),
      high = seq(input.highWaterSequence, "event page high water");
    if (next !== null && Buffer.byteLength(next) > MAX_CURSOR_BYTES)
      throw new Error("Paperclip event cursor exceeds bounds");
    if (next !== null && (next === old.scanCursor || old.seenCursors[next]))
      throw new Error("Paperclip event cursor cycle detected");
    if (high < old.observedHighWater)
      throw new Error("Paperclip event high-water rollback");
    const state = structuredClone(old);
    state.generation++;
    for (const raw of input.events) {
      if (!rec(raw) || !rec(raw.payload))
        throw new Error("Paperclip native event is malformed");
      exactKeys(
        raw,
        ["id", "sequence", "occurredAt", "type", "payload"],
        "native event",
      );
      const event: PaperclipNativeEvent = {
        id: text(raw.id, "event.id"),
        sequence: seq(raw.sequence, "event.sequence"),
        occurredAt: instant(raw.occurredAt, "event.occurredAt"),
        type: text(raw.type, "event.type"),
        payload: structuredClone(raw.payload),
      };
      if (
        event.sequence === 0 ||
        event.sequence > high ||
        Buffer.byteLength(canonicalSemanticJson(event)) > MAX_EVENT_BYTES
      )
        throw new Error("Paperclip native event bounds are invalid");
      const key = String(event.sequence),
        digest = hash(event),
        prior = state.eventDigests[key],
        sameId = Object.values(state.events).find(
          (value) => value.id === event.id,
        );
      if (prior && prior !== digest)
        throw new Error("conflicting Paperclip event at sequence");
      if (sameId && sameId.sequence !== event.sequence)
        throw new Error("conflicting Paperclip duplicate event identity");
      if (!prior) {
        if (Object.keys(state.events).length >= MAX_BUFFERED)
          throw new Error("Paperclip event buffer exceeds bounds");
        state.events[key] = event;
        state.eventDigests[key] = digest;
      }
    }
    state.observedHighWater = high;
    state.scanCursor = next;
    if (next !== null) state.seenCursors[next] = true;
    while (state.events[String(state.contiguousSequence + 1)]) {
      const e = state.events[String(++state.contiguousSequence)]!;
      materialize(state, e);
    }
    state.gaps = state.gaps.filter((g) => g.kind !== "sequence-gap");
    if (state.contiguousSequence < state.observedHighWater) {
      gap(state, {
        kind: "sequence-gap",
        atSequence: state.contiguousSequence + 1,
        detail: `missing sequence ${state.contiguousSequence + 1} below observed high-water ${state.observedHighWater}`,
      });
      if (next === null)
        gap(state, {
          kind: "history-truncated",
          atSequence: state.contiguousSequence + 1,
          detail: `terminal page left sequence ${state.contiguousSequence + 1} unavailable below high-water ${state.observedHighWater}`,
        });
    }
    return this.commit(old, state);
  }
  reconcile(snapshot: PaperclipReconciliationSnapshot) {
    const old = this.current();
    if (!rec(snapshot))
      throw new Error("Paperclip reconciliation snapshot is malformed");
    exactKeys(
      snapshot as unknown as Record<string, unknown>,
      ["companyId", "asOfSequence", "works", "approvals", "heartbeats"],
      "reconciliation snapshot",
    );
    const snapshotDigest = hash(snapshot);
    if (!this.trust.verifySnapshot(snapshot, snapshotDigest))
      throw new Error(
        "Paperclip reconciliation snapshot provenance is untrusted",
      );
    if (snapshot.companyId !== this.manifest.companyId)
      throw new Error("Paperclip reconciliation snapshot is cross-tenant");
    seq(snapshot.asOfSequence, "snapshot.asOfSequence");
    if (snapshot.asOfSequence !== old.contiguousSequence)
      throw new Error(
        "Paperclip reconciliation snapshot is not at the contiguous projection cut",
      );
    if (
      !Array.isArray(snapshot.works) ||
      !Array.isArray(snapshot.approvals) ||
      !Array.isArray(snapshot.heartbeats) ||
      snapshot.works.length +
        snapshot.approvals.length +
        snapshot.heartbeats.length >
        10_000
    )
      throw new Error("Paperclip reconciliation snapshot exceeds bounds");
    const state = structuredClone(old);
    state.generation++;
    state.gaps = state.gaps.filter((g) => g.kind !== "snapshot-divergence");
    for (const item of snapshot.works)
      exactKeys(
        item as unknown as Record<string, unknown>,
        ["id", "status", "assigneeId", "revision"],
        "work snapshot",
      );
    for (const item of snapshot.approvals)
      exactKeys(
        item as unknown as Record<string, unknown>,
        ["id", "state", "workIds", "revision"],
        "approval snapshot",
      );
    for (const item of snapshot.heartbeats)
      exactKeys(
        item as unknown as Record<string, unknown>,
        ["id", "state", "workId", "agentId", "revision", "costCents"],
        "heartbeat snapshot",
      );
    const compare = (
      kind: string,
      native: Array<{ id: string; revision: string }>,
      projected: Record<string, { revision: string }>,
      equal: (item: any, value: any) => boolean,
    ) => {
      const seen = new Set<string>();
      for (const item of native) {
        text(item.id, `${kind}.id`);
        text(item.revision, `${kind}.revision`);
        if (seen.has(item.id))
          throw new Error(`duplicate ${kind} snapshot identity`);
        seen.add(item.id);
        if (!projected[item.id] || !equal(item, projected[item.id]))
          gap(state, {
            kind: "snapshot-divergence",
            atSequence: snapshot.asOfSequence,
            entity: `${kind}:${item.id}`,
            detail: `snapshot value or revision differs from event projection`,
          });
      }
      for (const id of Object.keys(projected))
        if (!seen.has(id))
          gap(state, {
            kind: "snapshot-divergence",
            atSequence: snapshot.asOfSequence,
            entity: `${kind}:${id}`,
            detail: "event projection entity is absent from snapshot",
          });
    };
    compare(
      "work",
      snapshot.works,
      Object.fromEntries(
        Object.entries(state.works).filter(([, value]) => !value.deleted),
      ),
      (a, b) =>
        a.revision === b.revision &&
        a.status === b.status &&
        (a.assigneeId ?? null) === b.assigneeId,
    );
    compare(
      "approval",
      snapshot.approvals,
      state.approvals,
      (a, b) =>
        a.revision === b.revision &&
        a.state === b.state &&
        canonicalSemanticJson(a.workIds) === canonicalSemanticJson(b.workIds),
    );
    compare(
      "heartbeat",
      snapshot.heartbeats,
      state.heartbeats,
      (a, b) =>
        a.revision === b.revision &&
        a.state === b.state &&
        (a.workId ?? null) === b.workId &&
        a.agentId === b.agentId &&
        (a.costCents === undefined || a.costCents === b.costCents),
    );
    if (
      !state.reconciliations.some(
        (value) => value.snapshotDigest === snapshotDigest,
      )
    )
      state.reconciliations.push({
        snapshotDigest,
        asOfSequence: snapshot.asOfSequence,
      });
    return this.commit(old, state);
  }
  private commit(old: PaperclipEventState, state: PaperclipEventState) {
    const { digest: _, signature: __, ...body } = state,
      next = seal(body, this.trust);
    if (
      !this.store.compareAndSwap(
        this.manifest.deploymentId,
        old.generation,
        next,
      )
    )
      throw new Error("concurrent Paperclip event checkpoint update");
    return structuredClone(next);
  }
}
