import { generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  OrganizationAuthorityPlane,
  authorityAttenuates,
  effectRequestDigest,
  type Authority,
  type AuthorityGrant,
  type CredentialLifecycleEvent,
  type EffectProof,
  type EffectRequest,
  type SecretCustody,
  type SignedIdentityLink,
} from "./organization-identity-authority";

const keys = generateKeyPairSync("ed25519"),
  approvalKeys = {
    security: generateKeyPairSync("ed25519"),
    "incident-commander": generateKeyPairSync("ed25519"),
  },
  now = "2026-07-15T12:00:00Z";
const digest = async (value: unknown) =>
  `sha256:${Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(canonicalSemanticJson(value)))).toString("hex")}`;
const signature = (value: string) =>
  sign(null, Buffer.from(value), keys.privateKey).toString("base64");
const custodyState = new Map<string, Uint8Array>();
const custody: SecretCustody = {
  put: async (input) => {
    const locator = `tenant/${input.tenant}/${input.credentialId}/${input.generation}`;
    custodyState.set(locator, Uint8Array.from(input.secret));
    return {
      reference: { provider: "external-test-store", locator },
      leaseId: `lease/${input.generation}`,
    };
  },
  rotate: async (input) => {
    const locator = `tenant/${input.tenant}/${input.credentialId}/${input.generation}`;
    custodyState.set(locator, Uint8Array.from(input.secret));
    return {
      reference: { provider: "external-test-store", locator },
      leaseId: `lease/${input.generation}`,
    };
  },
  revoke: async (input) => {
    for (const key of custodyState.keys())
      if (key.startsWith(`tenant/${input.tenant}/${input.credentialId}/`))
        custodyState.delete(key);
  },
  delete: async (input) => {
    for (const key of custodyState.keys())
      if (key.startsWith(`tenant/${input.tenant}/${input.credentialId}/`))
        custodyState.delete(key);
  },
  exchange: async (input) => ({
    proofMaterial: Uint8Array.from([input.generation]),
    expiresAt: "2026-07-15T12:01:00Z",
  }),
};
const trust = {
  verifyIdentityLink: (link: SignedIdentityLink) =>
    verify(
      null,
      Buffer.from(link.evidenceDigest),
      keys.publicKey,
      Buffer.from(link.signature, "base64"),
    ),
  verifyLinkRevocation: (event: {
    evidence: { digest: string; signature: string };
  }) =>
    verify(
      null,
      Buffer.from(event.evidence.digest),
      keys.publicKey,
      Buffer.from(event.evidence.signature, "base64"),
    ),
  verifyIdentityRevocation: (event: {
    evidence: { digest: string; signature: string };
  }) =>
    verify(
      null,
      Buffer.from(event.evidence.digest),
      keys.publicKey,
      Buffer.from(event.evidence.signature, "base64"),
    ),
  verifyLifecycleEvent: (event: CredentialLifecycleEvent) =>
    verify(
      null,
      Buffer.from(event.evidence.digest),
      keys.publicKey,
      Buffer.from(event.evidence.signature, "base64"),
    ),
  verifyRootGrant: (grant: AuthorityGrant) =>
    Boolean(grant.rootEvidence) &&
    verify(
      null,
      Buffer.from(grant.proofDigest),
      keys.publicKey,
      Buffer.from(grant.rootEvidence!.signature, "base64"),
    ),
  verifyDelegatedGrant: (grant: AuthorityGrant) =>
    Boolean(grant.delegationEvidence) &&
    verify(
      null,
      Buffer.from(grant.proofDigest),
      keys.publicKey,
      Buffer.from(grant.delegationEvidence!.signature, "base64"),
    ),
  verifyBreakGlassApproval: (approval: {
    signer: string;
    statementDigest: string;
    signature: string;
  }) => {
    const key = approvalKeys[approval.signer as keyof typeof approvalKeys];
    return (
      Boolean(key) &&
      verify(
        null,
        Buffer.from(approval.statementDigest),
        key.publicKey,
        Buffer.from(approval.signature, "base64"),
      )
    );
  },
  verifyCheckpoint: (evidence: { digest: string; signature: string }) =>
    verify(
      null,
      Buffer.from(evidence.digest),
      keys.publicKey,
      Buffer.from(evidence.signature, "base64"),
    ),
  verifyEffectProof: ({
    proof,
    requestBytes,
  }: {
    proof: EffectProof;
    requestBytes: Uint8Array;
  }) =>
    verify(
      null,
      requestBytes,
      keys.publicKey,
      Buffer.from(proof.signature, "base64"),
    ),
  now: () => new Date(now),
};
const checkpointSigner = (value: string) => ({
  signer: "authority-checkpoint",
  algorithm: "Ed25519",
  signature: signature(value),
});
const identityRevocation = async (identityId: string, sequence = 2) => {
  const statement = { tenant: "acme", identityId, sequence, effectiveAt: now },
    evidenceDigest = await digest(statement);
  return {
    ...statement,
    evidence: {
      digest: evidenceDigest,
      signer: "idp",
      algorithm: "Ed25519",
      signature: signature(evidenceDigest),
    },
  };
};
const breakGlassApproval = async (approver: string, grantDigest: string) => {
  const statement = {
    approver,
    tenant: "acme",
    incident: "INC-42",
    grantDigest,
  };
  const statementDigest = await digest(statement);
  const key = approvalKeys[approver as keyof typeof approvalKeys] ?? keys;
  return {
    ...statement,
    statementDigest,
    signer: approver,
    algorithm: "Ed25519",
    signature: sign(
      null,
      Buffer.from(statementDigest),
      key.privateKey,
    ).toString("base64"),
  };
};
const authority = (changes: Partial<Authority> = {}): Authority => ({
  tenant: "acme",
  deployment: "deploy-1",
  actor: "developer",
  attempt: "attempt-1",
  worker: "worker-1",
  session: "session-1",
  resources: ["repo:acme/app", "issue:42"],
  effects: ["code:propose", "tasks:comment"],
  audiences: ["github"],
  notBefore: "2026-07-15T11:00:00Z",
  expiresAt: "2026-07-15T13:00:00Z",
  constraints: { branch: "agent/42" },
  ...changes,
});
const grantProof = (
  grant: Pick<
    AuthorityGrant,
    "id" | "parent" | "authority" | "issuer" | "sequence" | "kind"
  >,
) =>
  digest({
    id: grant.id,
    ...(grant.parent ? { parent: grant.parent } : {}),
    authority: grant.authority,
    issuer: grant.issuer,
    sequence: grant.sequence,
    kind: grant.kind ?? "ordinary",
  });
