import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type RuntimeService =
  | "api"
  | "compiler"
  | "registry"
  | "event-store"
  | "reconciler"
  | "interaction"
  | "worker"
  | "adapter";
export type ReliabilityMode = "normal" | "degraded" | "read-only" | "paused";
export type FaultDomain =
  "dependency" | "zone" | "region" | "network" | "storage" | "control-plane";

export type ServiceSlo = {
  service: RuntimeService;
  windowMs: number;
  availabilityTarget: number;
  latencyTargetMs: number;
  latencyPercentile: number;
  maxCostPerRequest: number;
  degradation: ReliabilityMode;
};

export type SliSample = {
  atMs: number;
  successful: boolean;
  latencyMs: number;
  cost: number;
};
export type SloReport = {
  service: RuntimeService;
  samples: number;
  availability: number;
  latencyPercentileMs: number;
  totalCost: number;
  badEvents: number;
  allowedBadEvents: number;
  errorBudgetRemaining: number;
  violated: boolean;
  reasons: string[];
};

export function measureSlo(
  slo: ServiceSlo,
  samples: SliSample[],
  nowMs: number,
): SloReport {
  validateSlo(slo);
  const selected = samples.filter(
    (s) => s.atMs > nowMs - slo.windowMs && s.atMs <= nowMs,
  );
  if (
    selected.some(
      (s) =>
        !Number.isFinite(s.latencyMs) ||
        s.latencyMs < 0 ||
        !Number.isFinite(s.cost) ||
        s.cost < 0,
    )
  )
    throw new Error("invalid SLI sample");
  const successful = selected.filter((s) => s.successful);
  const availability = selected.length
    ? successful.length / selected.length
    : 0;
  const latency = percentile(
    successful.map((s) => s.latencyMs),
    slo.latencyPercentile,
  );
  const totalCost = selected.reduce((n, s) => n + s.cost, 0);
  const badEvents = selected.length - successful.length;
  const allowedBadEvents = selected.length * (1 - slo.availabilityTarget);
  const errorBudgetRemaining = allowedBadEvents - badEvents;
  const reasons: string[] = [];
  if (!selected.length) reasons.push("telemetry-missing");
  if (availability < slo.availabilityTarget) reasons.push("availability");
  if (latency > slo.latencyTargetMs) reasons.push("latency");
  if (selected.length && totalCost / selected.length > slo.maxCostPerRequest)
    reasons.push("cost");
  return {
    service: slo.service,
    samples: selected.length,
    availability,
    latencyPercentileMs: latency,
    totalCost,
    badEvents,
    allowedBadEvents,
    errorBudgetRemaining,
    violated: reasons.length > 0,
    reasons,
  };
}

function validateSlo(s: ServiceSlo) {
  if (
    s.windowMs <= 0 ||
    s.availabilityTarget <= 0 ||
    s.availabilityTarget > 1 ||
    s.latencyTargetMs < 0 ||
    s.latencyPercentile <= 0 ||
    s.latencyPercentile > 1 ||
    s.maxCostPerRequest < 0
  )
    throw new Error("invalid SLO");
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1]!;
}

export type AdmissionRequest = {
  id: string;
  tenant: string;
  service: RuntimeService;
  submittedAtMs: number;
  costUnits: number;
  privileged: boolean;
};
export type AdmissionDecision = {
  status: "queued" | "shed" | "refused";
  reason?: string;
};
export type CapacityEnvelope = {
  maxInFlight: number;
  maxQueuedPerTenant: number;
  maxTotalQueued: number;
  tenantWeights: Record<string, number>;
  shedAfterMs: number;
};
export type AdmissionSnapshot = {
  mode: ReliabilityMode;
  inFlight: AdmissionRequest[];
  queued: Record<string, AdmissionRequest[]>;
  admittedByTenant: Record<string, number>;
  shedByTenant: Record<string, number>;
  costByTenant: Record<string, number>;
};

