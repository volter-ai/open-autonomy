import {
  canonicalSemanticJson,
  semanticDigest,
} from "./organization-canonical";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  acceptCausalHistory,
  liftNativeObservation,
  sealPortableEvent,
  type AcceptedCausalHistory,
  type CausalAcceptancePolicy,
  type NativeLiftAdapter,
  type NativeObservation,
  type PortableEventV2,
} from "./organization-causal-state";

export type RuntimeAuthority = {
  tenant: string;
  principal: string;
  roles: Array<
    "ingest" | "lift" | "accept" | "project" | "privacy" | "migration" | "query"
  >;
  capability: string;
};
export type NativeEventEnvelope = {
  schema: "autonomy.native-envelope.v1";
  tenant: string;
  ingestSequence: number;
  observation: NativeObservation;
  digest: string;
  signature: string;
};
export type RuntimeProvenance = {
  nativeId: string;
  nativeDigest: string;
  ingestSequence: number;
  portableId?: string;
  adapterId?: string;
  logicalIndex?: number;
  stages: {
    ingestedBy: string;
    liftedBy?: string;
    acceptedBy?: string;
    projectedBy?: string;
  };
};
export type RuntimeGap = {
  kind: "partition" | "causal-parent" | "lift" | "purged";
  id: string;
  detail: string;
};
export type RuntimeSnapshot = {
  id: string;
  generation: number;
  eventHighWater: number;
  reducer: string;
  reducerImplementationDigest: string;
  schema: string;
  projection: unknown;
  historyDigest: string;
  purgeHighWater: number;
  digest: string;
  signature: string;
};
export type PurgeEvidence = {
  id: string;
  tenant: string;
  eventIds: string[];
  nativeIds: string[];
  nativeDigests: string[];
  paths: string[];
  at: string;
  sequence: number;
  previous: string | null;
  digest: string;
  signature: string;
};
export type RuntimePurgeTransaction={id:string;status:"prepared"|"committed";evidence:Omit<PurgeEvidence,"signature">;signature?:string};
export type RuntimeErasureEvidence={transactionId:string;location:string;status:"erased"|"unverified";digest:string;signature:string};
export type RuntimePrivacyResidual={transactionId:string;location:string;reason:string};
export type RuntimeRetentionRule={id:string;cutoff:string;paths:string[];createdAt:string};
export type ReducerMigration = {
  id: string;
  from: string;
  to: string;
  eventSchema: "autonomy.event.v2";
  implementationDigest: string;
  artifactSignature: string;
  inverseImplementationDigest?: string;
  inverseArtifactSignature?: string;
  digest: string;
  map(event: PortableEventV2): Omit<PortableEventV2, "integrity">;
  inverse?: ReducerMigration["map"];
};
export type RuntimeReducer = {
  id: string;
  schema: string;
  implementationDigest: string;
  artifactSignature: string;
  derivations?: Record<string,string[]>;
  initial(): unknown;
  apply(state: unknown, event: PortableEventV2): unknown;
};
export const runtimeReducerArtifactDigest=(value:Pick<RuntimeReducer,"id"|"schema"|"implementationDigest"|"derivations">)=>digest({id:value.id,schema:value.schema,implementationDigest:value.implementationDigest,derivations:value.derivations??{}},"runtime-reducer-artifact");

type Staged = {
  envelope?: NativeEventEnvelope;
  nativeDigest: string;
  portable?: PortableEventV2;
  status: "ingested" | "lifted" | "accepted" | "purged";
};
export type RuntimeEventStoreState = {
  schema: "autonomy.runtime-event-store.v1";
  tenant: string;
  generation: number;
  lastIngestSequence: number;
  observedHighWater: number;
  staged: Record<string, Staged>;
  history?: AcceptedCausalHistory;
  acceptancePolicyDigest?: string;
  projection?: {
    reducer: string;
    reducerImplementationDigest: string;
    schema: string;
    value: unknown;
    historyDigest: string;
  };
  provenance: Record<string, RuntimeProvenance>;
  gaps: RuntimeGap[];
  snapshots: Record<string, RuntimeSnapshot>;
  purges: PurgeEvidence[];
  purgeTransactions: Record<string,RuntimePurgeTransaction>;
  retentionRules: RuntimeRetentionRule[];
  derivations: Record<string,string[]>;
  erasureEvidence: RuntimeErasureEvidence[];
  privacyResiduals: RuntimePrivacyResidual[];
  migrationLog: Array<{
    id: string;
    from: string;
    to: string;
    implementationDigest: string;
    preimageDigest: string;
    atGeneration: number;
    rollback: boolean;
  }>;
  digest: string;
  signature: string;
};