const rootGrant = async (): Promise<AuthorityGrant> => {
  const value = authority();
  const unsigned = {
    id: "grant-root",
    authority: value,
    issuer: "service-1",
    sequence: 1,
  };
  const proofDigest = await grantProof(unsigned);
  return {
    ...unsigned,
    proofDigest,
    rootEvidence: {
      signer: "tenant-root",
      algorithm: "Ed25519",
      signature: signature(proofDigest),
    },
  };
};
const event = async (input: {
  kind: CredentialLifecycleEvent["kind"];
  sequence: number;
  generation?: number;
  credentialId?: string;
  authorityDigest: string;
  prior?: CredentialLifecycleEvent;
  issuer?: string;
  tenant?: string;
}): Promise<CredentialLifecycleEvent> => {
  const base = {
      id: `event-${input.sequence}`,
      tenant: input.tenant ?? "acme",
      credentialId: input.credentialId ?? "cred-1",
      generation: input.generation ?? 1,
      sequence: input.sequence,
      ...(input.prior ? { priorDigest: await digest(input.prior) } : {}),
      kind: input.kind,
      authorityDigest: input.authorityDigest,
      effectiveAt: now,
      issuer: input.issuer ?? "service-1",
    },
    evidenceDigest = await digest(base);
  return {
    ...base,
    evidence: {
      digest: evidenceDigest,
      signer: "issuer",
      algorithm: "Ed25519",
      signature: signature(evidenceDigest),
    },
  };
};
const buildPlane = async (custodyAdapter: SecretCustody = custody) => {
  custodyState.clear();
  const plane = new OrganizationAuthorityPlane(trust, custodyAdapter);
  plane.registerIdentity({
    id: "service-1",
    tenant: "acme",
    kind: "service",
    issuer: "idp",
    status: "active",
    createdSequence: 1,
  });
  plane.registerIdentity({
    id: "provider-1",
    tenant: "acme",
    kind: "provider",
    issuer: "idp",
    status: "active",
    createdSequence: 2,
  });
  plane.registerIdentity({
    id: "worker-1",
    tenant: "acme",
    kind: "worker",
    issuer: "service-1",
    status: "active",
    createdSequence: 3,
    deployment: "deploy-1",
    actor: "developer",
    attempt: "attempt-1",
    runtimeDigest: "sha256:runtime",
  });
  plane.registerIdentity({
    id: "session-1",
    tenant: "acme",
    kind: "session",
    issuer: "worker-1",
    status: "active",
    createdSequence: 4,
    parent: "worker-1",
  });
  const linkStatement = {
    id: "worker-binding",
    tenant: "acme",
    subject: "worker-1",
    externalIssuer: "https://idp.example",
    externalSubject: "worker-subject",
    purpose: "provider-account" as const,
    providerAccount: "provider-1",
  };
  const linkDigest = await digest(linkStatement);
  plane.addLink({
    ...linkStatement,
    evidenceDigest: linkDigest,
    signer: "idp",
    algorithm: "Ed25519",
    signature: signature(linkDigest),
  });
  const grant = await rootGrant();
  plane.issueGrant(grant);
  const issued = await event({
      kind: "issued",
      sequence: 1,
      authorityDigest: await digest(grant.authority),
    }),
    secret = Uint8Array.from([1, 2, 3, 4]);
  await plane.issueCredential({
    handle: {
      credentialId: "cred-1",
      tenant: "acme",
      generation: 1,
      grantId: grant.id,
      keyId: "key-1",
      publicKeyThumbprint: "sha256:public",
      secretReference: { provider: "unbound", locator: "unbound" },
      issuedSequence: 1,
    },
    secret,
    expiresAt: "2026-07-15T13:00:00Z",
    event: issued,
  });
  plane.setGatewayWatermark("acme", 1);
  return { plane, grant, issued };
};
const request = (changes: Partial<EffectRequest> = {}): EffectRequest => ({
  id: "effect-1",
  tenant: "acme",
  deployment: "deploy-1",
  actor: "developer",
  attempt: "attempt-1",
  worker: "worker-1",
  session: "session-1",
  resource: "repo:acme/app",
  effect: "code:propose",
  audience: "github",
  payloadDigest: "sha256:payload",
  context: { branch: "agent/42" },
  requiredRevocationSequence: 1,
  phase: "pre-submit",
  ...changes,
});
const proof = async (
  req: EffectRequest,
  changes: Partial<EffectProof> = {},
): Promise<EffectProof> => {
  const unsigned = {
      credentialId: "cred-1",
      generation: 1,
      audience: req.audience,
      nonce: "nonce-1",
      issuedAt: now,
      keyId: "key-1",
    },
    requestDigest = effectRequestDigest(req, unsigned),
    bytes = Buffer.from(canonicalSemanticJson({ request: req, ...unsigned }));
  return {
    ...unsigned,
    requestDigest,
    algorithm: "Ed25519",
    signature: sign(null, bytes, keys.privateKey).toString("base64"),
    ...changes,
  };
};