/** Bounded weighted deficit round-robin. Tenant queues and accounting never share mutable state. */
export class FairAdmissionController {
  private mode: ReliabilityMode = "normal";
  private globalPaused = false;
  private tenantPaused = new Set<string>();
  private queued = new Map<string, AdmissionRequest[]>();
  private inFlight = new Map<string, AdmissionRequest>();
  private deficit = new Map<string, number>();
  private cursor = 0;
  private admitted = new Map<string, number>();
  private shed = new Map<string, number>();
  private costs = new Map<string, number>();
  constructor(readonly envelope: CapacityEnvelope) {
    if (
      !Number.isSafeInteger(envelope.maxInFlight) ||
      envelope.maxInFlight < 1 ||
      !Number.isSafeInteger(envelope.maxQueuedPerTenant) ||
      envelope.maxQueuedPerTenant < 1 ||
      !Number.isSafeInteger(envelope.maxTotalQueued) ||
      envelope.maxTotalQueued < 1 ||
      envelope.shedAfterMs < 0 ||
      Object.values(envelope.tenantWeights).some(
        (w) => !Number.isSafeInteger(w) || w < 1,
      )
    )
      throw new Error("invalid capacity envelope");
  }
  setMode(mode: ReliabilityMode) {
    this.mode = mode;
  }
  pauseGlobal(paused: boolean) {
    this.globalPaused = paused;
  }
  pauseTenant(tenant: string, paused: boolean) {
    if (paused) this.tenantPaused.add(tenant);
    else this.tenantPaused.delete(tenant);
  }
  submit(request: AdmissionRequest): AdmissionDecision {
    validateRequest(request);
    if (
      this.globalPaused ||
      this.tenantPaused.has(request.tenant) ||
      this.mode === "paused"
    )
      return { status: "refused", reason: "paused" };
    if (request.privileged && this.mode === "read-only")
      return { status: "refused", reason: "read-only" };
    if (this.mode === "degraded" && request.privileged)
      return { status: "refused", reason: "degraded-privileged" };
    const queue = this.queued.get(request.tenant) ?? [];
    const total = [...this.queued.values()].reduce((n, q) => n + q.length, 0),
      configuredWeight = Object.values(this.envelope.tenantWeights).reduce(
        (sum, weight) => sum + weight,
        0,
      ),
      reservedCap = configuredWeight
        ? Math.max(
            1,
            Math.floor(
              (this.envelope.maxTotalQueued *
                (this.envelope.tenantWeights[request.tenant] ?? 1)) /
                configuredWeight,
            ),
          )
        : this.envelope.maxQueuedPerTenant,
      tenantCap = Math.min(this.envelope.maxQueuedPerTenant, reservedCap);
    if (queue.length >= tenantCap || total >= this.envelope.maxTotalQueued) {
      this.bump(this.shed, request.tenant);
      return { status: "shed", reason: "capacity" };
    }
    if (
      [...this.inFlight.values()].some((r) => r.id === request.id) ||
      [...this.queued.values()].some((q) => q.some((r) => r.id === request.id))
    )
      throw new Error("duplicate admission request");
    queue.push(structuredClone(request));
    this.queued.set(request.tenant, queue);
    return { status: "queued" };
  }
  dispatch(nowMs: number): AdmissionRequest[] {
    for (const [tenant, queue] of this.queued) {
      const retained: AdmissionRequest[] = [];
      for (const request of queue)
        if (nowMs - request.submittedAtMs > this.envelope.shedAfterMs)
          this.bump(this.shed, tenant);
        else if (
          request.privileged &&
          (this.mode === "read-only" || this.mode === "degraded")
        )
          this.bump(this.shed, tenant);
        else retained.push(request);
      this.queued.set(tenant, retained);
    }
    const out: AdmissionRequest[] = [];
    while (this.inFlight.size < this.envelope.maxInFlight) {
      const tenants = [...this.queued.keys()]
        .filter((t) => (this.queued.get(t)?.length ?? 0) > 0)
        .sort();
      const eligibleTenants = tenants.filter(
        (tenant) =>
          !this.globalPaused &&
          this.mode !== "paused" &&
          !this.tenantPaused.has(tenant),
      );
      if (!eligibleTenants.length) break;
      this.cursor %= eligibleTenants.length;
      let selected: string | undefined;
      for (let i = 0; i < eligibleTenants.length; i++) {
        const tenant =
          eligibleTenants[(this.cursor + i) % eligibleTenants.length]!;
        this.deficit.set(
          tenant,
          (this.deficit.get(tenant) ?? 0) +
            (this.envelope.tenantWeights[tenant] ?? 1),
        );
        const next = this.queued.get(tenant)![0]!;
        if ((this.deficit.get(tenant) ?? 0) >= next.costUnits) {
          selected = tenant;
          this.cursor = (this.cursor + i + 1) % eligibleTenants.length;
          break;
        }
      }
      if (!selected) continue;
      const request = this.queued.get(selected)!.shift()!;
      this.deficit.set(
        selected,
        this.deficit.get(selected)! - request.costUnits,
      );
      this.inFlight.set(request.id, request);
      this.bump(this.admitted, selected);
      this.bump(this.costs, selected, request.costUnits);
      out.push(structuredClone(request));
    }
    return out;
  }
  complete(id: string) {
    if (!this.inFlight.delete(id)) throw new Error("unknown in-flight request");
  }
  snapshot(): AdmissionSnapshot {
    return {
      mode: this.mode,
      inFlight: [...this.inFlight.values()].map((request) =>
        structuredClone(request),
      ),
      queued: Object.fromEntries(
        [...this.queued].map(([k, v]) => [
          k,
          v.map((request) => structuredClone(request)),
        ]),
      ),
      admittedByTenant: Object.fromEntries(this.admitted),
      shedByTenant: Object.fromEntries(this.shed),
      costByTenant: Object.fromEntries(this.costs),
    };
  }
  private bump(map: Map<string, number>, key: string, by = 1) {
    map.set(key, (map.get(key) ?? 0) + by);
  }
}

function validateRequest(r: AdmissionRequest) {
  if (
    !r.id ||
    !r.tenant ||
    !Number.isFinite(r.submittedAtMs) ||
    !Number.isSafeInteger(r.costUnits) ||
    r.costUnits < 1
  )
    throw new Error("invalid admission request");
}

