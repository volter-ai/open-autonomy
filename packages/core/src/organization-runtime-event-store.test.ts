import { describe, expect, test } from "bun:test";
import {
  sealPortableEvent,
  type CausalAcceptancePolicy,
  type NativeLiftAdapter,
  type PortableEventV2,
} from "./organization-causal-state";
import {
  FileRuntimeEventStoreBackend,
  MemoryRuntimeEventStoreBackend,
  PortableRuntimeEventStore,
  runtimeMigrationDigest,
  runtimeAcceptancePolicyDigest,
  runtimeReducerArtifactDigest,
  sealNativeEnvelope,
  type NativeEventEnvelope,
  type PurgeEvidence,
  type ReducerMigration,
  type RuntimeAuthority,
  type RuntimeEventStoreBackend,
  type RuntimeReducer,
} from "./organization-runtime-event-store";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { semanticDigest } from "./organization-canonical";

const trust = {
  verifyNative: (d: string, s: string) => s === `native:${d}`,
  verifyAuthority: (a: RuntimeAuthority) =>
    a.capability === `cap:${a.tenant}:${a.principal}:${a.roles.join(",")}`,
  verifyArtifact: (_kind: string, id: string, d: string, s: string) =>
    s === `artifact:${id}:${d}`,
  signState: (d: string) => `state:${d}`,
  verifyState: (d: string, s: string) => s === `state:${d}`,
  signSnapshot: (d: string) => `snapshot:${d}`,
  verifySnapshot: (d: string, s: string) => s === `snapshot:${d}`,
};
class Purges {
  seen = new Set<string>();
  records = new Map<string,PurgeEvidence>();
  record(e: Omit<PurgeEvidence, "signature">) {
    e.nativeDigests.forEach((d) => this.seen.add(d));
    const signature=`purge:${e.digest}`;this.records.set(e.id,{...structuredClone(e),signature});return signature;
  }
  lookup(id:string){const value=this.records.get(id);return value&&structuredClone(value)}
  verify(e: PurgeEvidence) {
    return e.signature === `purge:${e.digest}`;
  }
  isPurged(_t: string, d: string) {
    return this.seen.has(d);
  }
}
const authority = (
  principal: string,
  role: RuntimeAuthority["roles"][number],
  tenant = "tenant",
): RuntimeAuthority => ({
  tenant,
  principal,
  roles: [role],
  capability: `cap:${tenant}:${principal}:${role}`,
});
const policy = (reducer = "r1"): CausalAcceptancePolicy => ({
  eventSchema: "autonomy.event.v2",
  reducer,
  maximumEvents: 100,
  issuers: [
    {
      issuer: "native-system",
      eventTypes: ["value.set"],
      subjects: ["value"],
      requireAuthenticated: true,
    },
  ],
  contracts: {
    "value.set": {
      type: "value.set",
      reads: [],
      writes: ["values.$subject"],
      resolution: "id-order",
    },
  },
});
const policyAttestation=(value:CausalAcceptancePolicy)=>{const digest=runtimeAcceptancePolicyDigest(value);return{digest,signature:`artifact:${value.reducer}:${digest}`}};
const adapter = (reducer = "r1"): NativeLiftAdapter => ({
  id: `adapter-${reducer}`,
  provider: "fixture",
  nativeSchema: "fixture.event",
  nativeVersion: "1",
  portableTypes: ["value.set"],
  lift(o) {
    return {
      schema: "autonomy.event.v2",
      reducer,
      id: `portable-${o.id}`,
      type: "value.set",
      at: o.at,
      issuer: "native-system",
      actor: "worker",
      subject: { kind: "value", id: String(o.data.key) },
      parents: Array.isArray(o.data.parents) ? o.data.parents.map(String) : [],
      epistemic: "observation",
      provenance: [o.provenance],
      payload: { key: o.data.key, value: o.data.value, secret: o.data.secret },
    };
  },
});
function envelope(
  sequence: number,
  key: string,
  value: unknown,
  parents: string[] = [],
  secret = "sensitive",
  tenant = "tenant",
): NativeEventEnvelope {
  const body = {
    schema: "autonomy.native-envelope.v1" as const,
    tenant,
    ingestSequence: sequence,
    observation: {
      provider: "fixture",
      schema: "fixture.event",
      version: "1",
      id: `native-${sequence}`,
      at: `2026-07-${String(sequence).padStart(2, "0")}T00:00:00Z`,
      data: { key, value, parents, secret },
      provenance: {
        uri: `fixture://native/${sequence}`,
        digest: `source-${sequence}`,
      },
      authenticated: true,
    },
  };
  return sealNativeEnvelope(body, (d) => `native:${d}`);
}
const reducer = (id = "r1",derivations:Record<string,string[]>={}): RuntimeReducer => {const base={
  id,schema: `projection.${id}`,implementationDigest: `impl:${id}`,derivations,
  initial: () => ({ values: {} }),
  apply(state:unknown, event:PortableEventV2) {
    const s = state as { values: Record<string, unknown> };
    s.values[String(event.payload!.key)] = {
      value: event.payload!.value,
      secret: event.payload!.secret,
    };
    return s;
  },
};const artifactDigest=runtimeReducerArtifactDigest(base);return{...base,artifactSignature:`artifact:${id}:${artifactDigest}`}};
function fixture(
  backend: RuntimeEventStoreBackend = new MemoryRuntimeEventStoreBackend(),
  purges = new Purges(),
) {
  const store = new PortableRuntimeEventStore("tenant", trust, purges, backend);
  store.initialize();
  return { store, backend, purges };
}
function pipeline(
  store: PortableRuntimeEventStore,
  e: NativeEventEnvelope,
  a = adapter(),
) {
  store.ingest(authority("collector", "ingest"), e);
  store.lift(authority("translator", "lift"), e.observation.id, a);
  const value=policy(a.nativeVersion === "never" ? "x" : a.id.replace("adapter-", ""));store.accept(authority("governor", "accept"),value,policyAttestation(value));
}