describe("R10-SEC-1: tenant-scoped linked identity graph", () => {
  test("rejects an unsigned self-escalated root grant", async () => {
    const plane = new OrganizationAuthorityPlane(trust, custody);
    plane.registerIdentity({
      id: "ordinary-service",
      tenant: "acme",
      kind: "service",
      issuer: "idp",
      status: "active",
      createdSequence: 1,
    });
    const value = authority(),
      proofDigest = await grantProof({
        id: "forged-root",
        authority: value,
        issuer: "ordinary-service",
        sequence: 1,
      });
    expect(() =>
      plane.issueGrant({
        id: "forged-root",
        authority: value,
        issuer: "ordinary-service",
        sequence: 1,
        proofDigest,
        rootEvidence: {
          signer: "ordinary-service",
          algorithm: "Ed25519",
          signature: "forged",
        },
      }),
    ).toThrow(/unsigned|invalid/i);
  });
  test("binds root authorization to issuer and sequence", async () => {
    const plane = new OrganizationAuthorityPlane(trust, custody);
    for (const id of ["service-1", "attacker"])
      plane.registerIdentity({
        id,
        tenant: "acme",
        kind: "service",
        issuer: "idp",
        status: "active",
        createdSequence: id === "service-1" ? 1 : 2,
      });
    const valid = await rootGrant();
    expect(() => plane.issueGrant({ ...valid, issuer: "attacker" })).toThrow(
      /digest/i,
    );
    expect(() => plane.issueGrant({ ...valid, sequence: 2 })).toThrow(
      /digest/i,
    );
    expect(() => plane.issueGrant(valid)).not.toThrow();
  });
  test("revoked worker identity immediately leaves the authorization path", async () => {
    const { plane } = await buildPlane(),
      first = request(),
      firstProof = await proof(first);
    expect(plane.authorize(first, firstProof).authorized).toBe(true);
    plane.revokeIdentity(await identityRevocation("worker-1"));
    plane.setGatewayWatermark("acme", 2);
    const second = request({ id: "effect-after-revoke" }),
      secondProof = await proof(second);
    expect(plane.authorize(second, secondProof)).toMatchObject({
      authorized: false,
      code: "AUTHORITY_SCOPE_MISMATCH",
    });
  });
  test("revoked provider identity invalidates the required provider-account binding", async () => {
    const { plane } = await buildPlane();
    plane.revokeIdentity(await identityRevocation("provider-1"));
    plane.setGatewayWatermark("acme", 2);
    const req = request(),
      signed = await proof(req);
    expect(plane.authorize(req, signed)).toMatchObject({
      authorized: false,
      code: "AUTHORITY_SCOPE_MISMATCH",
    });
  });
  test("requires signed link revocation and enforces it on the next authorization", async () => {
    const { plane, grant, issued } = await buildPlane();
    const statement = {
        tenant: "acme",
        linkId: "worker-binding",
        sequence: 2,
        effectiveAt: now,
      },
      evidenceDigest = await digest(statement);
    expect(() =>
      plane.revokeLink({
        ...statement,
        evidence: {
          digest: evidenceDigest,
          signer: "idp",
          algorithm: "Ed25519",
          signature: "forged",
        },
      }),
    ).toThrow(/unsigned|untrusted/i);
    plane.revokeLink({
      ...statement,
      evidence: {
        digest: evidenceDigest,
        signer: "idp",
        algorithm: "Ed25519",
        signature: signature(evidenceDigest),
      },
    });
    plane.setGatewayWatermark("acme", 2);
    const req = request(),
      signed = await proof(req);
    expect(plane.authorize(req, signed)).toMatchObject({
      authorized: false,
      code: "AUTHORITY_SCOPE_MISMATCH",
    });
    const restored = new OrganizationAuthorityPlane(trust, custody);
    restored.restore(plane.snapshot(checkpointSigner), []);
    const rotated = await event({
      kind: "rotated",
      sequence: 3,
      generation: 2,
      authorityDigest: await digest(grant.authority),
      prior: issued,
    });
    await expect(
      restored.rotateCredential({
        credentialId: "cred-1",
        nextGeneration: 2,
        secret: Uint8Array.of(4),
        expiresAt: "2026-07-15T13:00:00Z",
        event: rotated,
      }),
    ).resolves.toMatchObject({ generation: 2 });
  });
  test("requires explicit signed links and rejects endpoint identity or cross-tenant parent/account substitution", async () => {
    const { plane } = await buildPlane(),
      base = {
        id: "link-1",
        tenant: "acme",
        subject: "worker-1",
        externalIssuer: "https://idp.example",
        externalSubject: "subject-1",
        purpose: "provider-account" as const,
        providerAccount: "provider-1",
      },
      evidenceDigest = await digest(base),
      link = {
        ...base,
        evidenceDigest,
        signer: "idp",
        algorithm: "Ed25519",
        signature: signature(evidenceDigest),
      };
    plane.addLink(link);
    expect(
      [...plane.links.values()].some((value) => value.id === "link-1"),
    ).toBe(true);
    expect(() =>
      plane.addLink({ ...link, id: "slack-thread-123", signature: "forged" }),
    ).toThrow(/untrusted|duplicate|cross-tenant/i);
    expect(() =>
      plane.registerIdentity({
        id: "bad-session",
        tenant: "other",
        kind: "session",
        issuer: "endpoint:slack",
        status: "active",
        createdSequence: 5,
        parent: "worker-1",
      }),
    ).toThrow(/worker parent|cross-tenant/i);
  });
});