export type AuthorityRecord = {
  id: string;
  tenant: string;
  status: "active" | "expired" | "revoked";
  changedAtMs: number;
};
export type DurableEffect = {
  id: string;
  tenant: string;
  acknowledgedAtMs: number;
  privileged: boolean;
};
export type RecoverableState = {
  sequence: number;
  capturedAtMs: number;
  authorities: AuthorityRecord[];
  effects: DurableEffect[];
  schemaVersion: number;
  componentState: Record<string, unknown>;
};
export type SignedBackup = { state: RecoverableState; digest: string; signer: string; signature: string };
export interface BackupTrust { signer: string; sign(digest: string): string; verify(signer: string, digest: string, signature: string): boolean }
export interface RecoveryJournal { authorities(): AuthorityRecord[]; effects(): DurableEffect[]; appendAuthority(record: AuthorityRecord): void; appendEffect(record: DurableEffect): void; latestBackup(): SignedBackup | undefined; recordBackup(backup: SignedBackup): void }
export class MemoryRecoveryJournal implements RecoveryJournal { private authority = new Map<string, AuthorityRecord>(); private effect = new Map<string, DurableEffect>(); private backup?: SignedBackup; authorities() { return [...this.authority.values()].map((x) => structuredClone(x)); } effects() { return [...this.effect.values()].map((x) => structuredClone(x)); } appendAuthority(record: AuthorityRecord) { const key = `${record.tenant}\0${record.id}`, prior = this.authority.get(key); if (prior?.status === "revoked" && record.status === "active") throw new Error("revoked authority cannot be resurrected"); if (!prior || record.changedAtMs >= prior.changedAtMs) this.authority.set(key, structuredClone(record)); } appendEffect(record: DurableEffect) { const key = `${record.tenant}\0${record.id}`, prior = this.effect.get(key); if (prior && hash(prior) !== hash(record)) throw new Error("acknowledged effect equivocation"); this.effect.set(key, structuredClone(record)); } latestBackup() { return this.backup && structuredClone(this.backup); } recordBackup(backup: SignedBackup) { if (this.backup && backup.state.sequence < this.backup.state.sequence) throw new Error("backup sequence rollback"); this.backup = structuredClone(backup); } }
type RecoveryJournalPayload = { kind: "authority"; value: AuthorityRecord } | { kind: "effect"; value: DurableEffect } | { kind: "backup"; value: SignedBackup };
type RecoveryJournalEntry = RecoveryJournalPayload & { sequence: number; previousDigest: string; digest: string };
type RecoveryJournalFile = { schema: "autonomy.recovery-journal.v1"; sequence: number; headDigest: string; entries: RecoveryJournalEntry[]; signature: string };
type RecoveryJournalAnchor = { schema: "autonomy.recovery-journal-anchor.v1"; sequence: number; headDigest: string; signature: string };
export class FileRecoveryJournal implements RecoveryJournal {
  private file: string; private anchor: string; private lock: string;
  constructor(private root: string, private authenticationKey: string) {
    if (!authenticationKey) throw new Error("recovery journal authentication key required");
    mkdirSync(root, { recursive: true, mode: 0o700 }); this.file = join(root, "recovery-journal.json"); this.anchor = join(root, "recovery-journal.anchor.json"); this.lock = join(root, "recovery-journal.lock");
    this.exclusive(() => { if (!existsSync(this.file) && !existsSync(this.anchor)) this.persist(this.empty(), true); else this.load(); });
  }
  authorities() { return this.exclusive(() => this.project(this.load()).authorities); }
  effects() { return this.exclusive(() => this.project(this.load()).effects); }
  latestBackup() { return this.exclusive(() => this.project(this.load()).backup); }
  appendAuthority(record: AuthorityRecord) { this.append({ kind: "authority", value: structuredClone(record) }, (state) => { const prior = state.authorities.find((x) => x.tenant === record.tenant && x.id === record.id); if (prior?.status === "revoked" && record.status === "active") throw new Error("revoked authority cannot be resurrected"); }); }
  appendEffect(record: DurableEffect) { this.append({ kind: "effect", value: structuredClone(record) }, (state) => { const prior = state.effects.find((x) => x.tenant === record.tenant && x.id === record.id); if (prior && hash(prior) !== hash(record)) throw new Error("acknowledged effect equivocation"); }); }
  recordBackup(backup: SignedBackup) { this.append({ kind: "backup", value: structuredClone(backup) }, (state) => { if (state.backup && backup.state.sequence < state.backup.state.sequence) throw new Error("backup sequence rollback"); }); }
  private append(payload: RecoveryJournalPayload, validate: (state: ReturnType<FileRecoveryJournal["project"]>) => void) { this.exclusive(() => { const current = this.load(); validate(this.project(current)); const sequence = current.sequence + 1, previousDigest = current.headDigest, body = { ...payload, sequence, previousDigest }, digest = hash(body), entry = { ...body, digest } as RecoveryJournalEntry, next = this.seal({ schema: "autonomy.recovery-journal.v1", sequence, headDigest: digest, entries: [...current.entries, entry] }); this.persist(next, false); }); }
  private empty() { return this.seal({ schema: "autonomy.recovery-journal.v1" as const, sequence: 0, headDigest: "0".repeat(64), entries: [] }); }
  private seal(body: Omit<RecoveryJournalFile, "signature">): RecoveryJournalFile { return { ...body, signature: this.mac(body) }; }
  private sealAnchor(sequence: number, headDigest: string): RecoveryJournalAnchor { const body = { schema: "autonomy.recovery-journal-anchor.v1" as const, sequence, headDigest }; return { ...body, signature: this.mac(body) }; }
  private mac(value: unknown) { return createHmac("sha256", this.authenticationKey).update(JSON.stringify(value)).digest("hex"); }
  private verifyMac(value: { signature: string } & Record<string, unknown>) { const { signature, ...body } = value, expected = Buffer.from(this.mac(body), "hex"), observed = Buffer.from(signature, "hex"); return observed.length === expected.length && timingSafeEqual(observed, expected); }
  private load(): RecoveryJournalFile {
    if (!existsSync(this.file) || !existsSync(this.anchor)) throw new Error("recovery journal or monotonic anchor missing");
    let journal: RecoveryJournalFile, anchor: RecoveryJournalAnchor;
    try { journal = JSON.parse(readFileSync(this.file, "utf8")); anchor = JSON.parse(readFileSync(this.anchor, "utf8")); } catch { throw new Error("recovery journal truncation or malformed encoding"); }
    if (journal.schema !== "autonomy.recovery-journal.v1" || anchor.schema !== "autonomy.recovery-journal-anchor.v1" || !Array.isArray(journal.entries) || !this.verifyMac(journal as unknown as Record<string, unknown> & { signature: string }) || !this.verifyMac(anchor as unknown as Record<string, unknown> & { signature: string })) throw new Error("recovery journal authentication failed");
    let previous = "0".repeat(64);
    for (let i = 0; i < journal.entries.length; i++) { const entry = journal.entries[i]!, { digest, ...body } = entry; if (entry.sequence !== i + 1 || entry.previousDigest !== previous || digest !== hash(body)) throw new Error("recovery journal sequence or hash chain invalid"); previous = digest; }
    if (journal.sequence !== journal.entries.length || journal.headDigest !== previous || anchor.sequence > journal.sequence || (anchor.sequence > 0 && journal.entries[anchor.sequence - 1]?.digest !== anchor.headDigest)) throw new Error("recovery journal truncation, reorder, or rollback detected");
    if (anchor.sequence < journal.sequence) this.writeAtomic(this.anchor, JSON.stringify(this.sealAnchor(journal.sequence, journal.headDigest)));
    return journal;
  }
  private project(journal: RecoveryJournalFile) { const authorities = new Map<string, AuthorityRecord>(), effects = new Map<string, DurableEffect>(); let backup: SignedBackup | undefined; for (const entry of journal.entries) { if (entry.kind === "authority") { const record = entry.value, key = `${record.tenant}\0${record.id}`, prior = authorities.get(key); if (prior?.status === "revoked" && record.status === "active") throw new Error("recovery journal resurrects revoked authority"); if (!prior || record.changedAtMs >= prior.changedAtMs) authorities.set(key, structuredClone(record)); } else if (entry.kind === "effect") { const record = entry.value, key = `${record.tenant}\0${record.id}`, prior = effects.get(key); if (prior && hash(prior) !== hash(record)) throw new Error("recovery journal effect equivocation"); effects.set(key, structuredClone(record)); } else { if (backup && entry.value.state.sequence < backup.state.sequence) throw new Error("recovery journal backup rollback"); backup = structuredClone(entry.value); } } return { authorities: [...authorities.values()], effects: [...effects.values()], backup }; }
  private persist(journal: RecoveryJournalFile, initialize: boolean) { if (!initialize) { const current = this.load(); if (journal.sequence !== current.sequence + 1 || journal.entries.at(-1)?.previousDigest !== current.headDigest) throw new Error("recovery journal CAS or fence mismatch"); } this.writeAtomic(this.file, JSON.stringify(journal)); this.writeAtomic(this.anchor, JSON.stringify(this.sealAnchor(journal.sequence, journal.headDigest))); }
  private writeAtomic(path: string, value: string) { const temp = `${path}.${process.pid}.${randomUUID()}.tmp`, fd = openSync(temp, "wx", 0o600); try { writeFileSync(fd, value, "utf8"); fsyncSync(fd); } finally { closeSync(fd); } renameSync(temp, path); const dir = openSync(dirname(path), "r"); try { fsyncSync(dir); } finally { closeSync(dir); } }
  private exclusive<T>(action: () => T): T {
    const token = randomUUID(), ownerPath = join(this.lock, "owner.json"); let owned = false;
    for (let attempt = 0; attempt < 3_000; attempt++) {
      try { mkdirSync(this.lock, { mode: 0o700 }); writeFileSync(ownerPath, JSON.stringify({ pid: process.pid, token }), { mode: 0o600 }); owned = true; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let dead = false;
        try { const owner = JSON.parse(readFileSync(ownerPath, "utf8")) as { pid?: number }; if (owner.pid) try { process.kill(owner.pid, 0); } catch { dead = true; } if (Date.now() - statSync(this.lock).mtimeMs > 30_000) dead = true; }
        catch { try { dead = Date.now() - statSync(this.lock).mtimeMs > 30_000; } catch { dead = false; } }
        if (dead) rmSync(this.lock, { recursive: true, force: true }); else Bun.sleepSync(10);
      }
    }
    if (!owned) throw new Error("recovery journal process lock timeout");
    try { return action(); } finally { try { const owner = JSON.parse(readFileSync(ownerPath, "utf8")) as { token?: string }; if (owner.token === token) rmSync(this.lock, { recursive: true, force: true }); } catch { /* ownership was lost; never delete another writer's lock */ } }
  }
}
export type DisasterPolicy = {
  backupFrequencyMs: number;
  rpoMs: number;
  rtoMs: number;
  restoreOrder: RuntimeService[];
  supportedSchemaVersions: number[];
  versionSkew: number;
};
export type RecoveryMeasurement = {
  fault: FaultDomain;
  outageStartedAtMs: number;
  restoredAtMs: number;
  backupAgeMs: number;
  rpoMs: number;
  rtoMs: number;
  withinRpo: boolean;
  withinRto: boolean;
  errorBudgetViolation: boolean;
  restored: RecoverableState;
};

