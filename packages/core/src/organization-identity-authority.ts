import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export type IdentityKind =
  "human" | "service" | "workload" | "provider" | "worker" | "session";
export type TenantIdentity = {
  id: string;
  tenant: string;
  kind: IdentityKind;
  issuer: string;
  status: "active" | "revoked";
  createdSequence: number;
  deployment?: string;
  actor?: string;
  attempt?: string;
  parent?: string;
  runtimeDigest?: string;
};
export type SignedIdentityLink = {
  id: string;
  tenant: string;
  subject: string;
  externalIssuer: string;
  externalSubject: string;
  purpose:
    "federation" | "provider-account" | "worker-parent" | "session-parent";
  providerAccount?: string;
  evidenceDigest: string;
  signer: string;
  algorithm: string;
  signature: string;
  revokedSequence?: number;
};
export type SignedLinkRevocation = {
  tenant: string;
  linkId: string;
  sequence: number;
  effectiveAt: string;
  evidence: {
    digest: string;
    signer: string;
    algorithm: string;
    signature: string;
  };
};
export type SignedIdentityRevocation = {
  tenant: string;
  identityId: string;
  sequence: number;
  effectiveAt: string;
  evidence: {
    digest: string;
    signer: string;
    algorithm: string;
    signature: string;
  };
};
export type AuthorityMutation =
  CredentialLifecycleEvent | SignedLinkRevocation | SignedIdentityRevocation;
export type Authority = {
  tenant: string;
  deployment: string;
  actor: string;
  attempt: string;
  worker: string;
  session?: string;
  resources: string[];
  effects: string[];
  audiences: string[];
  notBefore: string;
  expiresAt: string;
  constraints: Record<string, string>;
};
export type AuthorityGrant = {
  id: string;
  parent?: string;
  authority: Authority;
  issuer: string;
  sequence: number;
  proofDigest: string;
  kind?: "ordinary" | "break-glass";
  rootEvidence?: {
    signer: string;
    algorithm: string;
    signature: string;
  };
  delegationEvidence?: {
    signer: string;
    algorithm: string;
    signature: string;
  };
};
export type BreakGlassApproval = {
  approver: string;
  tenant: string;
  incident: string;
  grantDigest: string;
  statementDigest: string;
  signer: string;
  algorithm: string;
  signature: string;
};
export type CredentialHandle = {
  credentialId: string;
  tenant: string;
  generation: number;
  grantId: string;
  keyId: string;
  publicKeyThumbprint: string;
  secretReference: { provider: string; locator: string };
  issuedSequence: number;
};
export type CredentialLifecycleKind =
  | "issued"
  | "rotated"
  | "revoked"
  | "expired"
  | "compromised"
  | "break-glass-issued"
  | "break-glass-revoked"
  | "deleted";
