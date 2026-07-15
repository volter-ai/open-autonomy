import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
export type CommandKind =
  | "status"
  | "explain"
  | "create-work"
  | "question"
  | "answer"
  | "approve"
  | "mutate"
  | "pause"
  | "resume"
  | "repair"
  | "rollback"
  | "revoke";
export type EvidenceRef = {
  kind: string;
  uri: string;
  digest?: string;
  verified: boolean;
  provenance: {
    executor: string;
    requestDigest: string;
    effectId: string;
    artifact?: string;
    scope: string;
    receiptDigest: string;
    signature: string;
  };
};
export type EpistemicResult = {
  summary: string;
  evidence: EvidenceRef[];
  assumptions: string[];
  conflicts: string[];
  unknowns: string[];
};
export type CommandRequest = {
  kind: CommandKind;
  workId?: string;
  artifact?: string;
  scope: string;
  payload?: Record<string, unknown>;
  decision?: "approve" | "reject";
};
export type TypedConfirmation = {
  id: string;
  requestDigest: string;
  identity: string;
  tenant: string;
  channel: string;
  thread: string;
  artifact?: string;
  scope: string;
  expiresAt: string;
  signature: string;
  approvalId?: string;
};
export type CommandEnvelope = {
  schema: "autonomy.command-envelope.v1";
  id: string;
  tenant: string;
  identity: string;
  channel: string;
  thread: string;
  at: string;
  expiresAt: string;
  idempotencyKey: string;
  request: CommandRequest;
  confirmation?: TypedConfirmation;
  signature: string;
};
export type CommandResponse = {
  id: string;
  status: "answered" | "confirmation-required" | "executed" | "refused";
  correlationId: string;
  result: EpistemicResult;
  confirmationRequestDigest?: string;
};
export interface CommandPlaneTrust {
  verifyEnvelope(digest: string, signature: string, identity: string): boolean;
  verifyConfirmation(
    digest: string,
    signature: string,
    identity: string,
  ): boolean;
  signState(digest: string): string;
  verifyState(digest: string, signature: string): boolean;
  verifyAdministrative(
    digest: string,
    signature: string,
    identity: string,
  ): boolean;
  verifyEvidence(digest: string, signature: string, executor: string): boolean;
  hasRole(identity: string, role: string, tenant: string): boolean;
}
export interface CommandExecutor {
  identity: string;
  read(request: CommandRequest, authority: { idempotencyKey: string }): EpistemicResult;
  execute(
    request: CommandRequest,
    authority: {
      tenant: string;
      identity: string;
      scope: string;
      artifact?: string;
      approvalId?: string;
      idempotencyKey: string;
      confirmationId?: string;
    },
  ): EpistemicResult;
}
export interface CommandPlaneStore {
  load(tenant: string): CommandPlaneState | undefined;
  compareAndSwap(
    tenant: string,
    expected: number | undefined,
    next: CommandPlaneState,
  ): boolean;
}
export type CommandAuditPort = Pick<OrganizationalCommandPlane, "recordDelivery" | "recordTransportRejection">;
export type AdministrativeAction = {
  schema: "autonomy.command-administration.v1";
  id: string;
  tenant: string;
  identity: string;
  at: string;
  expiresAt: string;
  idempotencyKey: string;
  operation:
    | {
        kind: "create-approval";
        approvalId: string;
        requestDigest: string;
        artifact?: string;
        scope: string;
        issuedAt: string;
        expiresAt: string;
        quorum: number;
        requiredRoles: string[];
      }
    | {
        kind: "vote-approval";
        approvalId: string;
        role: string;
        decision: "approve" | "reject";
      }
    | { kind: "revoke-approval"; approvalId: string }
    | {
        kind: "set-preferences";
        subject: string;
        channels: string[];
        fallback: "web" | "cli" | "none";
        suppressedKinds?: CommandKind[];
      };
  signature: string;
};
export class MemoryCommandPlaneStore implements CommandPlaneStore {
  private values = new Map<string, CommandPlaneState>();
  load(k: string) {
    const v = this.values.get(k);
    return v && structuredClone(v);
  }
  compareAndSwap(k: string, e: number | undefined, n: CommandPlaneState) {
    if (this.values.get(k)?.generation !== e) return false;
    this.values.set(k, structuredClone(n));
    return true;
  }
}
export class FileCommandPlaneStore implements CommandPlaneStore {
  constructor(private root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  private path(t: string) {
    return join(
      this.root,
      `${createHash("sha256").update(t).digest("hex")}.command.json`,
    );
  }
  load(t: string) {
    try {
      return JSON.parse(
        readFileSync(this.path(t), "utf8"),
      ) as CommandPlaneState;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  }
  compareAndSwap(t: string, e: number | undefined, n: CommandPlaneState) {
    const p = this.path(t),
      l = `${p}.lock`;
    const lock = this.acquireLock(l);
    if (lock === undefined) return false;
    try {
      if (this.load(t)?.generation !== e) return false;
      const temp = `${p}.${process.pid}.${Date.now()}.tmp`,
        fd = openSync(temp, "wx", 0o600);
      try {
        writeFileSync(fd, canonicalSemanticJson(n));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temp, p);
      const dir = openSync(this.root, "r");
      try {
        fsyncSync(dir);
      } finally {
        closeSync(dir);
      }
      return true;
    } finally {
      closeSync(lock!);
      rmSync(l, { force: true });
    }
  }

  private acquireLock(path: string): number | undefined {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = openSync(path, "wx", 0o600);
        writeFileSync(fd, canonicalSemanticJson({ pid: process.pid }));
        fsyncSync(fd);
        return fd;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let owner: { pid?: number };
        try {
          owner = JSON.parse(readFileSync(path, "utf8"));
        } catch {
          return undefined;
        }
        if (!Number.isSafeInteger(owner.pid) || this.processExists(owner.pid!))
          return undefined;
        rmSync(path, { force: true });
      }
    }
    return undefined;
  }