export class DisasterRecoveryController {
  private latest?: SignedBackup;
  constructor(readonly policy: DisasterPolicy, private backupTrust: BackupTrust, private journal: RecoveryJournal) {
    const unique = new Set(policy.restoreOrder);
    if (
      policy.backupFrequencyMs <= 0 ||
      policy.rpoMs < 0 ||
      policy.rtoMs < 0 ||
      unique.size !== policy.restoreOrder.length ||
      unique.size !== 8 ||
      policy.supportedSchemaVersions.length < 1 ||
      policy.versionSkew < 0
    )
      throw new Error("invalid disaster policy");
    this.latest = journal.latestBackup();
  }
  observeAuthority(authority: AuthorityRecord) {
    this.journal.appendAuthority(authority);
  }
  acknowledge(effect: DurableEffect) {
    this.journal.appendEffect(effect);
  }
  backup(state: RecoverableState, nowMs: number): SignedBackup {
    if (
      state.capturedAtMs !== nowMs ||
      !Number.isSafeInteger(state.sequence) ||
      state.sequence < 0
    )
      throw new Error("invalid backup state");
    const digest = hash(state), backup = { state: structuredClone(state), digest, signer: this.backupTrust.signer, signature: this.backupTrust.sign(digest) };
    this.latest = backup;
    this.journal.recordBackup(backup);
    return structuredClone(backup);
  }
  backupDue(nowMs: number) {
    return (
      !this.latest ||
      nowMs - this.latest.state.capturedAtMs >= this.policy.backupFrequencyMs
    );
  }
  restore(
    backup: SignedBackup,
    fault: FaultDomain,
    outageStartedAtMs: number,
    restoredAtMs: number,
    currentSchemaVersion: number,
    errorBudgetViolation: boolean,
  ): RecoveryMeasurement {
    if (backup.digest !== hash(backup.state) || backup.signer !== this.backupTrust.signer || !this.backupTrust.verify(backup.signer, backup.digest, backup.signature))
      throw new Error("backup integrity failure");
    if (
      !this.policy.supportedSchemaVersions.includes(
        backup.state.schemaVersion,
      ) ||
      Math.abs(currentSchemaVersion - backup.state.schemaVersion) >
        this.policy.versionSkew
    )
      throw new Error("unsupported restore version skew");
    if (
      restoredAtMs < outageStartedAtMs ||
      outageStartedAtMs < backup.state.capturedAtMs
    )
      throw new Error("invalid recovery chronology");
    const restored = structuredClone(backup.state);
    const byAuthority = new Map(
      restored.authorities.map((a) => [`${a.tenant}\0${a.id}`, a]),
    );
    for (const tombstone of this.journal.authorities()) {
      const key = `${tombstone.tenant}\0${tombstone.id}`,
        old = byAuthority.get(key);
      if (
        (!old || old.changedAtMs <= tombstone.changedAtMs) &&
        tombstone.status !== "active"
      )
        byAuthority.set(key, structuredClone(tombstone));
    }
    restored.authorities = [...byAuthority.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const effects = new Map(
      restored.effects.map((e) => [`${e.tenant}\0${e.id}`, e]),
    );
    for (const effect of this.journal.effects())
      effects.set(`${effect.tenant}\0${effect.id}`, structuredClone(effect));
    restored.effects = [...effects.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const backupAgeMs = outageStartedAtMs - backup.state.capturedAtMs,
      rtoMs = restoredAtMs - outageStartedAtMs;
    const withinRpo = backupAgeMs <= this.policy.rpoMs,
      withinRto = rtoMs <= this.policy.rtoMs;
    if ((!withinRpo || !withinRto) && !errorBudgetViolation)
      throw new Error(
        "recovery objective exceeded without error-budget violation",
      );
    return {
      fault,
      outageStartedAtMs,
      restoredAtMs,
      backupAgeMs,
      rpoMs: backupAgeMs,
      rtoMs,
      withinRpo,
      withinRto,
      errorBudgetViolation,
      restored,
    };
  }
  assertRestoreOrder(actual: RuntimeService[]) {
    if (actual.join("\0") !== this.policy.restoreOrder.join("\0"))
      throw new Error("unsafe restore ordering");
  }
  assertUpgrade(from: number, to: number) {
    if (
      !this.policy.supportedSchemaVersions.includes(from) ||
      !this.policy.supportedSchemaVersions.includes(to) ||
      Math.abs(to - from) > this.policy.versionSkew
    )
      throw new Error("unsupported rolling version skew");
  }
}

export type DiagnosticSignal = {
  service: RuntimeService;
  kind: "latency" | "availability" | "queue" | "dependency" | "integrity";
  value: number;
  threshold: number;
  tenant?: string;
  dependency?: string;
};
export type RunbookStep = {
  id: string;
  action:
    | "inspect"
    | "shed-load"
    | "read-only"
    | "pause"
    | "failover"
    | "restore"
    | "rollback";
  requires?: string[];
};
export type IncidentDiagnosis = {
  alertId: string;
  rootCause: string;
  confidence: number;
  evidence: string[];
  runbook: RunbookStep[];
  digest: string;
};
export type RunbookExercise = {
  completed: string[];
  skipped: string[];
  resolved: boolean;
  trace: Array<{
    step: string;
    atMs: number;
    outcome: "completed" | "skipped";
  }>;
};

export function diagnoseAlert(
  signals: DiagnosticSignal[],
  runbooks: Record<string, RunbookStep[]>,
): IncidentDiagnosis {
  const breached = signals.filter((s) => s.value > s.threshold);
  if (!breached.length) throw new Error("alert has no breached signal");
  const integrity = breached.find((s) => s.kind === "integrity");
  const dependency = breached.find((s) => s.kind === "dependency");
  const queue = breached.find((s) => s.kind === "queue");
  const cause = integrity
    ? `integrity:${integrity.service}`
    : dependency
      ? `dependency:${dependency.dependency ?? "unknown"}`
      : queue
        ? `capacity:${queue.tenant ?? queue.service}`
        : `service:${breached[0]!.service}`;
  const runbook = runbooks[cause];
  if (!runbook?.length) throw new Error(`no runbook for ${cause}`);
  const evidence = breached
    .map((s) => `${s.service}.${s.kind}=${s.value}>${s.threshold}`)
    .sort();
  const body = {
    alertId: hash({ evidence, cause }),
    rootCause: cause,
    confidence: integrity || dependency ? 1 : 0.75,
    evidence,
    runbook: structuredClone(runbook),
  };
  return { ...body, digest: hash(body) };
}

export function exerciseRunbook(
  diagnosis: IncidentDiagnosis,
  startMs: number,
  execute: (step: RunbookStep) => boolean,
): RunbookExercise {
  if (
    diagnosis.digest !==
    hash({
      alertId: diagnosis.alertId,
      rootCause: diagnosis.rootCause,
      confidence: diagnosis.confidence,
      evidence: diagnosis.evidence,
      runbook: diagnosis.runbook,
    })
  )
    throw new Error("diagnosis integrity failure");
  const completed = new Set<string>(),
    skipped: string[] = [],
    trace: RunbookExercise["trace"] = [];
  for (let i = 0; i < diagnosis.runbook.length; i++) {
    const step = diagnosis.runbook[i]!;
    if ((step.requires ?? []).some((r) => !completed.has(r))) {
      skipped.push(step.id);
      trace.push({ step: step.id, atMs: startMs + i, outcome: "skipped" });
      continue;
    }
    if (execute(step)) {
      completed.add(step.id);
      trace.push({ step: step.id, atMs: startMs + i, outcome: "completed" });
    } else {
      skipped.push(step.id);
      trace.push({ step: step.id, atMs: startMs + i, outcome: "skipped" });
    }
  }
  return {
    completed: [...completed],
    skipped,
    resolved: diagnosis.runbook.every((s) => completed.has(s.id)),
    trace,
  };
}

export const RUNTIME_SERVICES: readonly RuntimeService[] = ["api", "compiler", "registry", "event-store", "reconciler", "interaction", "worker", "adapter"];
export class ReliabilitySloController {
  private specifications: Map<RuntimeService, ServiceSlo>;
  constructor(slos: ServiceSlo[]) { if (slos.length !== RUNTIME_SERVICES.length || new Set(slos.map((s) => s.service)).size !== RUNTIME_SERVICES.length || RUNTIME_SERVICES.some((service) => !slos.some((s) => s.service === service))) throw new Error("all eight runtime service SLOs required exactly once"); for (const slo of slos) validateSlo(slo); this.specifications = new Map(slos.map((s) => [s.service, structuredClone(s)])); }
  evaluate(samples: Record<RuntimeService, SliSample[]>, nowMs: number) { const reports = Object.fromEntries(RUNTIME_SERVICES.map((service) => [service, measureSlo(this.specifications.get(service)!, samples[service] ?? [], nowMs)])) as Record<RuntimeService, SloReport>; const modes = Object.fromEntries(RUNTIME_SERVICES.map((service) => [service, reports[service].violated ? this.specifications.get(service)!.degradation : "normal"])) as Record<RuntimeService, ReliabilityMode>; return { reports, modes, errorBudgetViolated: RUNTIME_SERVICES.filter((service) => reports[service].errorBudgetRemaining < 0) }; }
}

export type ServiceTopology = { service: RuntimeService; zone: string; region: string; dependencies: string[] };
export type InjectedFault = { domain: FaultDomain; target: string; atMs: number; durationMs: number };
export type FaultImpact = { fault: InjectedFault; unavailable: RuntimeService[]; degraded: RuntimeService[]; trace: string[] };
export class DeterministicFaultInjector {
  constructor(private topology: ServiceTopology[]) { if (topology.length !== 8 || new Set(topology.map((x) => x.service)).size !== 8 || topology.some((x) => !x.zone || !x.region)) throw new Error("complete eight-service topology required"); }
  inject(fault: InjectedFault): FaultImpact { if (fault.durationMs < 0 || !Number.isFinite(fault.atMs)) throw new Error("fault schedule invalid"); const direct = new Set<RuntimeService>(); if (fault.domain === "zone") this.topology.filter((x) => x.zone === fault.target).forEach((x) => direct.add(x.service)); else if (fault.domain === "region") this.topology.filter((x) => x.region === fault.target).forEach((x) => direct.add(x.service)); else if (["storage","control-plane"].includes(fault.domain)) this.topology.filter((x) => x.service === fault.target).forEach((x) => direct.add(x.service)); else if (["dependency","network"].includes(fault.domain)) this.topology.filter((x) => x.dependencies.includes(fault.target) || x.service === fault.target).forEach((x) => direct.add(x.service)); if (!direct.size) throw new Error("fault target absent from topology"); const degraded = new Set<RuntimeService>(); let changed = true; while (changed) { changed = false; for (const node of this.topology) if (!direct.has(node.service) && !degraded.has(node.service) && node.dependencies.some((d) => direct.has(d as RuntimeService) || degraded.has(d as RuntimeService))) { degraded.add(node.service); changed = true; } } return { fault: structuredClone(fault), unavailable: [...direct].sort(), degraded: [...degraded].sort(), trace: [`inject:${fault.domain}:${fault.target}@${fault.atMs}`, ...[...direct].sort().map((s) => `unavailable:${s}`), ...[...degraded].sort().map((s) => `degraded:${s}`), `recover@${fault.atMs + fault.durationMs}`] }; }
}

export interface RestorePort { restore(service: RuntimeService, state: unknown): { service: RuntimeService; durationMs: number; receipt: string } }
export type CompleteRestoreReport = { startedAtMs: number; completedAtMs: number; wallClockRtoMs: number; orderedReceipts: Array<{ service: RuntimeService; receipt: string }>; withinRto: boolean };
export function orchestrateCompleteRestore(policy: DisasterPolicy, componentState: Record<string, unknown>, startedAtMs: number, port: RestorePort): CompleteRestoreReport { let elapsed = 0; const orderedReceipts: CompleteRestoreReport["orderedReceipts"] = []; for (const service of policy.restoreOrder) { const result = port.restore(service, componentState[service]); if (result.service !== service || !Number.isFinite(result.durationMs) || result.durationMs < 0 || !result.receipt) throw new Error("restore port acknowledgement invalid"); elapsed += result.durationMs; orderedReceipts.push({ service, receipt: result.receipt }); } return { startedAtMs, completedAtMs: startedAtMs + elapsed, wallClockRtoMs: elapsed, orderedReceipts, withinRto: elapsed <= policy.rtoMs }; }

export type OperationalServiceState = { service: RuntimeService; version: number; schemaVersion: number; credential: string; credentialStatus: "active" | "rotating" | "revoked"; maintenance: boolean; drained: boolean; decommissioned: boolean };
export class ReliabilityOperationsController {
  private services = new Map<RuntimeService, OperationalServiceState>(); private trace: string[] = [];
  constructor(initial: OperationalServiceState[], private supportedSchemas: number[], private skew: number) { if (initial.length !== 8 || new Set(initial.map((x) => x.service)).size !== 8) throw new Error("complete service operations state required"); initial.forEach((x) => this.services.set(x.service, structuredClone(x))); }
  beginMaintenance(service: RuntimeService, nowMs: number, window: { startMs: number; endMs: number }) { const s = this.get(service); if (nowMs < window.startMs || nowMs > window.endMs || s.decommissioned) throw new Error("unsafe maintenance window"); s.maintenance = true; this.trace.push(`maintenance:start:${service}:${nowMs}`); }
  endMaintenance(service: RuntimeService) { const s = this.get(service); if (!s.maintenance) throw new Error("maintenance not active"); s.maintenance = false; this.trace.push(`maintenance:end:${service}`); }
  rolloutSchema(service: RuntimeService, schemaVersion: number) { const s = this.get(service); if (!s.maintenance || !this.supportedSchemas.includes(schemaVersion) || Math.abs(schemaVersion - s.schemaVersion) > this.skew) throw new Error("unsafe schema rollout"); s.schemaVersion = schemaVersion; this.trace.push(`schema:${service}:${schemaVersion}`); }
  rollVersion(service: RuntimeService, version: number) { const s = this.get(service); if (!s.maintenance || Math.abs(version - s.version) > 1) throw new Error("unsafe rolling upgrade or downgrade"); s.version = version; this.trace.push(`version:${service}:${version}`); }
  beginCredentialRotation(service: RuntimeService, replacement: string) { const s = this.get(service); if (!s.maintenance || !replacement || replacement === s.credential) throw new Error("credential rotation invalid"); s.credential = replacement; s.credentialStatus = "rotating"; this.trace.push(`credential:rotate:${service}`); }
  finishCredentialRotation(service: RuntimeService) { const s = this.get(service); if (s.credentialStatus !== "rotating") throw new Error("credential rotation not active"); s.credentialStatus = "active"; this.trace.push(`credential:active:${service}`); }
  drain(service: RuntimeService) { const s = this.get(service); if (!s.maintenance) throw new Error("drain requires maintenance"); s.drained = true; this.trace.push(`drain:${service}`); }
  decommission(service: RuntimeService, backupReceipt: string) { const s = this.get(service); if (!s.maintenance || !s.drained || !backupReceipt || s.credentialStatus === "rotating") throw new Error("unsafe decommission"); s.credentialStatus = "revoked"; s.decommissioned = true; this.trace.push(`decommission:${service}:${backupReceipt}`); }
  snapshot() { return { services: Object.fromEntries([...this.services].map(([k,v]) => [k, structuredClone(v)])) as Record<RuntimeService, OperationalServiceState>, trace: [...this.trace] }; }
  private get(service: RuntimeService) { const s = this.services.get(service); if (!s) throw new Error("unknown operational service"); return s; }
}

export type ReliabilityResourceDemand = { tenant: string; cpu: number; memory: number; tokens: number; weight: number };
export type ResourceFairnessReport = { allocations: Record<string, { cpu: number; memory: number; tokens: number }>; dominantShares: Record<string, number>; starved: string[] };
export function simulateResourceSaturation(capacity: { cpu: number; memory: number; tokens: number }, demands: ReliabilityResourceDemand[]): ResourceFairnessReport { if (Object.values(capacity).some((v) => !Number.isSafeInteger(v) || v < 1) || !demands.length || demands.some((d) => !d.tenant || d.weight < 1 || [d.cpu,d.memory,d.tokens].some((v) => !Number.isSafeInteger(v) || v < 0))) throw new Error("resource saturation input invalid"); const allocations = Object.fromEntries(demands.map((d) => [d.tenant, { cpu: 0, memory: 0, tokens: 0 }])) as ResourceFairnessReport["allocations"], remaining = { ...capacity }, dominant = (tenant: string, weight: number) => { const a = allocations[tenant]!; return Math.max(a.cpu/capacity.cpu, a.memory/capacity.memory, a.tokens/capacity.tokens)/weight; }; let progressed = true; while (progressed) { progressed = false; for (const demand of [...demands].sort((a,b) => dominant(a.tenant, a.weight) - dominant(b.tenant, b.weight) || a.tenant.localeCompare(b.tenant))) { const a = allocations[demand.tenant]!, step = { cpu: Math.min(demand.weight, demand.cpu-a.cpu), memory: Math.min(demand.weight, demand.memory-a.memory), tokens: Math.min(demand.weight, demand.tokens-a.tokens) }; if (step.cpu <= remaining.cpu && step.memory <= remaining.memory && step.tokens <= remaining.tokens && Object.values(step).some((v) => v > 0)) { a.cpu += step.cpu; a.memory += step.memory; a.tokens += step.tokens; remaining.cpu -= step.cpu; remaining.memory -= step.memory; remaining.tokens -= step.tokens; progressed = true; } } } const dominantShares = Object.fromEntries(demands.map((d) => [d.tenant, dominant(d.tenant, d.weight)])); return { allocations, dominantShares, starved: demands.filter((d) => d.cpu+d.memory+d.tokens > 0 && Object.values(allocations[d.tenant]!).every((v) => v === 0)).map((d) => d.tenant) }; }

export type OperatorDrillArtifact = { schema: "autonomy.operator-drill.v1"; operator: { id: string; familiarity: "unfamiliar" | "familiar" | "simulated" }; diagnosisDigest: string; exercise: RunbookExercise; startedAtMs: number; completedAtMs: number; resolvedRootCause: string; evidence: string[]; synthetic: boolean; digest: string };
export function buildOperatorDrillArtifact(operator: OperatorDrillArtifact["operator"], diagnosis: IncidentDiagnosis, exercise: RunbookExercise, startedAtMs: number, completedAtMs: number, evidence: string[]): OperatorDrillArtifact { if (!operator.id || completedAtMs < startedAtMs || !evidence.length || !exercise.resolved) throw new Error("operator drill evidence incomplete"); const synthetic = operator.familiarity === "simulated", body = { schema: "autonomy.operator-drill.v1" as const, operator, diagnosisDigest: diagnosis.digest, exercise: structuredClone(exercise), startedAtMs, completedAtMs, resolvedRootCause: diagnosis.rootCause, evidence: [...evidence], synthetic }; return { ...body, digest: hash(body) }; }

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