describe("R10-CAP-1: monotone authority and proof-of-possession", () => {
  test("rejects an attenuated child submitted without the parent holder's delegation signature", async () => {
    const { plane, grant } = await buildPlane();
    plane.registerIdentity({
      id: "attacker",
      tenant: "acme",
      kind: "service",
      issuer: "idp",
      status: "active",
      createdSequence: 9,
    });
    const statement = {
        id: "stolen-child",
        parent: grant.id,
        authority: authority({ resources: ["repo:acme/app"] }),
        issuer: "attacker",
        sequence: 2,
      },
      proofDigest = await grantProof(statement);
    expect(() =>
      plane.issueGrant({
        ...statement,
        proofDigest,
        delegationEvidence: {
          signer: "attacker",
          algorithm: "Ed25519",
          signature: signature(proofDigest),
        },
      }),
    ).toThrow(/authentically|attenuate/i);
  });
  test("accepts only structural subsets and rejects independent widening in every authority dimension", async () => {
    const parent = authority(),
      child = authority({
        resources: ["repo:acme/app"],
        effects: ["code:propose"],
        expiresAt: "2026-07-15T12:30:00Z",
      });
    expect(authorityAttenuates(parent, child)).toBe(true);
    for (const widened of [
      { tenant: "other" },
      { deployment: "other" },
      { actor: "reviewer" },
      { attempt: "other" },
      { worker: "other" },
      { session: "other" },
      { resources: ["repo:acme/app", "admin:*"] },
      { effects: ["code:propose", "code:merge"] },
      { audiences: ["github", "vault"] },
      { notBefore: "2026-07-15T10:00:00Z" },
      { expiresAt: "2026-07-15T14:00:00Z" },
      { constraints: {} },
    ])
      expect(authorityAttenuates(parent, authority(widened))).toBe(false);
    const { plane, grant } = await buildPlane(),
      childStatement = {
        id: "grant-child",
        parent: grant.id,
        authority: child,
        issuer: "service-1",
        sequence: 2,
      },
      childProof = await grantProof(childStatement),
      childGrant = {
        ...childStatement,
        proofDigest: childProof,
        delegationEvidence: {
          signer: grant.issuer,
          algorithm: "Ed25519",
          signature: signature(childProof),
        },
      };
    plane.issueGrant(childGrant);
    expect(() =>
      plane.issueGrant({
        ...childGrant,
        id: "grant-widened",
        authority: authority({ effects: ["code:merge"] }),
        proofDigest: "sha256:lie",
      }),
    ).toThrow(/attenuate|digest/i);
  });
  test("authorizes a request-bound Ed25519 proof once and rejects resource, audience, session, payload, and nonce replay", async () => {
    const cases: Array<(value: EffectRequest) => void> = [
      (value) => {
        value.resource = "repo:other/app";
      },
      (value) => {
        value.audience = "vault";
      },
      (value) => {
        value.session = "session-other";
      },
      (value) => {
        value.payloadDigest = "sha256:other";
      },
    ];
    for (const mutate of cases) {
      const { plane } = await buildPlane(),
        req = request(),
        signed = await proof(req);
      mutate(req);
      expect(plane.authorize(req, signed).authorized).toBe(false);
    }
    const { plane } = await buildPlane(),
      req = request(),
      signed = await proof(req);
    expect(plane.authorize(req, signed).authorized).toBe(true);
    expect(plane.authorize(req, signed).code).toBe("REPLAY");
  });
});