describe("R18 portable durable runtime event store", () => {
  test("enforces authenticated lift/accept/project stages and reconstructs all four coordinates", () => {
    const { store } = fixture();
    pipeline(store, envelope(1, "alpha", 7));
    store.project(authority("materializer", "project"), reducer());
    expect(
      store.query(authority("reader", "query"), { consistency: "strong" })
        ?.value,
    ).toEqual({ values: { alpha: { value: 7, secret: "sensitive" } } });
    expect(store.trace()).toEqual([
      expect.objectContaining({
        nativeId: "native-1",
        ingestSequence: 1,
        portableId: "portable-native-1",
        logicalIndex: 0,
        adapterId: "adapter-r1",
        stages: {
          ingestedBy: "collector",
          liftedBy: "translator",
          acceptedBy: "governor",
          projectedBy: "materializer",
        },
      }),
    ]);
  });
  test("rejects forged, cross-tenant, and collapsed-authority transitions", () => {
    const { store } = fixture(),
      valid = envelope(1, "a", 1),
      forged = structuredClone(valid);
    forged.observation.data.value = 9;
    expect(() =>
      store.ingest(authority("collector", "ingest"), forged),
    ).toThrow(/authentication/);
    expect(() =>
      store.ingest(
        authority("collector", "ingest"),
        envelope(1, "a", 1, [], "s", "other"),
      ),
    ).toThrow(/tenant/);
    store.ingest(authority("same", "ingest"), valid);
    expect(() =>
      store.lift(authority("same", "lift"), "native-1", adapter()),
    ).toThrow(/independent/);
    expect(() =>
      store.lift(
        authority("translator", "lift", "other"),
        "native-1",
        adapter(),
      ),
    ).toThrow(/authority denied/);
  });
  test("recovers each crash boundary without double acceptance or projection", () => {
    const inner = new MemoryRuntimeEventStoreBackend();
    let crash = true;
    const backend: RuntimeEventStoreBackend = {
      load: (id) => inner.load(id),
      compareAndSwap(id, e, n) {
        if (crash && n.generation === 3) {
          crash = false;
          throw new Error("crash at lift commit");
        }
        return inner.compareAndSwap(id, e, n);
      },
    };
    const first = fixture(backend).store,
      e = envelope(1, "a", 1);
    first.ingest(authority("collector", "ingest"), e);
    expect(() =>
      first.lift(authority("translator", "lift"), "native-1", adapter()),
    ).toThrow(/crash/);
    const restarted = new PortableRuntimeEventStore(
      "tenant",
      trust,
      new Purges(),
      inner,
    );
    restarted.lift(authority("translator", "lift"), "native-1", adapter());
    {const p=policy();restarted.accept(authority("governor", "accept"),p,policyAttestation(p));}
    restarted.project(authority("materializer", "project"), reducer());
    expect(restarted.trace()).toHaveLength(1);
    expect(restarted.current().history?.order).toEqual(["portable-native-1"]);
  });
  test("survives partition, late parent, reordering and exact replay", () => {
    const { store } = fixture(),
      child = envelope(2, "a", 2, ["portable-native-1"]);
    store.markPartition(authority("collector", "ingest"), 1, 2);
    store.ingest(authority("collector", "ingest"), child, 2);
    store.lift(authority("translator", "lift"), "native-2", adapter());
    {const p=policy();store.accept(authority("governor", "accept"),p,policyAttestation(p));}
    expect(store.current().gaps.map((g) => g.kind)).toContain("causal-parent");
    const parent = envelope(1, "a", 1);
    store.ingest(authority("collector", "ingest"), parent, 2);
    store.ingest(authority("collector", "ingest"), parent, 2);
    store.lift(authority("translator", "lift"), "native-1", adapter());
    {const p=policy();store.accept(authority("governor", "accept"),p,policyAttestation(p));}
    store.project(authority("materializer", "project"), reducer());
    expect(store.current().gaps).toEqual([]);
    expect(store.current().history?.order).toEqual([
      "portable-native-1",
      "portable-native-2",
    ]);
    expect(
      (
        store.query(authority("reader", "query"), { consistency: "strong" })!
          .value as any
      ).values.a.value,
    ).toBe(2);
  });
  test("compacts only behind an authenticated snapshot and preserves consistent restart queries", () => {
    const { store, backend, purges } = fixture();
    pipeline(store, envelope(1, "a", 1));
    store.project(authority("materializer", "project"), reducer());
    const generation = store.current().generation;
    store.snapshot(authority("materializer", "project"), "snap");
    store.compact(authority("materializer", "project"), "snap");
    expect(store.current().staged["native-1"]).toBeUndefined();
    expect(store.trace()[0]?.nativeDigest).toBeTruthy();
    const restarted = new PortableRuntimeEventStore(
      "tenant",
      trust,
      purges,
      backend,
    );
    expect(
      restarted.query(authority("reader", "query"), {
        consistency: "snapshot",
        snapshotId: "snap",
      })?.value,
    ).toEqual({ values: { a: { value: 1, secret: "sensitive" } } });
    expect(() =>
      restarted.query(authority("reader", "query"), {
        consistency: "strong",
        minimumGeneration: generation + 100,
      }),
    ).toThrow(/generation/);
  });
  test("retention purge preserves immutable snapshots, invalidates them, and declares missing physical proof", () => {
    const { store, purges } = fixture();
    const e = envelope(1, "a", 1);
    pipeline(store, e);
    store.project(authority("materializer", "project"), reducer());
    store.snapshot(authority("materializer", "project"), "before");
    const snapshotBefore=structuredClone(store.current().snapshots.before);
    store.enforceRetention(
      authority("privacy", "privacy"),
      "2026-08-01T00:00:00Z",
      ["values.a.secret"],
    );
    const state = store.current();
    expect(state.staged["native-1"]?.status).toBe("purged");
    expect(state.staged["native-1"]?.envelope).toBeUndefined();
    expect(state.snapshots.before).toEqual(snapshotBefore);
    expect(state.purges[0]).toMatchObject({
      sequence: 1,
      previous: null,
      nativeDigests: [e.digest],
    });
    expect(() =>
      store.query(authority("reader", "query"), {
        consistency: "snapshot",
        snapshotId: "before",
      }),
    ).toThrow(/predates purge/);
    expect(() => store.ingest(authority("collector", "ingest"), e)).toThrow(
      /irreversibly purged/,
    );
    expect(purges.seen.has(e.digest)).toBe(true);
    expect(state.privacyResiduals).toContainEqual(
      expect.objectContaining({
        location: "unscoped-storage",
        reason: expect.stringContaining("no physical"),
      }),
    );
    expect(store.privacyStatus().physicallyVerified).toBeFalse();
  });
  test("requires derivation-closed deletion and records verified physical erasure",()=>{
    const backend=new MemoryRuntimeEventStoreBackend(),purges=new Purges(),erased=new Map<string,any[]>(),physical={lookup:(id:string)=>erased.get(id),erase:({transactionId,locations}:{transactionId:string;locations:string[]})=>{const evidence=locations.map(location=>{const body={transactionId,location,status:"erased" as const};const digest=semanticDigest(body,"physical-test").value;return{...body,digest,signature:`erase:${digest}`}});erased.set(transactionId,structuredClone(evidence));return evidence},verify:(e:any)=>e.signature===`erase:${e.digest}`};
    const store=new PortableRuntimeEventStore("tenant",trust,purges,backend,physical);store.initialize();pipeline(store,envelope(1,"a",1));const derivedReducer=reducer("r1",{"values.a.secret":["values.a.value"]});store.project(authority("materializer","project"),derivedReducer);
    expect(()=>store.declareDerivations(authority("privacy","privacy"),reducer("r2",{}))).toThrow(/active projected reducer/);
    store.declareDerivations(authority("privacy","privacy"),derivedReducer);
    expect(()=>store.purge(authority("privacy","privacy"),{eventIds:["portable-native-1"],nativeIds:["native-1"],paths:["values.a.secret"],at:"2026-08-01T00:00:00Z"})).toThrow(/derivation-closed/);
    store.purge(authority("privacy","privacy"),{eventIds:["portable-native-1"],nativeIds:["native-1"],paths:["values.a.secret","values.a.value"],physicalLocations:["file://state","backup://snapshot"],at:"2026-08-01T00:00:00Z"});
    expect(store.current().erasureEvidence).toHaveLength(2);expect(store.current().privacyResiduals).toContainEqual(expect.objectContaining({location:"retained-audit-metadata"}));expect(store.privacyStatus()).toMatchObject({physicalLocationsVerified:true,fullyVerified:false,physicallyVerified:true});
  });
  test("reconciles crash after external purge record and atomically rejects late old ingress",()=>{
    const durable=new MemoryRuntimeEventStoreBackend(),purges=new Purges(),first=fixture(durable,purges).store,e=envelope(1,"a",1);pipeline(first,e);
    class CrashCommit implements RuntimeEventStoreBackend{crashed=false;load(t:string){return durable.load(t)}compareAndSwap(t:string,g:number|undefined,n:any){const committed=Object.values(n.purgeTransactions??{}).some((x:any)=>x.status==="committed");if(committed&&!this.crashed){this.crashed=true;throw new Error("crash-after-external-record")}return durable.compareAndSwap(t,g,n)}}
    const crashing=new PortableRuntimeEventStore("tenant",trust,purges,new CrashCommit());
    expect(()=>crashing.enforceRetention(authority("privacy","privacy"),"2026-08-01T00:00:00Z")).toThrow(/crash-after-external-record/);
    expect(Object.values(durable.load("tenant")!.purgeTransactions)[0]).toMatchObject({status:"prepared"});
    const restarted=new PortableRuntimeEventStore("tenant",trust,purges,durable);restarted.enforceRetention(authority("privacy","privacy"),"2026-08-01T00:00:00Z");
    expect(restarted.current().purges).toHaveLength(1);expect(restarted.current().purgeTransactions).toEqual(expect.objectContaining({[Object.keys(restarted.current().purgeTransactions)[0]!]:expect.objectContaining({status:"committed"})}));
    expect(()=>restarted.ingest(authority("collector","ingest"),envelope(2,"late",2))).toThrow(/durable retention cutoff/);
  });
  test("reconciles crash after durable physical erase without repeating the external effect",()=>{
    const durable=new MemoryRuntimeEventStoreBackend(),purges=new Purges(),records=new Map<string,any[]>();let eraseCalls=0;
    const physical={lookup:(id:string)=>records.get(id)&&structuredClone(records.get(id)),erase:({transactionId,locations}:{transactionId:string;locations:string[]})=>{eraseCalls++;const values=locations.map(location=>{const body={transactionId,location,status:"erased" as const},digest=semanticDigest(body,"physical-crash-test").value;return{...body,digest,signature:`erase:${digest}`}});records.set(transactionId,structuredClone(values));return values},verify:(e:any)=>e.signature===`erase:${e.digest}`};
    const initial=fixture(durable,purges).store;pipeline(initial,envelope(1,"a",1));
    class CrashLocalCommit implements RuntimeEventStoreBackend{crashed=false;load(t:string){return durable.load(t)}compareAndSwap(t:string,g:number|undefined,n:any){const committed=Object.values(n.purgeTransactions??{}).some((x:any)=>x.status==="committed");if(committed&&!this.crashed){this.crashed=true;throw new Error("crash-after-physical-erase")}return durable.compareAndSwap(t,g,n)}}
    const input={eventIds:["portable-native-1"],nativeIds:["native-1"],paths:[],physicalLocations:["file://state"],at:"2026-08-01T00:00:00Z"};
    const crashing=new PortableRuntimeEventStore("tenant",trust,purges,new CrashLocalCommit(),physical);
    expect(()=>crashing.purge(authority("privacy","privacy"),input)).toThrow(/crash-after-physical-erase/);expect(eraseCalls).toBe(1);
    const restarted=new PortableRuntimeEventStore("tenant",trust,purges,durable,physical);restarted.purge(authority("privacy","privacy"),input);
    expect(eraseCalls).toBe(1);expect(restarted.current().erasureEvidence).toHaveLength(1);expect(Object.values(restarted.current().purgeTransactions)[0]).toMatchObject({status:"committed"});
  });
  test("migrates schema/reducer with authenticated provenance and rolls back through an explicit inverse", () => {
    const { store } = fixture();
    pipeline(store, envelope(1, "a", 1));
    const map = (to: string) => (event: PortableEventV2) => {
      const { integrity: _, ...body } = event;
      return {
        ...body,
        reducer: to,
        payload: { ...body.payload, migrated: to },
      };
    };
    const migration: ReducerMigration = {
      id: "r1-r2",
      from: "r1",
      to: "r2",
      eventSchema: "autonomy.event.v2",
      implementationDigest: "impl:migrate-r1-r2",
      artifactSignature: "artifact:r1-r2:impl:migrate-r1-r2",
      inverseImplementationDigest: "impl:rollback-r1-r2",
      inverseArtifactSignature: "artifact:rollback:r1-r2:impl:rollback-r1-r2",
      digest: "",
      map: map("r2"),
      inverse: (event) => {
        const { integrity: _, ...body } = event;
        const payload = { ...body.payload };
        delete payload.migrated;
        return { ...body, reducer: "r1", payload };
      },
    };
    migration.digest = runtimeMigrationDigest(migration);
    store.migrate(authority("migrator", "migration"), migration, policy("r2"));
    expect(store.current().history?.reducer).toBe("r2");
    store.rollbackMigration(
      authority("migrator", "migration"),
      migration,
      policy("r1"),
    );
    expect(store.current().history?.reducer).toBe("r1");
    expect(store.current().migrationLog.map((x) => x.to)).toEqual([
      "r2",
      "r1",
      "r1",
    ]);
    const forged = { ...migration, digest: "bad" };
    expect(() =>
      store.migrate(authority("migrator", "migration"), forged, policy("r2")),
    ).toThrow(/provenance/);
  });
  test("rejects signed checkpoint tampering and conflicting native replay", () => {
    const inner = new MemoryRuntimeEventStoreBackend(),
      { store } = fixture(inner);
    const e = envelope(1, "a", 1);
    store.ingest(authority("collector", "ingest"), e);
    expect(() =>
      store.ingest(authority("collector", "ingest"), envelope(1, "evil", 2)),
    ).toThrow(/equivocation/);
    const hostile: RuntimeEventStoreBackend = {
      load(id) {
        const s = inner.load(id)!;
        s.observedHighWater = 999;
        return s;
      },
      compareAndSwap() {
        return false;
      },
    };
    expect(() =>
      new PortableRuntimeEventStore(
        "tenant",
        trust,
        new Purges(),
        hostile,
      ).current(),
    ).toThrow(/integrity/);
  });
  test("persists atomic CAS state across independent filesystem backend instances", () => {
    const root = mkdtempSync(join(tmpdir(), "oa-r18-"));
    try {
      const purges = new Purges(),
        first = new PortableRuntimeEventStore(
          "tenant",
          trust,
          purges,
          new FileRuntimeEventStoreBackend(root),
        );
      first.initialize();
      pipeline(first, envelope(1, "disk", 42));
      first.project(authority("materializer", "project"), reducer());
      const second = new PortableRuntimeEventStore(
        "tenant",
        trust,
        purges,
        new FileRuntimeEventStoreBackend(root),
      );
      expect(
        (
          second.query(authority("reader", "query"), { consistency: "strong" })!
            .value as any
        ).values.disk.value,
      ).toBe(42);
      expect(second.trace()).toEqual(first.trace());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  test("invalidates stale projections and enforces immutable snapshot cuts", () => {
    const { store } = fixture();
    pipeline(store, envelope(1, "a", 1));
    store.project(authority("materializer", "project"), reducer());
    store.snapshot(authority("materializer", "project"), "cut");
    pipeline(store, envelope(2, "b", 2));
    expect(
      store.query(authority("reader", "query"), { consistency: "strong" }),
    ).toBeUndefined();
    expect(() =>
      store.snapshot(authority("materializer", "project"), "stale"),
    ).toThrow(/nothing materialized/);
    expect(() =>
      store.query(authority("reader", "query"), {
        consistency: "snapshot",
        snapshotId: "cut",
        minimumGeneration: store.current().generation,
      }),
    ).toThrow(/snapshot generation/);
    store.project(authority("materializer", "project"), reducer());
    expect(() =>
      store.snapshot(authority("materializer", "project"), "cut"),
    ).toThrow(/immutable/);
  });
  test("rejects forged capabilities and reducer artifacts", () => {
    const { store } = fixture();
    const forged = {
      ...authority("collector", "ingest"),
      capability: "forged",
    };
    expect(() => store.ingest(forged, envelope(1, "a", 1))).toThrow(
      /authority denied/,
    );
    pipeline(store, envelope(1, "a", 1));
    expect(() =>
      store.project(authority("materializer", "project"), {
        ...reducer(),
        artifactSignature: "forged",
      }),
    ).toThrow(/attestation/);
  });
  test("rejects unattested and non-invertible migration behavior", () => {
    const { store } = fixture();
    pipeline(store, envelope(1, "a", 1));
    const base: ReducerMigration = {
      id: "evil",
      from: "r1",
      to: "r2",
      eventSchema: "autonomy.event.v2",
      implementationDigest: "impl:evil",
      artifactSignature: "forged",
      inverseImplementationDigest: "impl:inverse",
      inverseArtifactSignature: "artifact:rollback:evil:impl:inverse",
      digest: "",
      map: (event) => {
        const { integrity: _, ...body } = event;
        return { ...body, reducer: "r2" };
      },
      inverse: (event) => {
        const { integrity: _, ...body } = event;
        return { ...body, reducer: "wrong" };
      },
    };
    base.digest = runtimeMigrationDigest(base);
    expect(() =>
      store.migrate(authority("migrator", "migration"), base, policy("r2")),
    ).toThrow(/attestation/);
    base.artifactSignature = "artifact:evil:impl:evil";
    store.migrate(authority("migrator", "migration"), base, policy("r2"));
    expect(() =>
      store.rollbackMigration(
        authority("migrator", "migration"),
        base,
        policy("r1"),
      ),
    ).toThrow(/roundtrip/);
  });
  test("full, snapshot, and compacted-plus-late replay are differential equivalents", () => {
    const { store } = fixture();
    pipeline(store, envelope(1, "a", 1));
    store.project(authority("materializer", "project"), reducer());
    const full = store.query(authority("reader", "query"), {
      consistency: "strong",
    })!.value;
    store.snapshot(authority("materializer", "project"), "base");
    expect(
      store.query(authority("reader", "query"), {
        consistency: "snapshot",
        snapshotId: "base",
      })!.value,
    ).toEqual(full);
    store.compact(authority("materializer", "project"), "base");
    pipeline(store, envelope(2, "b", 2));
    store.project(authority("materializer", "project"), reducer());
    expect(
      store.query(authority("reader", "query"), { consistency: "strong" })!
        .value,
    ).toEqual({
      values: {
        a: { value: 1, secret: "sensitive" },
        b: { value: 2, secret: "sensitive" },
      },
    });
    const substituted={...policy(),maximumEvents:99};
    expect(() =>store.accept(authority("governor", "accept"),substituted,policyAttestation(substituted))).toThrow(/policy provenance/);
  });
  test("filesystem lock recovers only after observed child-process death", async () => {
    const root = mkdtempSync(join(tmpdir(), "oa-r18-owner-")),
      backend = new FileRuntimeEventStoreBackend(root),
      { store } = fixture(backend),
      child = Bun.spawn(["bash", "-lc", "sleep 0.05"]),
      pid = child.pid,
      start = readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[21],
      lock = join(
        root,
        `${semanticDigest("tenant", "runtime-event-store-tenant").value}.json.lock`,
      );
    mkdirSync(lock);
    writeFileSync(
      join(lock, "owner.json"),
      JSON.stringify({ pid, start, token: "child" }),
    );
    await child.exited;
    store.ingest(authority("collector", "ingest"), envelope(1, "locked", 1));
    expect(store.current().staged["native-1"]).toBeDefined();
    rmSync(root, { recursive: true, force: true });
  });
  test("filesystem CAS admits only one simultaneous child writer",async()=>{
    const root=mkdtempSync(join(tmpdir(),"oa-r18-race-")),backend=new FileRuntimeEventStoreBackend(root),{store}=fixture(backend);store.ingest(authority("collector","ingest"),envelope(1,"seed",1));
    const script=`import {FileRuntimeEventStoreBackend} from './packages/core/src/organization-runtime-event-store.ts';const b=new FileRuntimeEventStoreBackend(process.argv[1]);const s=b.load('tenant');await Bun.sleep(150);s.generation++;s.lastIngestSequence=Number(process.argv[2]);process.stdout.write(String(b.compareAndSwap('tenant',s.generation-1,s)));`;
    const children=[2,3].map(value=>Bun.spawn([process.execPath,"-e",script,root,String(value)],{cwd:join(import.meta.dir,"../../.."),stdout:"pipe",stderr:"pipe"}));
    const results=await Promise.all(children.map(async child=>{await child.exited;return new Response(child.stdout).text()}));expect(results.filter(value=>value==="true")).toHaveLength(1);rmSync(root,{recursive:true,force:true});
  });
  test("rejects oversized envelopes, malformed times, and excessive purge paths", () => {
    const { store } = fixture(),
      huge = envelope(1, "a", "x".repeat(1_100_000));
    expect(() => store.ingest(authority("collector", "ingest"), huge)).toThrow(
      /byte or time/,
    );
    const bad = envelope(1, "a", 1);
    bad.observation.at = "not-time";
    const body = {
      schema: bad.schema,
      tenant: bad.tenant,
      ingestSequence: bad.ingestSequence,
      observation: bad.observation,
    };
    const resigned = sealNativeEnvelope(body, (d) => `native:${d}`);
    expect(() =>
      store.ingest(authority("collector", "ingest"), resigned),
    ).toThrow(/byte or time/);
    expect(() =>
      store.purge(authority("privacy", "privacy"), {
        eventIds: [],
        nativeIds: [],
        paths: Array.from({ length: 1001 }, (_, i) => `p.${i}`),
        at: "2026-01-01T00:00:00Z",
      }),
    ).toThrow(/invalid/);
  });
});