export interface RuntimeEventTrust {
  verifyNative(digest: string, signature: string): boolean;
  verifyAuthority(authority: RuntimeAuthority): boolean;
  verifyArtifact(
    kind: "reducer" | "migration" | "acceptance-policy",
    id: string,
    implementationDigest: string,
    signature: string,
  ): boolean;
  signState(digest: string): string;
  verifyState(digest: string, signature: string): boolean;
  signSnapshot(digest: string): string;
  verifySnapshot(digest: string, signature: string): boolean;
}
export type RuntimeAcceptancePolicyAttestation={digest:string;signature:string};
export const runtimeAcceptancePolicyDigest=(policy:CausalAcceptancePolicy)=>digest(policy,"runtime-acceptance-policy");
export interface RuntimePurgeAuthority {
  record(evidence: Omit<PurgeEvidence, "signature">): string;
  lookup(evidenceId: string): PurgeEvidence | undefined;
  verify(evidence: PurgeEvidence): boolean;
  isPurged(tenant: string, nativeDigest: string): boolean;
}
export interface RuntimePhysicalErasurePort{lookup(transactionId:string):RuntimeErasureEvidence[]|undefined;erase(input:{tenant:string;transactionId:string;locations:string[]}):RuntimeErasureEvidence[];verify(evidence:RuntimeErasureEvidence):boolean;}
export interface RuntimeEventStoreBackend {
  load(tenant: string): RuntimeEventStoreState | undefined;
  compareAndSwap(
    tenant: string,
    expected: number | undefined,
    next: RuntimeEventStoreState,
  ): boolean;
}
export class MemoryRuntimeEventStoreBackend implements RuntimeEventStoreBackend {
  private values = new Map<string, RuntimeEventStoreState>();
  load(id: string) {
    const v = this.values.get(id);
    return v && structuredClone(v);
  }
  compareAndSwap(id: string, e: number | undefined, n: RuntimeEventStoreState) {
    if (this.values.get(id)?.generation !== e) return false;
    this.values.set(id, structuredClone(n));
    return true;
  }
}
export class FileRuntimeEventStoreBackend implements RuntimeEventStoreBackend {
  constructor(private root: string) {
    mkdirSync(root, { recursive: true });
  }
  private path(id: string) {
    return join(
      this.root,
      `${semanticDigest(id, "runtime-event-store-tenant").value}.json`,
    );
  }
  load(id: string) {
    try {
      return JSON.parse(
        readFileSync(this.path(id), "utf8"),
      ) as RuntimeEventStoreState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: RuntimeEventStoreState,
  ) {
    const path = this.path(id),
      lock = `${path}.lock`,
      owner = this.acquire(lock);
    try {
      if (this.load(id)?.generation !== expected) return false;
      const temporary = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`,
        fd = openSync(temporary, "wx", 0o600);
      try {
        writeFileSync(fd, canonicalSemanticJson(next), "utf8");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, path);
      const directory = openSync(this.root, "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
      return true;
    } finally {
      try {
        const observed = JSON.parse(
          readFileSync(join(lock, "owner.json"), "utf8"),
        );
        if (observed.token === owner.token)
          rmSync(lock, { recursive: true, force: true });
      } catch {}
    }
  }
  private acquire(lock: string) {
    const wait = (ms: number) =>
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    const owner = {
      pid: process.pid,
      start: processStart(process.pid),
      token: `${process.pid}:${Date.now()}:${Math.random()}`,
    };
    for (let n = 0; n < 3000; n++)
      try {
        mkdirSync(lock);
        writeFileSync(join(lock, "owner.json"), canonicalSemanticJson(owner), {
          mode: 0o600,
        });
        return owner;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const observed = JSON.parse(
            readFileSync(join(lock, "owner.json"), "utf8"),
          ) as { pid: number; start: string };
          if (!processAlive(observed.pid, observed.start)) {
            rmSync(lock, { recursive: true, force: true });
            continue;
          }
        } catch {}
        wait(10);
      }
    throw new Error("runtime event store lock timeout");
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

const digest = (v: unknown, domain: string) => semanticDigest(v, domain).value;
const MAX_EVENTS = 100_000;
const MAX_ENVELOPE_BYTES = 1_048_576,
  MAX_PROJECTION_BYTES = 10_485_760,
  MAX_STATE_BYTES = 67_108_864,
  MAX_SNAPSHOTS = 1_000,
  MAX_PATHS = 1_000;
export const runtimeMigrationDigest = (
  value: Pick<
    ReducerMigration,
    | "id"
    | "from"
    | "to"
    | "eventSchema"
    | "implementationDigest"
    | "inverseImplementationDigest"
  >,
) =>
  digest(
    {
      id: value.id,
      from: value.from,
      to: value.to,
      eventSchema: value.eventSchema,
      implementationDigest: value.implementationDigest,
      inverseImplementationDigest: value.inverseImplementationDigest,
    },
    "runtime-reducer-migration",
  );
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const bounded = (v: unknown, n = 4096): v is string =>
  typeof v === "string" && v.length > 0 && Buffer.byteLength(v) <= n;
function authorize(
  a: RuntimeAuthority,
  tenant: string,
  role: RuntimeAuthority["roles"][number],
  trust: RuntimeEventTrust,
) {
  if (
    a.tenant !== tenant ||
    !bounded(a.principal, 512) ||
    !a.roles.includes(role) ||
    !bounded(a.capability, 4096) ||
    !trust.verifyAuthority(a)
  )
    throw new Error(`${role} authority denied`);
}
export function sealNativeEnvelope(
  body: Omit<NativeEventEnvelope, "digest" | "signature">,
  sign: (digest: string) => string,
): NativeEventEnvelope {
  const d = digest(body, "runtime-native-envelope");
  return { ...structuredClone(body), digest: d, signature: sign(d) };
}
function stateBody(s: RuntimeEventStoreState) {
  const { digest: _, signature: __, ...body } = s;
  return body;
}
function sealState(
  body: Omit<RuntimeEventStoreState, "digest" | "signature">,
  t: RuntimeEventTrust,
): RuntimeEventStoreState {
  const d = digest(body, "runtime-event-store-state");
  return { ...structuredClone(body), digest: d, signature: t.signState(d) };
}

export class PortableRuntimeEventStore {
  constructor(
    readonly tenant: string,
    private trust: RuntimeEventTrust,
    private purgeAuthority: RuntimePurgeAuthority,
    private backend: RuntimeEventStoreBackend,
    private physicalErasure?: RuntimePhysicalErasurePort,
  ) {
    if (!bounded(tenant, 512)) throw new Error("tenant invalid");
  }
  initialize() {
    const old = this.backend.load(this.tenant);
    if (old) return this.verify(old);
    const next = sealState(
      {
        schema: "autonomy.runtime-event-store.v1",
        tenant: this.tenant,
        generation: 1,
        lastIngestSequence: 0,
        observedHighWater: 0,
        staged: {},
        provenance: {},
        gaps: [],
        snapshots: {},
        purges: [],
        purgeTransactions: {},
        retentionRules: [],
        derivations: {},
        erasureEvidence: [],
        privacyResiduals: [],
        migrationLog: [],
      },
      this.trust,
    );
    if (!this.backend.compareAndSwap(this.tenant, undefined, next))
      throw new Error("event store creation race");
    return structuredClone(next);
  }
  current() {
    const s = this.backend.load(this.tenant);
    if (!s) throw new Error("event store not initialized");
    return this.verify(s);
  }
  ingest(
    a: RuntimeAuthority,
    envelope: NativeEventEnvelope,
    highWater = envelope.ingestSequence,
  ) {
    authorize(a, this.tenant, "ingest", this.trust);
    const expected = digest(
      {
        schema: envelope.schema,
        tenant: envelope.tenant,
        ingestSequence: envelope.ingestSequence,
        observation: envelope.observation,
      },
      "runtime-native-envelope",
    );
    if (
      envelope.schema !== "autonomy.native-envelope.v1" ||
      envelope.tenant !== this.tenant ||
      expected !== envelope.digest ||
      !this.trust.verifyNative(envelope.digest, envelope.signature) ||
      !envelope.observation.authenticated
    )
      throw new Error(
        "native envelope authentication or tenant binding failed",
      );
    if (
      Buffer.byteLength(canonicalSemanticJson(envelope)) > MAX_ENVELOPE_BYTES ||
      !Number.isFinite(Date.parse(envelope.observation.at))
    )
      throw new Error("native envelope byte or time bound exceeded");
    if (
      !Number.isSafeInteger(envelope.ingestSequence) ||
      envelope.ingestSequence < 1 ||
      !Number.isSafeInteger(highWater) ||
      highWater < envelope.ingestSequence ||
      highWater > MAX_EVENTS
    )
      throw new Error("native ingest sequence invalid");
    if (this.purgeAuthority.isPurged(this.tenant, envelope.digest))
      throw new Error("irreversibly purged native envelope cannot be replayed");
    return this.mutate((s) => {
      if(s.retentionRules.some(rule=>Date.parse(envelope.observation.at)<Date.parse(rule.cutoff)))throw new Error("native envelope violates durable retention cutoff");
      if (highWater < s.observedHighWater)
        throw new Error("native high-water rollback");
      s.observedHighWater = highWater;
      const prior = s.staged[envelope.observation.id];
      if (prior) {
        if (prior.nativeDigest !== envelope.digest)
          throw new Error("native identity equivocation");
        this.refreshPartitionGaps(s);
        return;
      }
      const archived = s.provenance[envelope.observation.id];
      if (archived) {
        if (archived.nativeDigest !== envelope.digest)
          throw new Error("archived native identity equivocation");
        return;
      }
      if (Object.keys(s.staged).length >= MAX_EVENTS)
        throw new Error("native event resource bound exceeded");
      const sameSequence = Object.values(s.provenance).find(
        (p) => p.ingestSequence === envelope.ingestSequence,
      );
      if (sameSequence) throw new Error("native ingest sequence equivocation");
      s.lastIngestSequence = Math.max(
        s.lastIngestSequence,
        envelope.ingestSequence,
      );
      s.staged[envelope.observation.id] = {
        envelope: structuredClone(envelope),
        nativeDigest: envelope.digest,
        status: "ingested",
      };
      s.provenance[envelope.observation.id] = {
        nativeId: envelope.observation.id,
        nativeDigest: envelope.digest,
        ingestSequence: envelope.ingestSequence,
        stages: { ingestedBy: a.principal },
      };
      s.projection = undefined;
      this.refreshPartitionGaps(s);
    });
  }
  markPartition(a: RuntimeAuthority, from: number, to: number) {
    authorize(a, this.tenant, "ingest", this.trust);
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 1 ||
      to < from ||
      to > MAX_EVENTS
    )
      throw new Error("partition range invalid");
    return this.mutate((s) => {
      s.observedHighWater = Math.max(s.observedHighWater, to);
      s.gaps.push({
        kind: "partition",
        id: `${from}:${to}`,
        detail: `native sequences ${from}..${to} unavailable`,
      });
      this.refreshPartitionGaps(s);
    });
  }
  lift(a: RuntimeAuthority, nativeId: string, adapter: NativeLiftAdapter) {
    authorize(a, this.tenant, "lift", this.trust);
    return this.mutate((s) => {
      const item = s.staged[nativeId];
      if (!item?.envelope)
        throw new Error("native event unavailable or purged");
      if (item.status !== "ingested" && item.portable) {
        if (s.provenance[nativeId]!.adapterId !== adapter.id)
          throw new Error("lift adapter equivocation");
        return;
      }
      const result = liftNativeObservation(item.envelope.observation, adapter);
      if (result.errors.length) throw new Error(result.errors.join("; "));
      if (!result.event) {
        s.gaps.push({
          kind: "lift",
          id: nativeId,
          detail: result.gap ?? "unliftable native event",
        });
        return;
      }
      if (s.provenance[nativeId]!.stages.ingestedBy === a.principal)
        throw new Error("lift authority must be independent of ingest");
      item.portable = result.event;
      item.status = "lifted";
      s.provenance[nativeId]!.portableId = result.event.id;
      s.provenance[nativeId]!.adapterId = adapter.id;
      s.provenance[nativeId]!.stages.liftedBy = a.principal;
      s.projection = undefined;
      s.gaps = s.gaps.filter((g) => !(g.kind === "lift" && g.id === nativeId));
    });
  }
  accept(a: RuntimeAuthority, policy: CausalAcceptancePolicy,attestation:RuntimeAcceptancePolicyAttestation) {
    authorize(a, this.tenant, "accept", this.trust);
    const authenticatedPolicyDigest=runtimeAcceptancePolicyDigest(policy);
    if(attestation.digest!==authenticatedPolicyDigest||!this.trust.verifyArtifact("acceptance-policy",policy.reducer,attestation.digest,attestation.signature))throw new Error("acceptance policy attestation failed");
    return this.mutate((s) => {
      const policyDigest = authenticatedPolicyDigest;
      if (
        s.acceptancePolicyDigest &&
        s.history?.reducer === policy.reducer &&
        s.acceptancePolicyDigest !== policyDigest
      )
        throw new Error("acceptance policy provenance mismatch");
      const liftedById = new Map<string, PortableEventV2>();
      for (const event of Object.values(s.history?.events ?? {}))
        liftedById.set(event.id, event);
      for (const value of Object.values(s.staged))
        if (value.portable) liftedById.set(value.portable.id, value.portable);
      const lifted = [...liftedById.values()];
      for (const [id, p] of Object.entries(s.provenance))
        if (
          p.portableId &&
          [p.stages.ingestedBy, p.stages.liftedBy].includes(a.principal)
        )
          throw new Error(`accept authority is not independent for ${id}`);
      const accepted = acceptCausalHistory(lifted, policy);
      if (accepted.errors.length) throw new Error(accepted.errors.join("; "));
      s.gaps = s.gaps.filter((g) => g.kind !== "causal-parent");
      for (const id of accepted.pending)
        s.gaps.push({
          kind: "causal-parent",
          id,
          detail: "portable parent has not arrived",
        });
      if (!accepted.history) return;
      s.history = accepted.history;
      s.acceptancePolicyDigest = policyDigest;
      s.projection = undefined;
      accepted.history.order.forEach((portableId, index) => {
        const entry = Object.values(s.provenance).find(
          (p) => p.portableId === portableId,
        );
        if (entry) {
          entry.logicalIndex = index;
          entry.stages.acceptedBy = a.principal;
          const staged = s.staged[entry.nativeId];
          if (staged && staged.status !== "purged") staged.status = "accepted";
        }
      });
    });
  }
  project(a: RuntimeAuthority, reducer: RuntimeReducer) {
    authorize(a, this.tenant, "project", this.trust);
    return this.mutate((s) => {
      if (!s.history || s.history.reducer !== reducer.id)
        throw new Error("accepted history/reducer mismatch");
      const reducerArtifactDigest=runtimeReducerArtifactDigest(reducer);
      if (
        !this.trust.verifyArtifact(
          "reducer",
          reducer.id,
          reducerArtifactDigest,
          reducer.artifactSignature,
        )
      )
        throw new Error("reducer implementation attestation failed");
      for (const p of Object.values(s.provenance))
        if (
          [
            p.stages.ingestedBy,
            p.stages.liftedBy,
            p.stages.acceptedBy,
          ].includes(a.principal)
        )
          throw new Error(
            "project authority must be independent of prior stages",
          );
      let value = reducer.initial();
      for (const id of s.history.active)
        value = reducer.apply(
          structuredClone(value),
          structuredClone(s.history.events[id]!),
        );
      const historyDigest = digest(s.history, "accepted-causal-history");
      if (
        Buffer.byteLength(canonicalSemanticJson(value)) > MAX_PROJECTION_BYTES
      )
        throw new Error("projection byte bound exceeded");
      s.projection = {
        reducer: reducer.id,
        reducerImplementationDigest: reducerArtifactDigest,
        schema: reducer.schema,
        value: structuredClone(value),
        historyDigest,
      };
      s.derivations=Object.fromEntries(Object.entries(reducer.derivations??{}).map(([source,targets])=>[source,[...new Set(targets)].sort()]));
      for (const p of Object.values(s.provenance))
        if (p.logicalIndex !== undefined) p.stages.projectedBy = a.principal;
    });
  }
  snapshot(a: RuntimeAuthority, id: string) {
    authorize(a, this.tenant, "project", this.trust);
    if (!bounded(id, 512)) throw new Error("snapshot id invalid");
    return this.mutate((s) => {
      if (!s.projection || !s.history) throw new Error("nothing materialized");
      const currentHistoryDigest = digest(s.history, "accepted-causal-history");
      if (s.projection.historyDigest !== currentHistoryDigest)
        throw new Error("stale projection cannot be snapshotted");
      if (s.snapshots[id]) throw new Error("snapshot id is immutable");
      if (Object.keys(s.snapshots).length >= MAX_SNAPSHOTS)
        throw new Error("snapshot cardinality bound exceeded");
      const body = {
        id,
        generation: s.generation + 1,
        eventHighWater: s.observedHighWater,
        reducer: s.projection.reducer,
        reducerImplementationDigest: s.projection.reducerImplementationDigest,
        schema: s.projection.schema,
        projection: structuredClone(s.projection.value),
        historyDigest: s.projection.historyDigest,
        purgeHighWater: s.purges.at(-1)?.sequence ?? 0,
      };
      const d = digest(body, "runtime-event-snapshot");
      s.snapshots[id] = {
        ...body,
        digest: d,
        signature: this.trust.signSnapshot(d),
      };
    });
  }
  compact(a: RuntimeAuthority, snapshotId: string) {
    authorize(a, this.tenant, "project", this.trust);
    return this.mutate((s) => {
      const snap = s.snapshots[snapshotId];
      if (
        !snap ||
        snap.digest !== this.snapshotDigest(snap) ||
        !this.trust.verifySnapshot(snap.digest, snap.signature)
      )
        throw new Error("trusted snapshot required for compaction");
      for (const [id, item] of Object.entries(s.staged))
        if (item.status === "accepted") delete s.staged[id];
    });
  }
  declareDerivations(a:RuntimeAuthority,reducer:RuntimeReducer) {
    authorize(a,this.tenant,"privacy",this.trust);
    const artifactDigest=runtimeReducerArtifactDigest(reducer);if(!this.trust.verifyArtifact("reducer",reducer.id,artifactDigest,reducer.artifactSignature))throw new Error("derivation artifact attestation failed");
    const current=this.current();
    if(current.history?.reducer!==reducer.id||current.projection?.reducer!==reducer.id||current.projection.reducerImplementationDigest!==artifactDigest)throw new Error("derivation artifact does not match the active projected reducer");
    const graph=reducer.derivations??{};
    const entries=Object.entries(graph);
    if(entries.length>10_000||entries.some(([source,targets])=>!bounded(source,1024)||targets.length>1_000||targets.some(target=>!bounded(target,1024))))throw new Error("derivation graph bound exceeded");
    return this.mutate(s=>{s.derivations=Object.fromEntries(entries.sort(([a],[b])=>a.localeCompare(b)).map(([source,targets])=>[source,[...new Set(targets)].sort()]));});
  }
  purge(
    a: RuntimeAuthority,
    input: {
      eventIds: string[];
      nativeIds: string[];
      paths: string[];
      physicalLocations?:string[];
      at: string;
    },
  ) {
    authorize(a, this.tenant, "privacy", this.trust);
    if (
      !Number.isFinite(Date.parse(input.at)) ||
      input.eventIds.length + input.nativeIds.length > 10_000 ||
      input.paths.length > MAX_PATHS ||
      (input.physicalLocations?.length??0)>MAX_PATHS||
      input.paths.some((p) => !bounded(p, 1024)) ||
      (input.physicalLocations??[]).some((p) => !bounded(p, 4096))
    )
      throw new Error("purge request invalid");
    const graph=this.current().derivations,selected=new Set(input.paths),queue=[...input.paths];
    while(queue.length){const source=queue.shift()!;for(const derived of graph[source]??[])if(!selected.has(derived)){selected.add(derived);queue.push(derived)}}
    const missing=[...selected].filter(path=>!input.paths.includes(path));
    if(missing.length)throw new Error(`purge is not derivation-closed: ${missing.join(",")}`);
    const requested={tenant:this.tenant,eventIds:[...new Set(input.eventIds)].sort(),nativeIds:[...new Set(input.nativeIds)].sort(),paths:[...new Set(input.paths)].sort(),physicalLocations:[...new Set(input.physicalLocations??[])].sort(),at:input.at},transactionId=digest(requested,"runtime-purge-transaction");
    this.mutate((s) => {
      const existing=s.purgeTransactions[transactionId];if(existing){if(existing.status==="committed")return;return;}
      const prior = s.purges.at(-1),
        nativeIds = requested.nativeIds,
        nativeDigests = nativeIds
          .flatMap((id) =>
            s.staged[id]?.nativeDigest ? [s.staged[id]!.nativeDigest] : [],
          )
          .sort(),
        core = {
          tenant: this.tenant,
          eventIds: requested.eventIds,
          nativeIds,
          nativeDigests,
          paths: requested.paths,
          at: input.at,
          sequence: (prior?.sequence ?? 0) + 1,
          previous: prior?.digest ?? null,
        },
        body = { id: digest(core, "runtime-purge-id"), ...core };
      const d = digest(body, "runtime-purge-evidence");s.purgeTransactions[transactionId]={id:transactionId,status:"prepared",evidence:{...body,digest:d}};
    });
    const prepared=this.current().purgeTransactions[transactionId];if(!prepared)throw new Error("purge prepare lost");
    if(prepared.status==="committed")return this.current();
    const recorded=this.purgeAuthority.lookup(prepared.evidence.id);
    if(recorded){const{signature:_recordedSignature,...recordedBody}=recorded;if(canonicalSemanticJson(recordedBody)!==canonicalSemanticJson(prepared.evidence))throw new Error("purge authority evidence equivocation");}
    const signature=recorded?.signature??this.purgeAuthority.record(prepared.evidence),e: PurgeEvidence={...prepared.evidence,signature};
    const confirmed=this.purgeAuthority.lookup(prepared.evidence.id);
    if(!confirmed||canonicalSemanticJson(confirmed)!==canonicalSemanticJson(e)||!this.purgeAuthority.verify(confirmed))throw new Error("purge authority did not durably record idempotent evidence");
    const priorErasures=this.physicalErasure?.lookup(transactionId),erasures=priorErasures??this.physicalErasure?.erase({tenant:this.tenant,transactionId,locations:requested.physicalLocations})??requested.physicalLocations.map(location=>({transactionId,location,status:"unverified" as const,digest:digest({transactionId,location,status:"unverified"},"runtime-physical-erasure"),signature:"unverified"}));
    if(this.physicalErasure){const durable=this.physicalErasure.lookup(transactionId);if(!durable||canonicalSemanticJson(durable)!==canonicalSemanticJson(erasures))throw new Error("physical erasure was not durably idempotent");}
    return this.mutate((s) => {
      const tx=s.purgeTransactions[transactionId];if(!tx)throw new Error("purge transaction missing");if(tx.status==="committed")return;
      if(digest(tx.evidence,"runtime-purge-transaction-evidence")!==digest(prepared.evidence,"runtime-purge-transaction-evidence"))throw new Error("purge transaction equivocation");
      if (!this.purgeAuthority.verify(e))
        throw new Error("purge authority rejected evidence");
      for (const nativeId of e.nativeIds) {
        const item = s.staged[nativeId];
        if (item) {
          delete item.envelope;
          delete item.portable;
          item.status = "purged";
        }
        s.gaps.push({
          kind: "purged",
          id: nativeId,
          detail: `irreversible purge ${e.id}`,
        });
      }
      for (const eventId of e.eventIds)
        if (s.history?.events[eventId]) {
          const event = s.history.events[eventId]!,
            { integrity: _, ...unsigned } = event;
          unsigned.payload = { _purged: e.id };
          event.payload = unsigned.payload;
          event.integrity = sealPortableEvent(
            unsigned,
            event.integrity.authenticated,
          ).integrity;
          s.history.active = s.history.active.filter((id) => id !== eventId);
        }
      for (const path of e.paths) {
        this.redactPath(s.projection?.value, path, e.id);
      }
      s.purges.push(e);
      for(const location of requested.physicalLocations){const proof=erasures.find(value=>value.location===location&&value.transactionId===transactionId);if(proof&&proof.status==="erased"&&this.physicalErasure?.verify(proof))s.erasureEvidence.push(structuredClone(proof));else s.privacyResiduals.push({transactionId,location,reason:"physical media or backup erasure is not verified"});}
      if(!requested.physicalLocations.length)s.privacyResiduals.push({transactionId,location:"unscoped-storage",reason:"no physical state, snapshot, backup, temporary-file, or media locations were declared"});
      s.privacyResiduals.push({transactionId,location:"retained-audit-metadata",reason:"event identifiers, native digests, timestamps, and causal commitments remain in purge evidence"});
      tx.status="committed";tx.signature=signature;
      s.projection = undefined;
    });
  }
  enforceRetention(a: RuntimeAuthority, cutoff: string, paths: string[] = []) {
    authorize(a, this.tenant, "privacy", this.trust);
    if (!Number.isFinite(Date.parse(cutoff)))
      throw new Error("retention cutoff invalid");
    const ruleBody={cutoff,paths:[...new Set(paths)].sort()},ruleId=digest(ruleBody,"runtime-retention-rule");
    this.mutate(s=>{if(!s.retentionRules.some(r=>r.id===ruleId))s.retentionRules.push({id:ruleId,...ruleBody,createdAt:new Date().toISOString()});});
    const s = this.current(),rule=s.retentionRules.find(r=>r.id===ruleId)!,
      nativeIds = Object.entries(s.staged)
        .filter(([, v]) => {
          const at = v.envelope?.observation.at ?? v.portable?.at;
          return at && Date.parse(at) < Date.parse(cutoff);
        })
        .map(([id]) => id),
      eventIds = nativeIds.flatMap((id) =>
        s.provenance[id]?.portableId ? [s.provenance[id]!.portableId!] : [],
      );
    return this.purge(a, {
      eventIds,
      nativeIds,
      paths,
      at: rule.createdAt,
    });
  }
  migrate(
    a: RuntimeAuthority,
    m: ReducerMigration,
    to: CausalAcceptancePolicy,
  ) {
    authorize(a, this.tenant, "migration", this.trust);
    return this.mutate((s) => {
      if (s.purges.length)
        throw new Error(
          "migration after irreversible purge requires a tombstone-preserving migration",
        );
      if (
        !s.history ||
        s.history.reducer !== m.from ||
        m.to !== to.reducer ||
        m.eventSchema !== to.eventSchema ||
        m.digest !== runtimeMigrationDigest(m)
      )
        throw new Error("migration provenance/version mismatch");
      if (
        !this.trust.verifyArtifact(
          "migration",
          m.id,
          m.implementationDigest,
          m.artifactSignature,
        )
      )
        throw new Error("migration implementation attestation failed");
      const preimageDigest = digest(
        s.history.order.map((id) => {
          const { integrity: _, ...body } = s.history!.events[id]!;
          return body;
        }),
        "runtime-migration-preimage",
      );
      const events = s.history.order.map((id) =>
        sealPortableEvent(
          m.map(structuredClone(s.history!.events[id]!)),
          s.history!.events[id]!.integrity.authenticated,
        ),
      );
      const accepted = acceptCausalHistory(events, to);
      if (!accepted.history || accepted.errors.length)
        throw new Error(
          `migration acceptance failed: ${accepted.errors.join("; ")}`,
        );
      s.history = accepted.history;
      s.projection = undefined;
      s.migrationLog.push({
        id: m.id,
        from: m.from,
        to: m.to,
        implementationDigest: m.implementationDigest,
        preimageDigest,
        atGeneration: s.generation + 1,
        rollback: false,
      });
      for (const item of Object.values(s.staged))
        if (item.portable) {
          const migrated = events.find((e) => e.id === item.portable!.id);
          if (migrated) item.portable = migrated;
        }
    });
  }
  rollbackMigration(
    a: RuntimeAuthority,
    m: ReducerMigration,
    to: CausalAcceptancePolicy,
  ) {
    authorize(a, this.tenant, "migration", this.trust);
    if (!m.inverse) throw new Error("migration has no authenticated inverse");
    if (
      !m.inverseImplementationDigest ||
      !m.inverseArtifactSignature ||
      !this.trust.verifyArtifact(
        "migration",
        `rollback:${m.id}`,
        m.inverseImplementationDigest,
        m.inverseArtifactSignature,
      )
    )
      throw new Error("migration inverse attestation failed");
    const before = this.current(),
      originalLog = before.migrationLog.find(
        (entry) => entry.id === m.id && !entry.rollback,
      );
    if (!originalLog) throw new Error("migration rollback provenance missing");
    const inverseImplementationDigest = m.inverseImplementationDigest!;
    const restoredBodies = (before.history?.order ?? []).map((id) =>
      m.inverse!(structuredClone(before.history!.events[id]!)),
    );
    if (
      digest(restoredBodies, "runtime-migration-preimage") !==
      originalLog.preimageDigest
    )
      throw new Error("migration inverse roundtrip failed");
    for (const event of Object.values(this.current().history?.events ?? {})) {
      const restored = m.inverse(structuredClone(event)),
        roundtrip = m.map(
          sealPortableEvent(restored, event.integrity.authenticated),
        );
      const { integrity: _, ...original } = event;
      if (canonicalSemanticJson(roundtrip) !== canonicalSemanticJson(original))
        throw new Error("migration inverse roundtrip failed");
    }
    const inverse: ReducerMigration = {
      id: `rollback:${m.id}`,
      from: m.to,
      to: m.from,
      eventSchema: m.eventSchema,
      implementationDigest: inverseImplementationDigest,
      artifactSignature: m.inverseArtifactSignature,
      inverseImplementationDigest: m.implementationDigest,
      inverseArtifactSignature: m.artifactSignature,
      digest: digest(
        {
          id: `rollback:${m.id}`,
          from: m.to,
          to: m.from,
          eventSchema: m.eventSchema,
          implementationDigest: inverseImplementationDigest,
          inverseImplementationDigest: m.implementationDigest,
        },
        "runtime-reducer-migration",
      ),
      map: m.inverse,
      inverse: m.map,
    };
    const out = this.migrate(a, inverse, to);
    return this.mutate((s) => {
      s.migrationLog.push({
        id: m.id,
        from: m.to,
        to: m.from,
        implementationDigest: inverseImplementationDigest,
        preimageDigest: originalLog.preimageDigest,
        atGeneration: s.generation + 1,
        rollback: true,
      });
    });
  }
  query(
    a: RuntimeAuthority,
    input: {
      consistency: "strong" | "snapshot";
      minimumGeneration?: number;
      snapshotId?: string;
    },
  ) {
    authorize(a, this.tenant, "query", this.trust);
    const s = this.current();
    if (input.consistency === "strong") {
      if (
        input.minimumGeneration !== undefined &&
        s.generation < input.minimumGeneration
      )
        throw new Error("strong read generation unavailable");
      if (input.snapshotId)
        throw new Error("strong query cannot select snapshot");
      return structuredClone(s.projection);
    }
    const snap = input.snapshotId && s.snapshots[input.snapshotId];
    if (
      snap &&
      input.minimumGeneration !== undefined &&
      snap.generation < input.minimumGeneration
    )
      throw new Error("snapshot generation unavailable");
    if (
      !snap ||
      snap.digest !== this.snapshotDigest(snap) ||
      !this.trust.verifySnapshot(snap.digest, snap.signature) ||
      snap.purgeHighWater < (s.purges.at(-1)?.sequence ?? 0)
    )
      throw new Error("snapshot absent, untrusted, or predates purge");
    return {
      reducer: snap.reducer,
      schema: snap.schema,
      value: structuredClone(snap.projection),
      historyDigest: snap.historyDigest,
    };
  }
  trace() {
    const s = this.current();
    return Object.values(s.provenance)
      .sort((a, b) => a.ingestSequence - b.ingestSequence)
      .map((p) => structuredClone(p));
  }
  privacyStatus(){const s=this.current(),physical=s.privacyResiduals.filter(r=>r.location!=="retained-audit-metadata"),physicallyVerified=physical.length===0;return{physicalLocationsVerified:physicallyVerified,fullyVerified:s.privacyResiduals.length===0,physicallyVerified,residuals:structuredClone(s.privacyResiduals),evidence:structuredClone(s.erasureEvidence)};}
  private mutate(change: (s: RuntimeEventStoreState) => void) {
    for (let n = 0; n < 12; n++) {
      const old = this.current(),
        next = structuredClone(old);
      change(next);
      next.generation++;
      const sealed = sealState(stateBody(next), this.trust);
      if (Buffer.byteLength(canonicalSemanticJson(sealed)) > MAX_STATE_BYTES)
        throw new Error("event store aggregate byte bound exceeded");
      if (this.backend.compareAndSwap(this.tenant, old.generation, sealed))
        return structuredClone(sealed);
    }
    throw new Error("event store CAS contention");
  }
  private verify(s: RuntimeEventStoreState) {
    const expected = digest(stateBody(s), "runtime-event-store-state");
    if (
      s.schema !== "autonomy.runtime-event-store.v1" ||
      s.tenant !== this.tenant ||
      !Number.isSafeInteger(s.generation) ||
      s.generation < 1 ||
      s.observedHighWater > MAX_EVENTS ||
      Object.keys(s.provenance).length>MAX_EVENTS||Object.keys(s.staged).length>MAX_EVENTS||Object.keys(s.snapshots).length>MAX_SNAPSHOTS||s.gaps.length>MAX_EVENTS||s.purges.length>MAX_EVENTS||Object.keys(s.purgeTransactions??{}).length>MAX_EVENTS||s.retentionRules.length>MAX_EVENTS||s.migrationLog.length>MAX_EVENTS||Object.keys(s.derivations).length>MAX_EVENTS||Object.values(s.derivations).reduce((count,values)=>count+values.length,0)>MAX_EVENTS||s.erasureEvidence.length>MAX_EVENTS||s.privacyResiduals.length>MAX_EVENTS||
      Buffer.byteLength(canonicalSemanticJson(s)) > MAX_STATE_BYTES ||
      s.digest !== expected ||
      !this.trust.verifyState(expected, s.signature)
    )
      throw new Error("event store checkpoint integrity failure");
    if(s.erasureEvidence.some(e=>!this.physicalErasure?.verify(e)))throw new Error("physical erasure evidence verification failed");
    for (const [id, item] of Object.entries(s.staged)) {
      const provenance = s.provenance[id];
      if (
        !provenance ||
        provenance.nativeId !== id ||
        provenance.nativeDigest !== item.nativeDigest ||
        (item.portable && provenance.portableId !== item.portable.id)
      )
        throw new Error("event store provenance cross-link failure");
    }
    if (s.history) {
      s.history.order.forEach((id, index) => {
        const event = s.history!.events[id],
          entry = Object.values(s.provenance).find(
            (value) => value.portableId === id,
          );
        if (!event || !entry || entry.logicalIndex !== index)
          throw new Error("event store history cross-link failure");
      });
      if (
        s.projection &&
        s.projection.historyDigest !==
          digest(s.history, "accepted-causal-history")
      )
        throw new Error("event store stale projection invariant failure");
    }
    let previous: string | null = null;
    for (let i = 0; i < s.purges.length; i++) {
      const e = s.purges[i]!,
        { signature: _, digest: observed, ...body } = e;
      if (
        e.tenant !== this.tenant ||
        e.sequence !== i + 1 ||
        e.previous !== previous ||
        observed !== digest(body, "runtime-purge-evidence") ||
        !this.purgeAuthority.verify(e)
      )
        throw new Error("purge chain authentication failed");
      previous = e.digest;
    }
    return structuredClone(s);
  }
  private snapshotDigest(s: RuntimeSnapshot) {
    const { digest: _, signature: __, ...body } = s;
    return digest(body, "runtime-event-snapshot");
  }
  private refreshPartitionGaps(s: RuntimeEventStoreState) {
    const present = new Set(
      Object.values(s.provenance).map((p) => p.ingestSequence),
    );
    s.gaps = s.gaps.filter((g) => g.kind !== "partition");
    for (let n = 1; n <= s.observedHighWater; n++)
      if (!present.has(n))
        s.gaps.push({
          kind: "partition",
          id: String(n),
          detail: `native sequence ${n} unavailable`,
        });
  }
  private redactPath(value: unknown, path: string, purgeId: string) {
    if (!record(value)) return;
    const parts = path.split(".");
    let at: Record<string, unknown> = value;
    for (const key of parts.slice(0, -1)) {
      if (!record(at[key])) return;
      at = at[key] as Record<string, unknown>;
    }
    if (parts.length) at[parts.at(-1)!] = { _purged: purgeId };
  }
}