export type CredentialLifecycleEvent = {
  id: string;
  tenant: string;
  credentialId: string;
  generation: number;
  sequence: number;
  priorDigest?: string;
  kind: CredentialLifecycleKind;
  authorityDigest: string;
  effectiveAt: string;
  issuer: string;
  evidence: {
    digest: string;
    signer: string;
    algorithm: string;
    signature: string;
  };
};
export type EffectRequest = {
  id: string;
  tenant: string;
  deployment: string;
  actor: string;
  attempt: string;
  worker: string;
  session?: string;
  resource: string;
  effect: string;
  audience: string;
  payloadDigest: string;
  context: Record<string, string>;
  requiredRevocationSequence: number;
  phase: "queued" | "pre-submit" | "post-submit" | "committed";
};
export type EffectProof = {
  credentialId: string;
  generation: number;
  requestDigest: string;
  audience: string;
  nonce: string;
  issuedAt: string;
  keyId: string;
  algorithm: string;
  signature: string;
};
export type AuthorizationDecision = {
  authorized: boolean;
  code: string;
  sequence: number;
  inFlight: "none" | "cancelled" | "in-doubt" | "committed";
  auditDigest: string;
};
export type CustodyOutboxEntry = {
  operationId: string;
  tenant: string;
  credentialId: string;
  generation: number;
  operation: "put" | "rotate" | "revoke" | "delete";
  status: "pending" | "failed";
  attempts: number;
  requestDigest: string;
  lastErrorDigest?: string;
};
export type AuthorityCheckpointEvidence = {
  digest: string;
  signer: string;
  algorithm: string;
  signature: string;
};
export type SecretCustody = {
  put(input: {
    operationId: string;
    tenant: string;
    credentialId: string;
    generation: number;
    secret: Uint8Array;
    expiresAt: string;
  }): Promise<{
    reference: { provider: string; locator: string };
    leaseId: string;
  }>;
  rotate(input: {
    operationId: string;
    tenant: string;
    credentialId: string;
    generation: number;
    secret: Uint8Array;
    expiresAt: string;
  }): Promise<{
    reference: { provider: string; locator: string };
    leaseId: string;
  }>;
  revoke(input: {
    operationId: string;
    tenant: string;
    credentialId: string;
    generation: number;
  }): Promise<void>;
  delete(input: {
    operationId: string;
    tenant: string;
    credentialId: string;
  }): Promise<void>;
  exchange(input: {
    tenant: string;
    credentialId: string;
    generation: number;
    audience: string;
    requestDigest: string;
  }): Promise<{ proofMaterial: Uint8Array; expiresAt: string }>;
};
export type AuthorityTrust = {
  verifyIdentityLink(link: SignedIdentityLink): boolean;
  verifyLinkRevocation(event: SignedLinkRevocation): boolean;
  verifyIdentityRevocation(event: SignedIdentityRevocation): boolean;
  verifyLifecycleEvent(event: CredentialLifecycleEvent): boolean;
  verifyRootGrant(grant: AuthorityGrant): boolean;
  verifyDelegatedGrant(grant: AuthorityGrant, parent: AuthorityGrant): boolean;
  verifyBreakGlassApproval(approval: BreakGlassApproval): boolean;
  verifyCheckpoint(evidence: AuthorityCheckpointEvidence): boolean;
  verifyEffectProof(input: {
    handle: CredentialHandle;
    proof: EffectProof;
    requestBytes: Uint8Array;
  }): boolean;
  now(): Date;
};

const digest = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
const iso = (value: string) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`invalid timestamp '${value}'`);
  return time;
};
const unique = (values: string[]) => values.length === new Set(values).size;
const subset = (child: string[], parent: string[]) =>
  child.every((value) => parent.includes(value));
const requestBody = (
  request: EffectRequest,
  proof: Pick<
    EffectProof,
    "credentialId" | "generation" | "audience" | "nonce" | "issuedAt" | "keyId"
  >,
) => ({
  request,
  credentialId: proof.credentialId,
  generation: proof.generation,
  audience: proof.audience,
  nonce: proof.nonce,
  issuedAt: proof.issuedAt,
  keyId: proof.keyId,
});

export function authorityAttenuates(
  parent: Authority,
  child: Authority,
): boolean {
  return (
    parent.tenant === child.tenant &&
    parent.deployment === child.deployment &&
    parent.actor === child.actor &&
    parent.attempt === child.attempt &&
    parent.worker === child.worker &&
    (!parent.session || parent.session === child.session) &&
    subset(child.resources, parent.resources) &&
    subset(child.effects, parent.effects) &&
    subset(child.audiences, parent.audiences) &&
    iso(child.notBefore) >= iso(parent.notBefore) &&
    iso(child.expiresAt) <= iso(parent.expiresAt) &&
    Object.entries(parent.constraints).every(
      ([key, value]) => child.constraints[key] === value,
    )
  );
}
export function effectRequestDigest(
  request: EffectRequest,
  proof: Pick<
    EffectProof,
    "credentialId" | "generation" | "audience" | "nonce" | "issuedAt" | "keyId"
  >,
): string {
  return digest(requestBody(request, proof));
}

type CredentialState = {
  generation: number;
  status: "active" | "revoked" | "expired" | "compromised" | "deleted";
  sequence: number;
  authorityDigest: string;
  breakGlass: boolean;
};
type AuditRecord = {
  sequence: number;
  tenant: string;
  kind: string;
  subject: string;
  decision: string;
  detailDigest: string;
};

const tenantKey = (tenant: string, id: string) => `${tenant}\u0000${id}`;