describe("R10-DIST-1: lifecycle, revocation, partition, restore, and in-flight semantics", () => {
  test("serializes concurrent same-sequence rotation through one idempotent custody operation", async () => {
    let writes = 0;
    const operations = new Map<
      string,
      Awaited<ReturnType<SecretCustody["rotate"]>>
    >();
    const serialized: SecretCustody = {
      ...custody,
      rotate: async (input) => {
        const prior = operations.get(input.operationId);
        if (prior) return prior;
        writes += 1;
        const result = {
          reference: { provider: "idempotent", locator: input.operationId },
          leaseId: "one-lease",
        };
        operations.set(input.operationId, result);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return result;
      },
    };
    const { plane, grant, issued } = await buildPlane(serialized);
    const rotated = await event({
      kind: "rotated",
      sequence: 2,
      generation: 2,
      authorityDigest: await digest(grant.authority),
      prior: issued,
    });
    const results = await Promise.allSettled([
      plane.rotateCredential({
        credentialId: "cred-1",
        nextGeneration: 2,
        secret: Uint8Array.of(2),
        expiresAt: "2026-07-15T13:00:00Z",
        event: rotated,
      }),
      plane.rotateCredential({
        credentialId: "cred-1",
        nextGeneration: 2,
        secret: Uint8Array.of(3),
        expiresAt: "2026-07-15T13:00:00Z",
        event: rotated,
      }),
    ]);
    expect(
      results.filter((value) => value.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results.filter((value) => value.status === "rejected")).toHaveLength(
      1,
    );
    expect(writes).toBe(1);
    expect(
      plane.lifecycle.filter((value) => value.kind === "rotated"),
    ).toHaveLength(1);
  });
  test("revocation fails safe and its durable outbox converges after custody recovery", async () => {
    let failed = false;
    const flaky: SecretCustody = {
      ...custody,
      revoke: async () => {
        failed = true;
        throw new Error("vault partition");
      },
    };
    const { plane, grant, issued } = await buildPlane(flaky);
    const revoked = await event({
      kind: "revoked",
      sequence: 2,
      authorityDigest: await digest(grant.authority),
      prior: issued,
    });
    await expect(plane.revokeCredential(revoked)).rejects.toThrow(
      /vault partition/,
    );
    expect(failed).toBe(true);
    expect([...plane.custodyOutbox.values()]).toEqual([
      expect.objectContaining({
        operation: "revoke",
        status: "failed",
        attempts: 1,
      }),
    ]);
    plane.setGatewayWatermark("acme", 2);
    const req = request(),
      signed = await proof(req);
    expect(plane.authorize(req, signed)).toMatchObject({
      authorized: false,
      code: "CREDENTIAL_INACTIVE",
    });
    const restored = new OrganizationAuthorityPlane(trust, custody);
    restored.restore(plane.snapshot(checkpointSigner), []);
    await restored.reconcileCustody();
    expect(restored.custodyOutbox.size).toBe(0);
  });
  test("isolates identifiers, lifecycle sequence one, and watermarks per tenant", async () => {
    const plane = new OrganizationAuthorityPlane(trust, custody);
    for (const tenant of ["acme", "beta"])
      plane.registerIdentity({
        id: "issuer",
        tenant,
        kind: "service",
        issuer: "root",
        status: "active",
        createdSequence: 1,
      });
    for (const tenant of ["acme", "beta"]) {
      const scoped = authority({ tenant }),
        unsigned = {
          id: "same-grant",
          authority: scoped,
          issuer: "issuer",
          sequence: 1,
        },
        proofDigest = await grantProof(unsigned);
      const grant: AuthorityGrant = {
        ...unsigned,
        proofDigest,
        rootEvidence: {
          signer: "tenant-root",
          algorithm: "Ed25519",
          signature: signature(proofDigest),
        },
      };
      plane.issueGrant(grant);
      const issued = await event({
        tenant,
        issuer: "issuer",
        kind: "issued",
        sequence: 1,
        credentialId: "same-credential",
        authorityDigest: await digest(scoped),
      });
      await plane.issueCredential({
        handle: {
          credentialId: "same-credential",
          tenant,
          generation: 1,
          grantId: grant.id,
          keyId: `${tenant}-key`,
          publicKeyThumbprint: `sha256:${tenant}`,
          secretReference: { provider: "none", locator: "none" },
          issuedSequence: 1,
        },
        secret: Uint8Array.of(1),
        expiresAt: "2026-07-15T13:00:00Z",
        event: issued,
      });
      plane.setGatewayWatermark(tenant, 1);
    }
    expect(
      plane.lifecycle
        .map((value) => `${value.tenant}:${value.sequence}`)
        .sort(),
    ).toEqual(["acme:1", "beta:1"]);
    expect(
      plane
        .portableState()
        .credentials.map((value) => `${value.tenant}:${value.credentialId}`)
        .sort(),
    ).toEqual(["acme:same-credential", "beta:same-credential"]);
  });
  test("persists nonce receipts so an accepted proof cannot replay after restore", async () => {
    const { plane } = await buildPlane(),
      req = request(),
      signed = await proof(req);
    expect(plane.authorize(req, signed).authorized).toBe(true);
    const snapshot = plane.snapshot(checkpointSigner),
      restored = new OrganizationAuthorityPlane(trust, custody);
    restored.restore(snapshot, []);
    expect(restored.authorize(req, signed)).toMatchObject({
      authorized: false,
      code: "REPLAY",
    });
    const tampered = structuredClone(snapshot);
    tampered.nonces.length = 0;
    expect(() =>
      new OrganizationAuthorityPlane(trust, custody).restore(tampered, []),
    ).toThrow(/checkpoint/i);
  });
  test("rotation cuts over generations; revocation fails closed by phase and cannot resurrect after stale backup restore", async () => {
    const { plane, grant, issued } = await buildPlane(),
      backup = plane.snapshot(checkpointSigner),
      rotated = await event({
        kind: "rotated",
        sequence: 2,
        generation: 2,
        authorityDigest: await digest(grant.authority),
        prior: issued,
      }),
      secret = Uint8Array.from([9, 8, 7]);
    await plane.rotateCredential({
      credentialId: "cred-1",
      nextGeneration: 2,
      secret,
      expiresAt: "2026-07-15T13:00:00Z",
      event: rotated,
    });
    plane.setGatewayWatermark("acme", 2);
    expect(
      plane.authorize(
        request({ requiredRevocationSequence: 2 }),
        await proof(request({ requiredRevocationSequence: 2 })),
      ).code,
    ).toBe("CREDENTIAL_INACTIVE");
    const revoked = await event({
      kind: "revoked",
      sequence: 3,
      generation: 2,
      authorityDigest: await digest(grant.authority),
      prior: rotated,
    });
    await plane.revokeCredential(revoked);
    for (const [phase, expected] of [
      ["pre-submit", "cancelled"],
      ["post-submit", "in-doubt"],
      ["committed", "committed"],
    ] as const) {
      plane.setGatewayWatermark("acme", 3);
      const result = plane.authorize(
        request({ phase, requiredRevocationSequence: 3 }),
        await proof(request({ phase, requiredRevocationSequence: 3 }), {
          generation: 2,
          nonce: `nonce-${phase}`,
        }),
      );
      expect(result.inFlight).toBe(expected);
    }
    const restored = new OrganizationAuthorityPlane(trust, custody);
    restored.restore(backup, [rotated, revoked]);
    expect(
      restored.authorize(
        request({ requiredRevocationSequence: 3 }),
        await proof(request({ requiredRevocationSequence: 3 }), {
          generation: 2,
        }),
      ).code,
    ).toBe("STALE_REVOCATION_VIEW");
    restored.setGatewayWatermark("acme", 3);
    expect(
      restored.authorize(
        request({ requiredRevocationSequence: 3 }),
        await proof(request({ requiredRevocationSequence: 3 }), {
          generation: 2,
        }),
      ).code,
    ).toBe("CREDENTIAL_INACTIVE");
  });
  test("deletion leaves a permanent tombstone across restore", async () => {
    const { plane, grant, issued } = await buildPlane(),
      deleted = await event({
        kind: "deleted",
        sequence: 2,
        authorityDigest: await digest(grant.authority),
        prior: issued,
      });
    await plane.deleteCredential(deleted);
    const snapshot = plane.snapshot(checkpointSigner),
      restored = new OrganizationAuthorityPlane(trust, custody);
    restored.restore(snapshot, []);
    expect(
      [...restored.tombstones].some((value) => value.endsWith("\u0000cred-1")),
    ).toBe(true);
    const fresh = await event({
      kind: "issued",
      sequence: 3,
      credentialId: "cred-1",
      authorityDigest: await digest(grant.authority),
      prior: deleted,
    });
    await expect(
      restored.issueCredential({
        handle: {
          credentialId: "cred-1",
          tenant: "acme",
          generation: 1,
          grantId: grant.id,
          keyId: "new",
          publicKeyThumbprint: "new",
          secretReference: { provider: "x", locator: "x" },
          issuedSequence: 3,
        },
        secret: Uint8Array.of(1),
        expiresAt: "2026-07-15T13:00:00Z",
        event: fresh,
      }),
    ).rejects.toThrow(/tombstone|issuance/i);
  });
});

describe("R10-OPS-1: external custody, break glass, audit, and leak exclusion", () => {
  test("recovers an ambiguous successful put by stable operation id without a second lease", async () => {
    let writes = 0,
      first = true;
    const results = new Map<
      string,
      Awaited<ReturnType<SecretCustody["put"]>>
    >();
    const ambiguous: SecretCustody = {
      ...custody,
      put: async (input) => {
        let result = results.get(input.operationId);
        if (!result) {
          writes += 1;
          result = {
            reference: { provider: "idempotent", locator: input.operationId },
            leaseId: "stable-lease",
          };
          results.set(input.operationId, result);
        }
        if (first) {
          first = false;
          throw new Error("response lost after commit");
        }
        return result;
      },
    };
    const plane = new OrganizationAuthorityPlane(trust, ambiguous);
    plane.registerIdentity({
      id: "service-1",
      tenant: "acme",
      kind: "service",
      issuer: "idp",
      status: "active",
      createdSequence: 1,
    });
    const grant = await rootGrant();
    plane.issueGrant(grant);
    const issued = await event({
      kind: "issued",
      sequence: 1,
      credentialId: "ambiguous",
      authorityDigest: await digest(grant.authority),
    });
    const handle = {
      credentialId: "ambiguous",
      tenant: "acme",
      generation: 1,
      grantId: grant.id,
      keyId: "k",
      publicKeyThumbprint: "sha256:k",
      secretReference: { provider: "none", locator: "none" },
      issuedSequence: 1,
    };
    await expect(
      plane.issueCredential({
        handle,
        secret: Uint8Array.of(7),
        expiresAt: "2026-07-15T13:00:00Z",
        event: issued,
      }),
    ).rejects.toThrow(/response lost/);
    await expect(
      plane.issueCredential({
        handle,
        secret: Uint8Array.of(0),
        expiresAt: "2026-07-15T13:00:00Z",
        event: issued,
      }),
    ).resolves.toMatchObject({
      secretReference: { locator: "acme/event-1/put" },
    });
    expect(writes).toBe(1);
    expect(plane.custodyOutbox.size).toBe(0);
  });
  test("zeroizes secret and does not commit issuance when custody fails", async () => {
    const failing: SecretCustody = {
      ...custody,
      put: async () => {
        throw new Error("vault unavailable");
      },
    };
    const plane = new OrganizationAuthorityPlane(trust, failing);
    plane.registerIdentity({
      id: "service-1",
      tenant: "acme",
      kind: "service",
      issuer: "idp",
      status: "active",
      createdSequence: 1,
    });
    const grant = await rootGrant();
    plane.issueGrant(grant);
    const issued = await event({
        kind: "issued",
        sequence: 1,
        credentialId: "failed",
        authorityDigest: await digest(grant.authority),
      }),
      secret = Uint8Array.of(9, 8, 7);
    await expect(
      plane.issueCredential({
        handle: {
          credentialId: "failed",
          tenant: "acme",
          generation: 1,
          grantId: grant.id,
          keyId: "k",
          publicKeyThumbprint: "sha256:k",
          secretReference: { provider: "none", locator: "none" },
          issuedSequence: 1,
        },
        secret,
        expiresAt: "2026-07-15T13:00:00Z",
        event: issued,
      }),
    ).rejects.toThrow(/vault unavailable/);
    expect([...secret]).toEqual([0, 0, 0]);
    expect(plane.lifecycle).toHaveLength(0);
    expect(plane.portableState().credentials).toHaveLength(0);
  });
  test("zeroizes caller secret, keeps only opaque references, and excludes reusable material from portable state and audit", async () => {
    const { plane } = await buildPlane(),
      serialized = canonicalSemanticJson(plane.portableState());
    expect(serialized).not.toContain("[1,2,3,4]");
    expect(serialized).not.toContain("PRIVATE KEY");
    expect(serialized).toContain("external-test-store");
    const req = request(),
      signed = await proof(req);
    plane.authorize(req, signed);
    expect(canonicalSemanticJson(plane.audit)).not.toContain(signed.signature);
  });
  test("break glass requires independent quorum, short lifetime, and cannot self-approve", async () => {
    const plane = new OrganizationAuthorityPlane(trust, custody);
    plane.registerIdentity({
      id: "emergency-issuer",
      tenant: "acme",
      kind: "service",
      issuer: "root",
      status: "active",
      createdSequence: 1,
    });
    for (const id of ["security", "incident-commander"])
      plane.registerIdentity({
        id,
        tenant: "acme",
        kind: "human",
        issuer: "root",
        status: "active",
        createdSequence: id === "security" ? 2 : 3,
      });
    const grant = authority({
        resources: ["repo:acme/app"],
        effects: ["tasks:comment"],
        expiresAt: "2026-07-15T12:10:00Z",
      }),
      rootStatement = {
        id: "break-glass",
        authority: grant,
        issuer: "emergency-issuer",
        sequence: 1,
        kind: "break-glass" as const,
      },
      rootProof = await grantProof(rootStatement),
      root = {
        ...rootStatement,
        proofDigest: rootProof,
        rootEvidence: {
          signer: "tenant-root",
          algorithm: "Ed25519",
          signature: signature(rootProof),
        },
      };
    plane.issueGrant(root);
    const childAuthority = { ...grant, resources: ["repo:acme/app"] },
      childStatement = {
        id: "break-glass-child",
        parent: root.id,
        authority: childAuthority,
        issuer: "security",
        sequence: 2,
      },
      childProof = await grantProof(childStatement);
    expect(() =>
      plane.issueGrant({
        ...childStatement,
        proofDigest: childProof,
        delegationEvidence: {
          signer: root.issuer,
          algorithm: "Ed25519",
          signature: signature(childProof),
        },
      }),
    ).toThrow(/attenuate|nondelegable/i);
    const issued = await event({
        kind: "break-glass-issued",
        sequence: 1,
        credentialId: "emergency-cred",
        authorityDigest: await digest(grant),
        issuer: "emergency-issuer",
      }),
      input = {
        grant: root,
        handle: {
          credentialId: "emergency-cred",
          tenant: "acme",
          generation: 1,
          grantId: root.id,
          keyId: "emergency",
          publicKeyThumbprint: "sha256:emergency",
          secretReference: { provider: "x", locator: "x" },
          issuedSequence: 1,
        },
        secret: Uint8Array.of(7),
        expiresAt: "2026-07-15T12:10:00Z",
        event: issued,
        approvals: await Promise.all(
          ["security", "incident-commander"].map((approver) =>
            breakGlassApproval(approver, rootProof),
          ),
        ),
        incident: "INC-42",
      };
    const copied = structuredClone(input.approvals);
    copied[1].signature = copied[0].signature;
    await expect(
      Promise.resolve().then(() =>
        plane.issueBreakGlass({ ...input, approvals: copied }),
      ),
    ).rejects.toThrow(/break-glass/i);
    await expect(
      Promise.resolve().then(() =>
        plane.issueBreakGlass({ ...input, expiresAt: "2026-07-15T11:59:00Z" }),
      ),
    ).rejects.toThrow(/break-glass/i);
    await plane.issueBreakGlass(input);
    const invalidApprovals = await Promise.all(
      ["emergency-issuer", "security"].map((approver) =>
        breakGlassApproval(approver, rootProof),
      ),
    );
    await expect(
      Promise.resolve().then(() =>
        plane.issueBreakGlass({
          ...input,
          handle: { ...input.handle, credentialId: "other" },
          approvals: invalidApprovals,
        }),
      ),
    ).rejects.toThrow(/break-glass/i);
  });
});