  private processExists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }
}
export type CommandPlaneState = {
  schema: "autonomy.command-plane-state.v1";
  tenant: string;
  generation: number;
  seen: Record<string, { digest: string; response: CommandResponse }>;
  approvals: Record<
    string,
    {
      requestDigest: string;
      artifact?: string;
      scope: string;
      identity: string;
      issuedAt: string;
      expiresAt: string;
      revoked: boolean;
      quorum: number;
      requiredRoles: string[];
      votes: Record<
        string,
        { identity: string; role: string; decision: "approve" | "reject" }
      >;
      approved: boolean;
    }
  >;
  audit: Array<{
    id: string;
    at: string;
    identity: string;
    channel: string;
    thread: string;
    requestDigest: string;
    outcome: CommandResponse["status"];
    evidence: EvidenceRef[];
    category?: "command" | "rejected" | "administration" | "delivery";
    detail?: string;
  }>;
  preferences: Record<
    string,
    {
      channels: string[];
      accessibleFallback: "web" | "cli" | "none";
      suppressedKinds: CommandKind[];
    }
  >;
  administrativeSeen: Record<string, string>;
  confirmations: Record<
    string,
    { idempotencyKey: string; requestDigest: string }
  >;
  effects: Record<
    string,
    {
      requestDigest: string;
      status: "prepared" | "executed";
      response?: CommandResponse;
    }
  >;
  digest: string;
  signature: string;
};
const privileged = new Set<CommandKind>([
  "create-work",
  "approve",
  "mutate",
  "pause",
  "resume",
  "repair",
  "rollback",
  "revoke",
]);
const commandKinds = new Set<CommandKind>([
  "status", "explain", "create-work", "question", "answer", "approve",
  "mutate", "pause", "resume", "repair", "rollback", "revoke",
]);
export class OrganizationalCommandPlane {
  constructor(
    readonly tenant: string,
    private trust: CommandPlaneTrust,
    private store: CommandPlaneStore,
    private executor: CommandExecutor,
    private clock: () => string = () => new Date().toISOString(),
    private auditCapability: object = Object.freeze({ disabled: true }),
  ) {
    if (!tenant) throw new Error("command tenant required");
    this.initialize();
  }
  auditPort(capability: object): CommandAuditPort {
    if (capability !== this.auditCapability) throw new Error("command audit capability denied");
    return {
      recordDelivery: (input) => this.recordDelivery(input, capability),
      recordTransportRejection: (input) => this.recordTransportRejection(input, capability),
    } as CommandAuditPort;
  }
  submit(envelope: CommandEnvelope): CommandResponse {
    const now = this.clock(),
      requestDigest = digest(envelope.request),
      unsigned = {
        schema: envelope.schema,
        id: envelope.id,
        tenant: envelope.tenant,
        identity: envelope.identity,
        channel: envelope.channel,
        thread: envelope.thread,
        at: envelope.at,
        expiresAt: envelope.expiresAt,
        idempotencyKey: envelope.idempotencyKey,
        request: envelope.request,
        ...(envelope.confirmation
          ? { confirmation: envelope.confirmation }
          : {}),
      },
      envelopeDigest = digest(unsigned);
    try {
      this.validateEnvelope(envelope, now, envelopeDigest);
    } catch (error) {
      this.recordExceptional(envelope, "rejected", (error as Error).message);
      throw error;
    }
    const prior = this.current().seen[envelope.idempotencyKey];
    if (prior) {
      if (prior.digest !== envelopeDigest) {
        this.recordExceptional(
          envelope,
          "rejected",
          "command idempotency equivocation",
        );
        throw new Error("command idempotency equivocation");
      }
      return structuredClone(prior.response);
    }
    let response: CommandResponse;
    if (!privileged.has(envelope.request.kind)) {
      try {
        response = this.answer(envelope, this.executor.read(envelope.request, { idempotencyKey: envelope.idempotencyKey }));
      } catch (error) {
        this.recordExceptional(envelope, "rejected", (error as Error).message);
        throw error;
      }
    } else if (!envelope.confirmation) {
      response = {
        id: digest({ envelope: envelope.id, kind: "confirmation-required" }),
        status: "confirmation-required",
        correlationId: envelope.thread,
        result: {
          summary: "Typed confirmation required; no mutation executed.",
          evidence: [],
          assumptions: [],
          conflicts: [],
          unknowns: ["privileged command not confirmed"],
        },
        confirmationRequestDigest: requestDigest,
      };
    } else {
      try {
        this.validateConfirmation(
          envelope,
          envelope.confirmation,
          requestDigest,
          now,
        );
        this.validateConfirmedAdministration(envelope);
        const usedConfirmation =
          this.current().confirmations[envelope.confirmation.id];
        if (
          usedConfirmation &&
          (usedConfirmation.idempotencyKey !== envelope.idempotencyKey ||
            usedConfirmation.requestDigest !== requestDigest)
        )
          throw new Error("typed confirmation replay denied");
        if (!usedConfirmation)
          this.mutate((s) => {
            s.confirmations[envelope.confirmation!.id] = {
              idempotencyKey: envelope.idempotencyKey,
              requestDigest,
            };
          });
        const priorEffect = this.current().effects[envelope.idempotencyKey];
        if (priorEffect && priorEffect.requestDigest !== requestDigest)
          throw new Error("effect idempotency equivocation");
        if (!priorEffect)
          this.mutate((s) => {
            s.effects[envelope.idempotencyKey] = {
              requestDigest,
              status: "prepared",
            };
          });
        const recovered = this.current().effects[envelope.idempotencyKey];
        if (recovered?.status === "executed" && recovered.response)
          response = structuredClone(recovered.response);
        else {
          const result = this.executor.execute(envelope.request, {
            tenant: this.tenant,
            identity: envelope.identity,
            scope: envelope.request.scope,
            artifact: envelope.request.artifact,
            approvalId: envelope.confirmation.approvalId,
            idempotencyKey: envelope.idempotencyKey,
            confirmationId: envelope.confirmation.id,
          });
          response = {
            id: digest({ envelope: envelope.id, kind: "executed" }),
            status: "executed",
            correlationId: envelope.thread,
            result,
          };
          this.validateResult(result, envelope.request, envelope.idempotencyKey);
          this.applyConfirmedAdministration(envelope);
          this.mutate((s) => {
            s.effects[envelope.idempotencyKey] = {
              requestDigest,
              status: "executed",
              response: structuredClone(response),
            };
          });
        }
      } catch (error) {
        this.recordExceptional(envelope, "rejected", (error as Error).message);
        throw error;
      }
    }
    this.record(envelope, envelopeDigest, response);
    return response;
  }
  submitAdministrative(action: AdministrativeAction) {
    const { signature, ...unsigned } = action,
      actionDigest = digest(unsigned),
      now = Date.parse(this.clock());
    if (
      action.schema !== "autonomy.command-administration.v1" ||
      action.tenant !== this.tenant ||
      !action.id ||
      !action.identity ||
      !action.idempotencyKey ||
      !Number.isFinite(Date.parse(action.at)) ||
      Date.parse(action.at) > now + 60_000 ||
      !Number.isFinite(Date.parse(action.expiresAt)) ||
      Date.parse(action.expiresAt) < now ||
      !this.trust.verifyAdministrative(actionDigest, signature, action.identity)
    ) {
      this.recordAdministration(action, "rejected");
      throw new Error("administrative action authentication failed");
    }
    const prior = this.current().administrativeSeen[action.idempotencyKey];
    if (prior) {
      if (prior !== actionDigest) {
        this.recordAdministration(action, "rejected");
        throw new Error("administrative idempotency equivocation");
      }
      return;
    }
    try {
      this.applyAdministrativeOperation(action.identity, action.operation);
    } catch (error) {
      this.recordAdministration(action, "rejected");
      throw error;
    }
    this.mutate((s) => {
      s.administrativeSeen[action.idempotencyKey] = actionDigest;
    });
    this.recordAdministration(action, "executed");
  }
  recordDelivery(input: {
    id: string;
    identity: string;
    channel: string;
    thread: string;
    requestDigest: string;
    status: "executed" | "refused";
    detail: string;
  }, capability?: object) {
    if (capability !== this.auditCapability) throw new Error("command audit capability denied");
    this.mutate((s) => {
      s.audit.push({
        id: input.id,
        at: this.clock(),
        identity: input.identity,
        channel: input.channel,
        thread: input.thread,
        requestDigest: input.requestDigest,
        outcome: input.status,
        evidence: [],
        category: "delivery",
        detail: input.detail,
      });
    });
  }
  recordTransportRejection(input: {
    id: string;
    identity?: string;
    channel: string;
    thread?: string;
    detail: string;
  }, capability?: object) {
    if (capability !== this.auditCapability) throw new Error("command audit capability denied");
    this.mutate((s) => {
      s.audit.push({
        id: input.id,
        at: this.clock(),
        identity: `unverified:${input.identity ?? "unknown"}`,
        channel: input.channel,
        thread: input.thread ?? "unknown",
        requestDigest: digest(input),
        outcome: "refused",
        evidence: [],
        category: "rejected",
        detail: input.detail,
      });
    });
  }
  preferences(identity: string) {
    return structuredClone(
      this.current().preferences[identity] ?? {
        channels: ["slack"],
        accessibleFallback: "none" as const,
        suppressedKinds: [],
      },
    );
  }
  recover(identity: string, channel: string, thread: string) {
    return this.current()
      .audit.filter(
        (a) =>
          a.identity === identity &&
          a.channel === channel &&
          a.thread === thread,
      )
      .map((x) => structuredClone(x));
  }
  current() {
    const s = this.store.load(this.tenant);
    if (!s) {
      throw new Error("command state missing");
    }
    const expected = digest(body(s));
    if (
      s.digest !== expected ||
      !this.trust.verifyState(expected, s.signature) ||
      s.audit.length > 20_000 ||
      Object.keys(s.seen).length > 20_000
    )
      throw new Error("command state authentication failed");
    return structuredClone(s);
  }
  private applyConfirmedAdministration(envelope: CommandEnvelope) {
    const payload = envelope.request.payload ?? {};
    if (envelope.request.kind === "approve") {
      if (
        typeof payload.approvalId !== "string" ||
        typeof payload.role !== "string" ||
        !envelope.request.decision
      )
        throw new Error("typed approval vote fields required");
      this.voteApprovalInternal(payload.approvalId, {
        identity: envelope.identity,
        role: payload.role,
        decision: envelope.request.decision,
      });
    }
    if (envelope.request.kind === "revoke") {
      if (typeof payload.approvalId !== "string")
        throw new Error("typed revocation approval id required");
      this.revokeInternal(envelope.identity, payload.approvalId);
    }
  }
  private validateConfirmedAdministration(envelope: CommandEnvelope) {
    const payload = envelope.request.payload ?? {};
    if (envelope.request.kind === "approve") {
      if (
        typeof payload.approvalId !== "string" ||
        typeof payload.role !== "string" ||
        !envelope.request.decision
      )
        throw new Error("typed approval vote fields required");
      const approval = this.current().approvals[payload.approvalId];
      if (
        !approval ||
        approval.revoked ||
        !approval.requiredRoles.includes(payload.role) ||
        !this.trust.hasRole(envelope.identity, payload.role, this.tenant)
      )
        throw new Error("approval role membership denied");
      if (
        Object.values(approval.votes).some(
          (vote) =>
            vote.identity === envelope.identity && vote.role !== payload.role,
        )
      )
        throw new Error("approval separation of duties violated");
    }
    if (envelope.request.kind === "revoke") {
      if (typeof payload.approvalId !== "string")
        throw new Error("typed revocation approval id required");
      const approval = this.current().approvals[payload.approvalId];
      if (
        !approval ||
        (approval.identity !== envelope.identity &&
          !this.trust.hasRole(envelope.identity, "approval-admin", this.tenant))
      )
        throw new Error("approval revocation authority denied");
    }
  }
  private applyAdministrativeOperation(
    identity: string,
    operation: AdministrativeAction["operation"],
  ) {
    if (operation.kind === "create-approval") {
      if (!this.trust.hasRole(identity, "approval-admin", this.tenant))
        throw new Error("approval administration role denied");
      if (
        !operation.approvalId ||
        !Number.isFinite(Date.parse(operation.issuedAt)) ||
        !Number.isFinite(Date.parse(operation.expiresAt)) ||
        Date.parse(operation.issuedAt) > Date.parse(this.clock()) + 60_000 ||
        Date.parse(operation.expiresAt) <= Date.parse(operation.issuedAt) ||
        Date.parse(operation.expiresAt) < Date.parse(this.clock()) ||
        !Number.isSafeInteger(operation.quorum) ||
        operation.quorum < 1 ||
        operation.quorum > operation.requiredRoles.length ||
        new Set(operation.requiredRoles).size !== operation.requiredRoles.length
      )
        throw new Error("approval quorum policy invalid");
      this.mutate((s) => {
        if (s.approvals[operation.approvalId])
          throw new Error("approval already exists");
        s.approvals[operation.approvalId] = {
          requestDigest: operation.requestDigest,
          artifact: operation.artifact,
          scope: operation.scope,
          identity,
          issuedAt: operation.issuedAt,
          expiresAt: operation.expiresAt,
          revoked: false,
          quorum: operation.quorum,
          requiredRoles: [...operation.requiredRoles],
          votes: {},
          approved: false,
        };
      });
    } else if (operation.kind === "vote-approval") {
      this.voteApprovalInternal(operation.approvalId, {
        identity,
        role: operation.role,
        decision: operation.decision,
      });
    } else if (operation.kind === "revoke-approval") {
      this.revokeInternal(identity, operation.approvalId);
    } else {
      if (
        identity !== operation.subject &&
        !this.trust.hasRole(identity, "preferences-admin", this.tenant)
      )
        throw new Error("notification preference authority denied");
      if (
        !operation.subject ||
        operation.channels.length > 20 ||
        new Set(operation.channels).size !== operation.channels.length
      )
        throw new Error("notification preference invalid");
      this.mutate((s) => {
        s.preferences[operation.subject] = {
          channels: [...operation.channels],
          accessibleFallback: operation.fallback,
          suppressedKinds: [...(operation.suppressedKinds ?? [])],
        };
      });
    }
  }
  private voteApprovalInternal(
    id: string,
    input: { identity: string; role: string; decision: "approve" | "reject" },
  ) {
    if (!this.trust.hasRole(input.identity, input.role, this.tenant))
      throw new Error("approval role membership denied");
    this.mutate((s) => {
      const a = s.approvals[id];
      if (!a || a.revoked || Date.parse(a.expiresAt) < Date.parse(this.clock()) || !a.requiredRoles.includes(input.role))
        throw new Error("approval vote authority denied");
      const prior = a.votes[input.role];
      if (
        prior &&
        (prior.identity !== input.identity || prior.decision !== input.decision)
      )
        throw new Error("approval role vote equivocation");
      if (
        Object.values(a.votes).some(
          (v) => v.identity === input.identity && v.role !== input.role,
        )
      )
        throw new Error("approval separation of duties violated");
      a.votes[input.role] ??= structuredClone(input);
      a.approved =
        Object.values(a.votes).filter((v) => v.decision === "approve").length >=
          a.quorum &&
        !Object.values(a.votes).some((v) => v.decision === "reject");
    });
  }
  private revokeInternal(identity: string, approvalId: string) {
    this.mutate((s) => {
      const a = s.approvals[approvalId];
      if (
        !a ||
        (a.identity !== identity &&
          !this.trust.hasRole(identity, "approval-admin", this.tenant))
      )
        throw new Error("approval revocation authority denied");
      a.revoked = true;
    });
  }
  private validateEnvelope(e: CommandEnvelope, now: string, d: string) {
    if (
      e.schema !== "autonomy.command-envelope.v1" ||
      e.tenant !== this.tenant ||
      !commandKinds.has(e.request?.kind) ||
      ![
        e.id,
        e.identity,
        e.channel,
        e.thread,
        e.idempotencyKey,
        e.request.scope,
      ].every((x) => typeof x === "string" && x.length > 0) ||
      !Number.isFinite(Date.parse(e.at)) ||
      Date.parse(e.at) > Date.parse(now) + 60_000 ||
      !Number.isFinite(Date.parse(e.expiresAt)) ||
      Date.parse(e.expiresAt) < Date.parse(now) ||
      !this.trust.verifyEnvelope(d, e.signature, e.identity)
    )
      throw new Error("command envelope authentication or binding failed");
  }
  private validateConfirmation(
    e: CommandEnvelope,
    c: TypedConfirmation,
    rd: string,
    now: string,
  ) {
    const cd = digest({
      id: c.id,
      requestDigest: c.requestDigest,
      identity: c.identity,
      tenant: c.tenant,
      channel: c.channel,
      thread: c.thread,
      artifact: c.artifact,
      scope: c.scope,
      expiresAt: c.expiresAt,
      approvalId: c.approvalId,
    });
    if (
      c.requestDigest !== rd ||
      typeof c.id !== "string" ||
      c.id.length === 0 ||
      c.identity !== e.identity ||
      c.tenant !== e.tenant ||
      c.channel !== e.channel ||
      c.thread !== e.thread ||
      c.artifact !== e.request.artifact ||
      c.scope !== e.request.scope ||
      !Number.isFinite(Date.parse(c.expiresAt)) ||
      Date.parse(c.expiresAt) < Date.parse(now) ||
      !this.trust.verifyConfirmation(cd, c.signature, c.identity)
    )
      throw new Error("typed confirmation binding failed");
    if (c.approvalId) {
      const a = this.current().approvals[c.approvalId];
      if (
        !a ||
        a.revoked ||
        Date.parse(a.expiresAt) < Date.parse(now) ||
        !a.approved ||
        a.requestDigest !== rd ||
        a.artifact !== c.artifact ||
        a.scope !== c.scope
      )
        throw new Error("approval absent, revoked, or confused-deputy bound");
    }
  }
  private answer(e: CommandEnvelope, result: EpistemicResult): CommandResponse {
    this.validateResult(result, e.request, e.idempotencyKey);
    return {
      id: digest({ envelope: e.id, kind: "answered" }),
      status: "answered",
      correlationId: e.thread,
      result,
    };
  }
  private record(e: CommandEnvelope, d: string, r: CommandResponse) {
    this.validateResult(r.result, e.request, e.idempotencyKey);
    this.mutate((s) => {
      s.seen[e.idempotencyKey] = { digest: d, response: structuredClone(r) };
      s.audit.push({
        id: r.id,
        at: this.clock(),
        identity: e.identity,
        channel: e.channel,
        thread: e.thread,
        requestDigest: digest(e.request),
        outcome: r.status,
        evidence: structuredClone(r.result.evidence),
        category: "command",
      });
    });
  }
  private recordExceptional(
    e: Partial<CommandEnvelope>,
    category: "rejected",
    detail: string,
  ) {
    this.mutate((s) => {
      s.audit.push({
        id: digest({ at: this.clock(), envelope: e.id ?? "unknown", detail }),
        at: this.clock(),
        identity: `unverified:${String(e.identity ?? "unknown")}`,
        channel: String(e.channel ?? "unknown"),
        thread: String(e.thread ?? "unknown"),
        requestDigest: digest(e.request ?? null),
        outcome: "refused",
        evidence: [],
        category,
        detail,
      });
    });
  }
  private recordAdministration(
    action: AdministrativeAction,
    outcome: "executed" | "rejected",
  ) {
    this.mutate((s) => {
      s.audit.push({
        id: digest({ administration: action.id, outcome }),
        at: this.clock(),
        identity: action.identity,
        channel: "administration",
        thread: action.id,
        requestDigest: digest(action.operation),
        outcome: outcome === "executed" ? "executed" : "refused",
        evidence: [],
        category: outcome === "executed" ? "administration" : "rejected",
        detail: action.operation.kind,
      });
    });
  }
  private validateResult(r: EpistemicResult, request: CommandRequest, effectId: string) {
    if (
      !r.summary || !Array.isArray(r.evidence) || !Array.isArray(r.assumptions) ||
      !Array.isArray(r.conflicts) || !Array.isArray(r.unknowns) ||
      (!r.evidence.length && !r.unknowns.length)
    ) throw new Error("epistemic result must expose evidence or uncertainty");
    for (const evidence of r.evidence) {
      const p = evidence.provenance;
      if (!evidence.verified || !evidence.digest || !p ||
        p.executor !== this.executor.identity ||
        p.requestDigest !== commandRequestDigest(request) ||
        p.effectId !== effectId || p.artifact !== request.artifact ||
        p.scope !== request.scope || p.receiptDigest !== evidence.digest ||
        !this.trust.verifyEvidence(evidenceDigest(evidence), p.signature, p.executor))
        throw new Error("evidence provenance authentication failed");
    }
  }
  private initialize() {
    if (this.store.load(this.tenant)) {
      this.current();
      return;
    }
    const b = {
        schema: "autonomy.command-plane-state.v1" as const,
        tenant: this.tenant,
        generation: 1,
        seen: {},
        approvals: {},
        audit: [],
        preferences: {},
        administrativeSeen: {},
        confirmations: {},
        effects: {},
      },
      d = digest(b),
      s = { ...b, digest: d, signature: this.trust.signState(d) };
    if (!this.store.compareAndSwap(this.tenant, undefined, s))
      throw new Error("command state creation race");
  }
  private mutate(fn: (s: CommandPlaneState) => void) {
    for (let i = 0; i < 12; i++) {
      const old = this.current(),
        next = structuredClone(old);
      fn(next);
      next.generation++;
      const d = digest(body(next));
      next.digest = d;
      next.signature = this.trust.signState(d);
      if (this.store.compareAndSwap(this.tenant, old.generation, next)) return;
    }
    throw new Error("command state CAS contention");
  }
}
export function evidenceDigest(e: EvidenceRef) {
  const { signature, ...provenance } = e.provenance;
  return digest({ kind: e.kind, uri: e.uri, digest: e.digest, verified: e.verified, provenance });
}
function body(s: CommandPlaneState) {
  const { digest: _, signature: __, ...b } = s;
  return b;
}
export function commandRequestDigest(r: CommandRequest) {
  return digest(r);
}
export function confirmationDigest(c: Omit<TypedConfirmation, "signature">) {
  return digest(c);
}
function digest(v: unknown) {
  return createHash("sha256").update(canonicalSemanticJson(v)).digest("hex");
}