export class OrganizationAuthorityPlane {
  readonly identities = new Map<string, TenantIdentity>();
  readonly links = new Map<string, SignedIdentityLink>();
  readonly linkRevocations: SignedLinkRevocation[] = [];
  readonly identityRevocations: SignedIdentityRevocation[] = [];
  readonly grants = new Map<string, AuthorityGrant>();
  readonly credentials = new Map<string, CredentialHandle>();
  readonly lifecycle: CredentialLifecycleEvent[] = [];
  readonly audit: AuditRecord[] = [];
  readonly tombstones = new Set<string>();
  readonly custodyOutbox = new Map<string, CustodyOutboxEntry>();
  private credentialState = new Map<string, CredentialState>();
  private nonces = new Set<string>();
  private gatewayWatermarks = new Map<string, number>();
  private authoritativeSequences = new Map<string, number>();
  private unavailableAfterRestore = new Set<string>();
  private nondelegableGrants = new Set<string>();
  constructor(
    private readonly trust: AuthorityTrust,
    private readonly custody: SecretCustody,
  ) {}
  registerIdentity(identity: TenantIdentity) {
    if (
      !identity.id ||
      !identity.tenant ||
      this.identities.has(tenantKey(identity.tenant, identity.id)) ||
      identity.createdSequence <= 0
    )
      throw new Error("identity is incomplete or duplicate");
    if (
      identity.kind === "worker" &&
      (!identity.deployment ||
        !identity.actor ||
        !identity.attempt ||
        !identity.runtimeDigest)
    )
      throw new Error("worker identity lacks workload and runtime binding");
    if (
      identity.kind === "session" &&
      (!identity.parent ||
        this.identities.get(tenantKey(identity.tenant, identity.parent))
          ?.kind !== "worker")
    )
      throw new Error("session identity lacks worker parent");
    if (
      identity.parent &&
      !this.identities.has(tenantKey(identity.tenant, identity.parent))
    )
      throw new Error("cross-tenant identity parent is prohibited");
    this.identities.set(
      tenantKey(identity.tenant, identity.id),
      structuredClone(identity),
    );
  }
  revokeIdentity(event: SignedIdentityRevocation) {
    const identity = this.identities.get(
      tenantKey(event.tenant, event.identityId),
    );
    const current = this.authoritativeSequences.get(event.tenant) ?? 0;
    const { evidence, ...statement } = event;
    if (
      !identity ||
      event.sequence !== current + 1 ||
      evidence.digest !== digest(statement) ||
      !this.trust.verifyIdentityRevocation(event) ||
      this.identityRevocations.some(
        (value) =>
          value.tenant === event.tenant &&
          value.identityId === event.identityId,
      )
    )
      throw new Error(
        "identity revocation is stale, unsigned, replayed, or untrusted",
      );
    identity.status = "revoked";
    this.identityRevocations.push(structuredClone(event));
    this.authoritativeSequences.set(event.tenant, event.sequence);
  }
  addLink(link: SignedIdentityLink) {
    const {
        evidenceDigest,
        signer: _,
        algorithm: __,
        signature: ___,
        revokedSequence: ____,
        ...statement
      } = link,
      subject = this.identities.get(tenantKey(link.tenant, link.subject));
    if (
      evidenceDigest !== digest(statement) ||
      !subject ||
      subject.tenant !== link.tenant ||
      !this.trust.verifyIdentityLink(link) ||
      this.links.has(tenantKey(link.tenant, link.id))
    )
      throw new Error("identity link is untrusted, duplicate, or cross-tenant");
    if (link.providerAccount) {
      const provider = this.identities.get(
        tenantKey(link.tenant, link.providerAccount),
      );
      if (
        !provider ||
        provider.kind !== "provider" ||
        provider.tenant !== link.tenant
      )
        throw new Error("provider account link is invalid");
    }
    this.links.set(tenantKey(link.tenant, link.id), structuredClone(link));
  }
  revokeLink(event: SignedLinkRevocation) {
    const link = this.links.get(tenantKey(event.tenant, event.linkId));
    const current = this.authoritativeSequences.get(event.tenant) ?? 0;
    const { evidence, ...statement } = event;
    if (
      !link ||
      event.sequence !== current + 1 ||
      evidence.digest !== digest(statement) ||
      !this.trust.verifyLinkRevocation(event)
    )
      throw new Error("link revocation is stale, unsigned, or untrusted");
    link.revokedSequence = event.sequence;
    this.linkRevocations.push(structuredClone(event));
    this.authoritativeSequences.set(event.tenant, event.sequence);
  }
  issueGrant(grant: AuthorityGrant) {
    if (
      this.grants.has(tenantKey(grant.authority.tenant, grant.id)) ||
      !unique(grant.authority.resources) ||
      !unique(grant.authority.effects) ||
      !unique(grant.authority.audiences)
    )
      throw new Error("grant is duplicate or non-canonical");
    const issuer = this.identities.get(
      tenantKey(grant.authority.tenant, grant.issuer),
    );
    if (
      !issuer ||
      issuer.tenant !== grant.authority.tenant ||
      issuer.status !== "active"
    )
      throw new Error("grant issuer is not an active tenant identity");
    const statementDigest = digest({
      id: grant.id,
      ...(grant.parent ? { parent: grant.parent } : {}),
      authority: grant.authority,
      issuer: grant.issuer,
      sequence: grant.sequence,
      kind: grant.kind ?? "ordinary",
    });
    if (grant.proofDigest !== statementDigest)
      throw new Error("grant statement digest is invalid");
    if (grant.parent) {
      const parentKey = tenantKey(grant.authority.tenant, grant.parent);
      const parent = this.grants.get(parentKey);
      if (
        !parent ||
        this.nondelegableGrants.has(parentKey) ||
        !authorityAttenuates(parent.authority, grant.authority) ||
        !grant.delegationEvidence ||
        grant.delegationEvidence.signer !== parent.issuer ||
        !this.trust.verifyDelegatedGrant(grant, parent)
      )
        throw new Error(
          "child grant does not authentically and monotonically attenuate parent",
        );
    } else if (!grant.rootEvidence || !this.trust.verifyRootGrant(grant))
      throw new Error("root grant proof is unsigned or invalid");
    const key = tenantKey(grant.authority.tenant, grant.id);
    this.grants.set(key, structuredClone(grant));
    if (grant.kind === "break-glass") this.nondelegableGrants.add(key);
  }
  async issueCredential(input: {
    handle: CredentialHandle;
    secret: Uint8Array;
    expiresAt: string;
    event: CredentialLifecycleEvent;
  }) {
    const credentialKey = tenantKey(
      input.handle.tenant,
      input.handle.credentialId,
    );
    const grant = this.grants.get(
      tenantKey(input.handle.tenant, input.handle.grantId),
    );
    if (
      !grant ||
      grant.authority.tenant !== input.handle.tenant ||
      input.handle.generation !== 1 ||
      !["issued", "break-glass-issued"].includes(input.event.kind) ||
      input.event.authorityDigest !== digest(grant.authority) ||
      input.event.tenant !== input.handle.tenant ||
      input.event.credentialId !== input.handle.credentialId ||
      input.event.generation !== input.handle.generation ||
      input.event.issuer !== grant.issuer ||
      this.credentials.has(credentialKey) ||
      this.tombstones.has(credentialKey)
    )
      throw new Error("credential issuance binding is invalid");
    this.validateLifecycle(input.event);
    const operation = this.beginCustody(input.event, "put");
    let stored: Awaited<ReturnType<SecretCustody["put"]>>;
    try {
      stored = await this.custody.put({
        operationId: operation.operationId,
        tenant: input.handle.tenant,
        credentialId: input.handle.credentialId,
        generation: 1,
        secret: Uint8Array.from(input.secret),
        expiresAt: input.expiresAt,
      });
    } catch (error) {
      this.failCustody(operation.operationId, error);
      throw error;
    } finally {
      input.secret.fill(0);
    }
    this.acceptLifecycle(input.event);
    this.custodyOutbox.delete(operation.operationId);
    const handle = {
      ...structuredClone(input.handle),
      secretReference: stored.reference,
    };
    this.credentials.set(credentialKey, handle);
    return structuredClone(handle);
  }
  async rotateCredential(input: {
    credentialId: string;
    nextGeneration: number;
    secret: Uint8Array;
    expiresAt: string;
    event: CredentialLifecycleEvent;
  }) {
    const matching = [...this.credentials.values()].filter(
      (value) => value.credentialId === input.credentialId,
    );
    if (matching.length !== 1)
      throw new Error("credential id is ambiguous; tenant is required");
    const handle = matching[0],
      state =
        handle &&
        this.credentialState.get(tenantKey(handle.tenant, input.credentialId));
    if (
      !handle ||
      !state ||
      state.status !== "active" ||
      input.nextGeneration !== state.generation + 1 ||
      input.event.kind !== "rotated" ||
      input.event.tenant !== handle.tenant ||
      input.event.credentialId !== handle.credentialId ||
      input.event.generation !== input.nextGeneration ||
      input.event.authorityDigest !== state.authorityDigest
    )
      throw new Error("credential rotation is invalid");
    this.validateLifecycle(input.event);
    const operation = this.beginCustody(input.event, "rotate");
    let stored: Awaited<ReturnType<SecretCustody["rotate"]>>;
    try {
      stored = await this.custody.rotate({
        operationId: operation.operationId,
        tenant: handle.tenant,
        credentialId: handle.credentialId,
        generation: input.nextGeneration,
        secret: Uint8Array.from(input.secret),
        expiresAt: input.expiresAt,
      });
    } catch (error) {
      this.failCustody(operation.operationId, error);
      throw error;
    } finally {
      input.secret.fill(0);
    }
    this.acceptLifecycle(input.event);
    this.custodyOutbox.delete(operation.operationId);
    handle.generation = input.nextGeneration;
    handle.secretReference = stored.reference;
    return structuredClone(handle);
  }
  async revokeCredential(event: CredentialLifecycleEvent) {
    if (!["revoked", "compromised", "break-glass-revoked"].includes(event.kind))
      throw new Error("revocation event kind is invalid");
    const key = tenantKey(event.tenant, event.credentialId);
    const handle = this.credentials.get(key);
    if (!handle || handle.generation !== event.generation)
      throw new Error("revocation target binding is invalid");
    this.acceptLifecycle(event);
    const operation = this.beginCustody(event, "revoke");
    try {
      await this.custody.revoke({
        operationId: operation.operationId,
        tenant: event.tenant,
        credentialId: event.credentialId,
        generation: event.generation,
      });
      this.custodyOutbox.delete(operation.operationId);
    } catch (error) {
      this.failCustody(operation.operationId, error);
      throw error;
    }
  }
  async deleteCredential(event: CredentialLifecycleEvent) {
    if (event.kind !== "deleted")
      throw new Error("deletion event kind is invalid");
    const key = tenantKey(event.tenant, event.credentialId);
    if (!this.credentials.has(key))
      throw new Error("deletion target binding is invalid");
    this.acceptLifecycle(event);
    this.credentials.delete(key);
    this.tombstones.add(key);
    const operation = this.beginCustody(event, "delete");
    try {
      await this.custody.delete({
        operationId: operation.operationId,
        tenant: event.tenant,
        credentialId: event.credentialId,
      });
      this.custodyOutbox.delete(operation.operationId);
    } catch (error) {
      this.failCustody(operation.operationId, error);
      throw error;
    }
  }
  async reconcileCustody() {
    for (const entry of [...this.custodyOutbox.values()]) {
      if (entry.operation === "revoke")
        await this.custody.revoke({
          operationId: entry.operationId,
          tenant: entry.tenant,
          credentialId: entry.credentialId,
          generation: entry.generation,
        });
      else if (entry.operation === "delete")
        await this.custody.delete({
          operationId: entry.operationId,
          tenant: entry.tenant,
          credentialId: entry.credentialId,
        });
      else continue;
      this.custodyOutbox.delete(entry.operationId);
    }
  }
  issueBreakGlass(input: {
    grant: AuthorityGrant;
    handle: CredentialHandle;
    secret: Uint8Array;
    expiresAt: string;
    event: CredentialLifecycleEvent;
    approvals: BreakGlassApproval[];
    incident: string;
  }) {
    if (
      input.event.kind !== "break-glass-issued" ||
      input.grant.kind !== "break-glass" ||
      new Set(input.approvals.map((value) => value.approver)).size < 2 ||
      input.approvals.some(
        (value) =>
          value.approver === input.grant.issuer ||
          value.signer !== value.approver ||
          value.tenant !== input.grant.authority.tenant ||
          value.incident !== input.incident ||
          value.grantDigest !== input.grant.proofDigest ||
          value.statementDigest !==
            digest({
              approver: value.approver,
              tenant: value.tenant,
              incident: value.incident,
              grantDigest: value.grantDigest,
            }) ||
          this.identities.get(
            tenantKey(input.grant.authority.tenant, value.approver),
          )?.status !== "active" ||
          !this.trust.verifyBreakGlassApproval(value),
      ) ||
      !input.incident ||
      iso(input.expiresAt) <= this.trust.now().getTime() ||
      iso(input.expiresAt) - this.trust.now().getTime() > 15 * 60_000 ||
      input.grant.parent
    )
      throw new Error(
        "break-glass requires independent quorum, incident, root-only nondelegable authority, and short lifetime",
      );
    return this.issueCredential(input);
  }
  setGatewayWatermark(tenant: string, sequence: number) {
    const watermark = this.gatewayWatermarks.get(tenant) ?? 0;
    const authoritative = this.authoritativeSequences.get(tenant) ?? 0;
    if (sequence < watermark || sequence > authoritative)
      throw new Error("revocation watermark is invalid");
    this.gatewayWatermarks.set(tenant, sequence);
    if (sequence === authoritative) this.unavailableAfterRestore.delete(tenant);
  }
  authorize(request: EffectRequest, proof: EffectProof): AuthorizationDecision {
    const decide = (
      authorized: boolean,
      code: string,
      inFlight: AuthorizationDecision["inFlight"] = "none",
    ) => {
      const detailDigest = digest({
          request,
          proof: { ...proof, signature: "[redacted]" },
          authorized,
          code,
        }),
        record = {
          sequence: this.audit.length + 1,
          tenant: request.tenant,
          kind: "effect-authorization",
          subject: request.id,
          decision: code,
          detailDigest,
        };
      this.audit.push(record);
      return {
        authorized,
        code,
        sequence: this.authoritativeSequences.get(request.tenant) ?? 0,
        inFlight,
        auditDigest: digest(record),
      };
    };
    const handle = this.credentials.get(
        tenantKey(request.tenant, proof.credentialId),
      ),
      state = this.credentialState.get(
        tenantKey(request.tenant, proof.credentialId),
      ),
      grant =
        handle && this.grants.get(tenantKey(request.tenant, handle.grantId));
    if (
      this.unavailableAfterRestore.has(request.tenant) ||
      (this.gatewayWatermarks.get(request.tenant) ?? 0) <
        request.requiredRevocationSequence
    )
      return decide(false, "STALE_REVOCATION_VIEW");
    if (
      !handle ||
      !state ||
      !grant ||
      handle.tenant !== request.tenant ||
      state.status !== "active" ||
      state.generation !== proof.generation
    )
      return decide(
        false,
        "CREDENTIAL_INACTIVE",
        request.phase === "post-submit"
          ? "in-doubt"
          : request.phase === "committed"
            ? "committed"
            : request.phase === "pre-submit"
              ? "cancelled"
              : "none",
      );
    const authority = grant.authority,
      worker = this.identities.get(tenantKey(request.tenant, request.worker)),
      session = request.session
        ? this.identities.get(tenantKey(request.tenant, request.session))
        : undefined,
      activeLink = [...this.links.values()].some(
        (link) =>
          link.tenant === request.tenant &&
          link.subject === request.worker &&
          link.purpose === "provider-account" &&
          link.providerAccount !== undefined &&
          this.identities.get(tenantKey(request.tenant, link.providerAccount))
            ?.status === "active" &&
          link.revokedSequence === undefined,
      ),
      identityOk =
        worker?.status === "active" &&
        worker.kind === "worker" &&
        worker.deployment === request.deployment &&
        worker.actor === request.actor &&
        worker.attempt === request.attempt &&
        activeLink &&
        (!request.session ||
          (session?.status === "active" &&
            session.kind === "session" &&
            session.parent === request.worker)) &&
        authority.deployment === request.deployment &&
        authority.actor === request.actor &&
        authority.attempt === request.attempt &&
        authority.worker === request.worker &&
        (!authority.session || authority.session === request.session),
      scopeOk =
        authority.resources.includes(request.resource) &&
        authority.effects.includes(request.effect) &&
        authority.audiences.includes(request.audience) &&
        Object.entries(authority.constraints).every(
          ([key, value]) => request.context[key] === value,
        );
    if (!identityOk || !scopeOk || proof.audience !== request.audience)
      return decide(false, "AUTHORITY_SCOPE_MISMATCH");
    const now = this.trust.now().getTime();
    if (
      now < iso(authority.notBefore) ||
      now >= iso(authority.expiresAt) ||
      Math.abs(now - iso(proof.issuedAt)) > 60_000
    )
      return decide(false, "TIME_WINDOW_INVALID");
    const nonceKey = `${request.tenant}/${proof.credentialId}/${proof.generation}/${proof.nonce}`;
    if (this.nonces.has(nonceKey)) return decide(false, "REPLAY");
    const expected = effectRequestDigest(request, proof);
    if (
      proof.requestDigest !== expected ||
      proof.algorithm !== "Ed25519" ||
      proof.keyId !== handle.keyId ||
      !this.trust.verifyEffectProof({
        handle,
        proof,
        requestBytes: new TextEncoder().encode(
          canonicalSemanticJson(requestBody(request, proof)),
        ),
      })
    )
      return decide(false, "PROOF_INVALID");
    this.nonces.add(nonceKey);
    return decide(
      true,
      "AUTHORIZED",
      request.phase === "committed" ? "committed" : "none",
    );
  }
  snapshot(
    sign: (digest: string) => Omit<AuthorityCheckpointEvidence, "digest">,
  ) {
    const state = {
      identities: [...this.identities],
      links: [...this.links],
      linkRevocations: this.linkRevocations,
      identityRevocations: this.identityRevocations,
      grants: [...this.grants],
      credentials: [...this.credentials],
      lifecycle: this.lifecycle,
      audit: this.audit,
      tombstones: [...this.tombstones],
      nonces: [...this.nonces],
      gatewayWatermarks: [...this.gatewayWatermarks],
      authoritativeSequences: [...this.authoritativeSequences],
      nondelegableGrants: [...this.nondelegableGrants],
      custodyOutbox: [...this.custodyOutbox],
    };
    const checkpointDigest = digest(state);
    return structuredClone({
      ...state,
      checkpoint: { digest: checkpointDigest, ...sign(checkpointDigest) },
    });
  }
  restore(
    snapshot: ReturnType<OrganizationAuthorityPlane["snapshot"]>,
    authoritativeSuffix: AuthorityMutation[],
  ) {
    const { checkpoint, ...checkpointState } = snapshot;
    if (
      checkpoint.digest !== digest(checkpointState) ||
      !this.trust.verifyCheckpoint(checkpoint)
    )
      throw new Error("authority checkpoint signature or digest is invalid");
    this.identities.clear();
    for (const [key, value] of snapshot.identities)
      this.identities.set(key, value);
    this.links.clear();
    for (const [key, value] of snapshot.links) this.links.set(key, value);
    this.linkRevocations.length = 0;
    this.identityRevocations.length = 0;
    this.grants.clear();
    for (const [key, value] of snapshot.grants) this.grants.set(key, value);
    this.credentials.clear();
    for (const [key, value] of snapshot.credentials)
      this.credentials.set(key, value);
    this.lifecycle.length = 0;
    this.audit.length = 0;
    this.audit.push(...snapshot.audit);
    this.credentialState.clear();
    this.tombstones.clear();
    this.nonces = new Set(snapshot.nonces);
    this.authoritativeSequences.clear();
    for (const link of this.links.values()) delete link.revokedSequence;
    for (const event of snapshot.identityRevocations) {
      const identity = this.identities.get(
        tenantKey(event.tenant, event.identityId),
      );
      if (identity) identity.status = "active";
    }
    const mutations: AuthorityMutation[] = [
      ...snapshot.lifecycle,
      ...snapshot.linkRevocations,
      ...snapshot.identityRevocations,
      ...authoritativeSuffix,
    ];
    const seen = new Set<string>();
    for (const mutation of mutations.sort(
      (a, b) => a.tenant.localeCompare(b.tenant) || a.sequence - b.sequence,
    )) {
      const id =
        "credentialId" in mutation
          ? mutation.id
          : "linkId" in mutation
            ? `link:${mutation.linkId}:${mutation.sequence}`
            : `identity:${mutation.identityId}:${mutation.sequence}`;
      const key = `${mutation.tenant}/${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if ("credentialId" in mutation) this.acceptLifecycle(mutation);
      else if ("linkId" in mutation) this.revokeLink(mutation);
      else this.revokeIdentity(mutation);
    }
    for (const id of snapshot.tombstones) this.tombstones.add(id);
    this.gatewayWatermarks = new Map(snapshot.gatewayWatermarks);
    this.nondelegableGrants = new Set(snapshot.nondelegableGrants);
    this.custodyOutbox.clear();
    for (const [key, value] of snapshot.custodyOutbox)
      this.custodyOutbox.set(key, value);
    this.unavailableAfterRestore.clear();
    for (const [tenant, sequence] of this.authoritativeSequences)
      if ((this.gatewayWatermarks.get(tenant) ?? 0) < sequence)
        this.unavailableAfterRestore.add(tenant);
  }
  portableState() {
    return {
      identities: [...this.identities.values()],
      links: [...this.links.values()],
      grants: [...this.grants.values()],
      credentials: [...this.credentials.values()],
      lifecycle: this.lifecycle.map((event) => structuredClone(event)),
      audit: this.audit.map((record) => structuredClone(record)),
      tombstones: [...this.tombstones],
      custodyOutbox: [...this.custodyOutbox.values()].map((value) =>
        structuredClone(value),
      ),
    };
  }
  private acceptLifecycle(event: CredentialLifecycleEvent) {
    this.validateLifecycle(event);
    const key = tenantKey(event.tenant, event.credentialId);
    const prior = this.credentialState.get(key);
    const status: CredentialState["status"] =
      event.kind === "deleted"
        ? "deleted"
        : event.kind === "expired"
          ? "expired"
          : event.kind === "compromised"
            ? "compromised"
            : event.kind.includes("revoked")
              ? "revoked"
              : "active";
    this.lifecycle.push(structuredClone(event));
    this.credentialState.set(key, {
      generation: event.generation,
      status,
      sequence: event.sequence,
      authorityDigest: event.authorityDigest,
      breakGlass:
        event.kind.startsWith("break-glass") || Boolean(prior?.breakGlass),
    });
    this.authoritativeSequences.set(event.tenant, event.sequence);
    if (status === "deleted") this.tombstones.add(key);
  }
  private validateLifecycle(event: CredentialLifecycleEvent) {
    const { evidence, ...statement } = event;
    const current = this.authoritativeSequences.get(event.tenant) ?? 0;
    const tenantLifecycle = this.lifecycle.filter(
      (value) => value.tenant === event.tenant,
    );
    if (
      evidence.digest !== digest(statement) ||
      !this.trust.verifyLifecycleEvent(event) ||
      event.sequence !== current + 1 ||
      event.priorDigest !==
        (tenantLifecycle.length ? digest(tenantLifecycle.at(-1)) : undefined) ||
      this.lifecycle.some(
        (value) => value.tenant === event.tenant && value.id === event.id,
      )
    )
      throw new Error(
        "lifecycle event signature, sequence, predecessor, or replay is invalid",
      );
    const prior = this.credentialState.get(
      tenantKey(event.tenant, event.credentialId),
    );
    if (prior && event.generation < prior.generation)
      throw new Error("credential generation cannot move backward");
    if (prior?.status === "deleted")
      throw new Error("deleted credential cannot resurrect");
  }
  private beginCustody(
    event: CredentialLifecycleEvent,
    operation: CustodyOutboxEntry["operation"],
  ): CustodyOutboxEntry {
    const operationId = `${event.tenant}/${event.id}/${operation}`;
    const prior = this.custodyOutbox.get(operationId);
    const entry: CustodyOutboxEntry = {
      operationId,
      tenant: event.tenant,
      credentialId: event.credentialId,
      generation: event.generation,
      operation,
      status: "pending",
      attempts: (prior?.attempts ?? 0) + 1,
      requestDigest: digest({ event, operation }),
    };
    this.custodyOutbox.set(operationId, entry);
    return entry;
  }
  private failCustody(operationId: string, error: unknown) {
    const entry = this.custodyOutbox.get(operationId);
    if (!entry) return;
    entry.status = "failed";
    entry.lastErrorDigest = digest({
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
