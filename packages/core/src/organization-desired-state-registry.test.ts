import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  DesiredStateRegistry,
  approvalStatementDigest,
  revocationStatementDigest,
  type ApprovalRevocation,
  type PromotionApproval,
  type RegistryAuthority,
  type RegistryObjectKind,
} from "./organization-desired-state-registry";

const keys = generateKeyPairSync("ed25519"),
  now = "2026-07-15T12:00:00Z";
const signature = (value: string) =>
  sign(null, Buffer.from(value), keys.privateKey).toString("base64");
const check = (value: string, signed: string) =>
  verify(
    null,
    Buffer.from(value),
    keys.publicKey,
    Buffer.from(signed, "base64"),
  );
const digest=(value:unknown)=>`sha256:${createHash('sha256').update(canonicalSemanticJson(value)).digest('hex')}`;
const trust = {
  now: () => new Date(now),
  verifyApproval: (v: PromotionApproval) =>
    check(v.statementDigest, v.signature),
  verifyRevocation: (v: ApprovalRevocation) =>
    check(v.statementDigest, v.signature),
  verifyCheckpoint: (v: { digest: string; signature: string }) =>
    check(v.digest, v.signature),
};
const auth = (changes: Partial<RegistryAuthority> = {}): RegistryAuthority => ({
  tenant: "acme",
  principal: "operator",
  actions: [
    "read",
    "write",
    "branch",
    "promote",
    "approve",
    "delete",
    "backup",
    "restore",
    "export",
  ],
  objectPrefixes: ["*"],
  ...changes,
});
const commit = (
  r: DesiredStateRegistry,
  transactionId: string,
  objectId = "org/app",
  expectedHead?: string,
  kind: RegistryObjectKind = "deployment",
  at = now,
) =>
  r.commit(auth(), {
    transactionId,
    objectId,
    kind,
    branch: "main",
    expectedHead,
    schemaVersion: "v1",
    content: { transactionId },
    committedAt: at,
  });
const approval = (
  revisionId: string,
  sequence: number,
  id = "approval",
): PromotionApproval => {
  const statement = {
      id,
      tenant: "acme",
      objectId: "org/app",
      revisionId,
      environment: "prod",
      approver: "security",
      role: "security",
      sequence,
      expiresAt: "2026-07-15T13:00:00Z",
      signer: "security",
      algorithm: "Ed25519",
    },
    statementDigest = approvalStatementDigest(statement);
  return {
    ...statement,
    statementDigest,
    signature: signature(statementDigest),
  };
};
const revocation = (
  approvalId: string,
  sequence: number,
  id = "revocation",
  effectiveAt = now,
): ApprovalRevocation => {
  const statement = {
      id,
      tenant: "acme",
      approvalId,
      sequence,
      effectiveAt,
      signer: "security",
      algorithm: "Ed25519",
    },
    statementDigest = revocationStatementDigest(statement);
  return {
    ...statement,
    statementDigest,
    signature: signature(statementDigest),
  };
};
const checkpoint = (digest: string) => ({
  signer: "backup",
  algorithm: "Ed25519",
  signature: signature(digest),
});

describe("R17 desired-state registry invariants", () => {
  test("uses collision-free structured tenant/object/branch/environment keys and authoritative object classes", () => {
    const r = new DesiredStateRegistry(trust),
      a = commit(r, "a", "x/y"),
      b = commit(r, "b", "x", undefined, "policy");
    expect(a.id).not.toBe(b.id);
    expect(a.kind).toBe("deployment");
    expect(b.kind).toBe("policy");
    expect(r.listObjects(auth())).toEqual(["x", "x/y"]);
    expect(() =>
      r.commit(auth(), {
        transactionId: "bad",
        objectId: "x",
        kind: "not-a-kind" as RegistryObjectKind,
        branch: "main",
        schemaVersion: "v1",
        content: {},
        committedAt: now,
      }),
    ).toThrow(/incomplete/);
  });

  test("recovers an append-only transaction after every journal boundary and preserves idempotency", () => {
    for (const stage of ["before-journal", "after-journal"] as const) {
      const r = new DesiredStateRegistry(trust),
        input = {
          transactionId: `tx-${stage}`,
          objectId: "org/app",
          kind: "deployment" as const,
          branch: "main",
          schemaVersion: "v1",
          content: { a: 1 },
          committedAt: now,
        };
      expect(() =>
        r.commit(auth(), input, {
          at(point) {
            if (point === stage) throw new Error("crash");
          },
        }),
      ).toThrow("crash");
      if (stage === "before-journal") {
        expect(r.exportJournal(auth())).toHaveLength(0);
        expect(commit(r, "later").generation).toBe(1);
      } else {
        expect(r.exportJournal(auth())).toHaveLength(1);
        r.recover(auth());
        expect(r.commit(auth(), input).content).toEqual({ a: 1 });
        expect(() => r.commit(auth(), { ...input, content: { a: 2 } })).toThrow(
          /equivocation/,
        );
      }
    }
  });

  test("enforces branch and promotion CAS while retaining promotion history", () => {
    const r = new DesiredStateRegistry(trust),
      one = commit(r, "one");
    expect(() => commit(r, "stale")).toThrow(/compare-and-swap/);
    r.createBranch(auth(), {
      transactionId: "branch",
      objectId: "org/app",
      branch: "canary",
      fromRevision: one.id,
      createdAt: now,
    });
    const two = commit(r, "two", "org/app", one.id),
      a = approval(two.id, 4);
    r.addApproval(auth({ principal: "security" }), a);
    const p1 = r.promote(auth(), {
      transactionId: "promote-1",
      id: "p1",
      objectId: "org/app",
      revisionId: two.id,
      environment: "prod",
      approvalIds: [a.id],
      promotedAt: now,
      requiredRoles: ["security"],
    });
    expect(() =>
      r.promote(auth(), {
        transactionId: "promote-stale",
        id: "p2",
        objectId: "org/app",
        revisionId: two.id,
        environment: "prod",
        approvalIds: [a.id],
        promotedAt: now,
        requiredRoles: ["security"],
      }),
    ).toThrow(/compare-and-swap/);
    const p2 = r.promote(auth(), {
      transactionId: "promote-2",
      id: "p2",
      objectId: "org/app",
      revisionId: two.id,
      environment: "prod",
      approvalIds: [a.id],
      promotedAt: now,
      requiredRoles: ["security"],
      expectedPromotionId: p1.id,
    });
    expect(p2.previousPromotionId).toBe(p1.id);
    expect(
      r.promotionHistory(auth(), "org/app", "prod").map((x) => x.id),
    ).toEqual([p1.id, p2.id]);
  });

  test("executes only registered deterministic migrations and records full provenance", () => {
    const program=[{op:'set' as const,path:['v'],value:2}],good = {
        id: "v1-v2",
        kind: "deployment" as const,
        fromSchema: "v1",
        toSchema: "v2",
        digest: digest(program),program,
      },
      r = new DesiredStateRegistry(trust, [good],[{kind:'deployment',version:'v2',validate:(x)=>Boolean(x)&&typeof x==='object'&&(x as any).v===2}]),
      one = commit(r, "one"),
      two = r.migrate(auth(), {
        transactionId: "migrate",
        objectId: "org/app",
        branch: "main",
        expectedHead: one.id,
        migrationId: "v1-v2",
        committedAt: now,
      });
    expect(two.schemaVersion).toBe("v2");
    expect(two.migration).toMatchObject({
      id: "v1-v2",
      digest: good.digest,
      fromSchema: "v1",
      inputDigest: one.contentDigest,
      outputDigest: two.contentDigest,
    });
    expect(() =>
      r.commit(auth(), {
        transactionId: "illegal",
        objectId: "org/app",
        kind: "deployment",
        branch: "main",
        expectedHead: two.id,
        schemaVersion: "v3",
        content: {},
        committedAt: now,
      }),
    ).toThrow(/migration|schema/);
    expect(()=>new DesiredStateRegistry(trust,[{...good,id:'bad',digest:'sha256:lie'}])).toThrow(/identity/);
  });

  test("provides bounded indexed history and point-in-time reconstruction", () => {
    const r = new DesiredStateRegistry(trust);
    let head = commit(
      r,
      "t0",
      "org/app",
      undefined,
      "deployment",
      "2026-07-15T09:00:00Z",
    );
    for (let i = 1; i < 30; i++)
      head = commit(
        r,
        `t${i}`,
        "org/app",
        head.id,
        "deployment",
        `2026-07-15T09:${String(i).padStart(2, "0")}:00Z`,
      );
    const page = r.history(auth(), "org/app", { limit: 7 });
    expect(page.items).toHaveLength(7);
    expect(page.examined).toBe(8);
    expect(
      r.history(auth(), "org/app", { limit: 7, after: page.next }).items[0]
        .generation,
    ).toBe(8);
    const at = r.stateAt(auth(), "org/app", "main", "2026-07-15T09:05:30Z");
    expect(at.status).toBe("present");
    if (at.status === "present") expect(at.revision.transactionId).toBe("t5");
  });

  test("rejects a freshly re-signed backup whose blob no longer matches immutable metadata", () => {
    const r = new DesiredStateRegistry(trust);
    commit(r, "one");
    const backup = r.backup(auth(), checkpoint),
      tampered = structuredClone(backup);
    tampered.blobs[0][1] = { forged: true };
    const { checkpoint: _, ...portable } = tampered,
      digest = `sha256:${createHash("sha256").update(canonicalSemanticJson(portable)).digest("hex")}`;
    tampered.checkpoint = { digest, ...checkpoint(digest) };
    expect(() =>
      new DesiredStateRegistry(trust).restore(auth(), tampered),
    ).toThrow(/blob invariant/);
  });

  test("applies ordered signed revocation suffixes and prevents promotion resurrection", () => {
    const r = new DesiredStateRegistry(trust),
      revision = commit(r, "one"),
      a = approval(revision.id, 2);
    r.addApproval(auth({ principal: "security" }), a);
    r.promote(auth(), {
      transactionId: "promote",
      id: "p",
      objectId: "org/app",
      revisionId: revision.id,
      environment: "prod",
      approvalIds: [a.id],
      promotedAt: now,
      requiredRoles: ["security"],
    });
    const backup = r.backup(auth(), checkpoint),
      restored = new DesiredStateRegistry(trust);
    restored.restore(auth(), backup, [revocation(a.id, 4)]);
    expect(restored.activePromotion(auth(), "org/app", "prod")).toBeUndefined();
    expect(() =>
      restored.revokeApproval(
        auth({ principal: "security" }),
        revocation(a.id, 5, "duplicate"),
      ),
    ).toThrow(/duplicate/);
    expect(() =>
      new DesiredStateRegistry(trust).restore(auth(), backup, [
        revocation(a.id, 5, "gap"),
      ]),
    ).toThrow(/unordered/);
  });

  test("purge removes content and projections while retaining only non-content journal evidence", () => {
    const r = new DesiredStateRegistry(trust),
      revision = commit(r, "one");
    r.deleteObject(auth(), {
      transactionId: "delete",
      objectId: "org/app",
      deletedAt: now,
      purgeAfter: "2026-07-16T12:00:00Z",
    });
    r.purgeObject(auth(), {
      transactionId: "purge",
      objectId: "org/app",
      at: "2026-07-17T12:00:00Z",
    });
    expect(
      r.stateAt(auth(), "org/app", "main", "2026-07-18T00:00:00Z"),
    ).toEqual({ status: "purged",irreversible:true });
    expect(r.exportTenant(auth()).blobs).toEqual([]);
    expect(canonicalSemanticJson(r.exportJournal(auth()))).not.toContain(
      canonicalSemanticJson({ transactionId: "one" }),
    );
    expect(() => r.history(auth(), "org/app", { limit: 1 }).items[0].content)
      .toThrow;
    expect(revision.content).toEqual({ transactionId: "one" });
  });

  test('purge is tenant-safe and retains blobs still reachable from another object',()=>{const r=new DesiredStateRegistry(trust),content={shared:true},a=r.commit(auth(),{transactionId:'a',objectId:'a',kind:'deployment',branch:'main',schemaVersion:'v1',content,committedAt:now}),b=r.commit(auth(),{transactionId:'b',objectId:'b',kind:'deployment',branch:'main',schemaVersion:'v1',content,committedAt:now});r.deleteObject(auth(),{transactionId:'delete-a',objectId:'a',deletedAt:now,purgeAfter:'2026-07-16T12:00:00Z'});r.purgeObject(auth(),{transactionId:'purge-a',objectId:'a',at:'2026-07-17T12:00:00Z'});expect(r.history(auth(),'b',{limit:1}).items[0]!.content).toEqual(content);expect(a.contentDigest).toBe(b.contentDigest);const beta=auth({tenant:'beta'}),betaRevision=r.commit(beta,{transactionId:'beta-tx',objectId:'a',kind:'deployment',branch:'main',schemaVersion:'v1',content:{beta:true},committedAt:now});expect(r.commit(beta,{transactionId:'beta-tx',objectId:'a',kind:'deployment',branch:'main',schemaVersion:'v1',content:{beta:true},committedAt:now}).id).toBe(betaRevision.id)});

  test('content-derived promotion generations prevent identifier ABA',()=>{const r=new DesiredStateRegistry(trust),rev=commit(r,'one'),a=approval(rev.id,2);r.addApproval(auth({principal:'security'}),a);const base={id:'same',objectId:'org/app',revisionId:rev.id,environment:'prod',approvalIds:[a.id],promotedAt:now,requiredRoles:['security']},p1=r.promote(auth(),{...base,transactionId:'p1'}),p2=r.promote(auth(),{...base,transactionId:'p2',expectedPromotionId:p1.id});expect(p1.id).not.toBe(p2.id);expect(p2.generation).toBe(2);expect(()=>r.promote(auth(),{...base,transactionId:'stale',expectedPromotionId:p1.id})).toThrow(/compare-and-swap/)});

  test('PITR is journal-ordered, environment-specific, and applies revocations',()=>{const r=new DesiredStateRegistry(trust),rev=commit(r,'one'),a=approval(rev.id,2);r.addApproval(auth({principal:'security'}),a);r.promote(auth(),{transactionId:'p',id:'ignored',objectId:'org/app',revisionId:rev.id,environment:'prod',approvalIds:[a.id],promotedAt:now,requiredRoles:['security']});r.revokeApproval(auth({principal:'security'}),revocation(a.id,4));expect(r.stateAt(auth(),'org/app','main',now,'prod')).toMatchObject({status:'present',promotion:undefined});expect(()=>r.commit(auth(),{transactionId:'past',objectId:'later',kind:'deployment',branch:'main',schemaVersion:'v1',content:{},committedAt:'2026-07-14T00:00:00Z'})).toThrow(/monotonic/)});

  test('restore recomputes signed statements, validates high-watermarks, and cannot roll back revocations',()=>{const r=new DesiredStateRegistry(trust),rev=commit(r,'one'),a=approval(rev.id,2);r.addApproval(auth({principal:'security'}),a);const old=r.backup(auth(),checkpoint),tampered=structuredClone(old),approvalRecord=tampered.journal.find(x=>x.type==='approval')!;(approvalRecord.payload as any).approval.role='admin';const base={...approvalRecord};delete (base as any).digest;approvalRecord.digest=digest(base);for(let i=tampered.journal.indexOf(approvalRecord)+1;i<tampered.journal.length;i++){tampered.journal[i]!.previousDigest=tampered.journal[i-1]!.digest;const b={...tampered.journal[i]};delete (b as any).digest;tampered.journal[i]!.digest=digest(b)}tampered.lastDigest=tampered.journal.at(-1)!.digest;const{checkpoint:_,...portable}=tampered;tampered.checkpoint={digest:digest(portable),...checkpoint(digest(portable))};expect(()=>new DesiredStateRegistry(trust).restore(auth(),tampered)).toThrow(/approval invariant/);r.revokeApproval(auth({principal:'security'}),revocation(a.id,3));expect(()=>r.restore(auth(),old)).toThrow(/roll back/)});

  test('migration provenance must be installed and cursor/list bounds reject forged scans',()=>{const program=[{op:'set' as const,path:['v'],value:2}],m={id:'m',kind:'deployment' as const,fromSchema:'v1',toSchema:'v2',program,digest:digest(program)},schemas=[{kind:'deployment' as const,version:'v2',validate:(x:unknown)=>Boolean(x)&&typeof x==='object'}],r=new DesiredStateRegistry(trust,[m],schemas),one=commit(r,'one');r.migrate(auth(),{transactionId:'migrate',objectId:'org/app',branch:'main',expectedHead:one.id,migrationId:'m',committedAt:now});const backup=r.backup(auth(),checkpoint);expect(()=>new DesiredStateRegistry(trust,[],schemas).restore(auth(),backup)).toThrow(/migration provenance/);expect(()=>r.history(auth(),'org/app',{limit:1,after:{generation:1,id:'revision:forged'}})).toThrow(/cursor/);expect(()=>r.listObjects(auth(),{limit:1001})).toThrow(/bounds/);expect(()=>r.promotionHistory(auth(),'org/app','prod',{limit:1001})).toThrow(/bounds/)});

  test('class-specific schemas reject structurally invalid authoritative records',()=>{const r=new DesiredStateRegistry(trust);expect(()=>r.commit(auth(),{transactionId:'primitive',objectId:'x',kind:'deployment',branch:'main',schemaVersion:'v1',content:'not-an-object',committedAt:now})).toThrow(/class schema/)});

  test('a promoted and revoked object remains restorable after irreversible purge',()=>{const r=new DesiredStateRegistry(trust),revision=commit(r,'one'),a=approval(revision.id,2);r.addApproval(auth({principal:'security'}),a);r.promote(auth(),{transactionId:'promote',id:'ignored',objectId:'org/app',revisionId:revision.id,environment:'prod',approvalIds:[a.id],promotedAt:now,requiredRoles:['security']});r.revokeApproval(auth({principal:'security'}),revocation(a.id,4));r.deleteObject(auth(),{transactionId:'delete',objectId:'org/app',deletedAt:now,purgeAfter:'2026-07-16T00:00:00Z'});r.purgeObject(auth(),{transactionId:'purge',objectId:'org/app',at:'2026-07-17T00:00:00Z'});const backup=r.backup(auth(),checkpoint),restored=new DesiredStateRegistry(trust);expect(()=>restored.restore(auth(),backup)).not.toThrow();expect(restored.stateAt(auth(),'org/app','main','2026-07-18T00:00:00Z')).toEqual({status:'purged',irreversible:true});expect(restored.exportTenant(auth()).blobs).toEqual([])});

  test('restore rejects duplicate or unreferenced blobs even under a fresh checkpoint signature',()=>{const r=new DesiredStateRegistry(trust);commit(r,'one');const backup=r.backup(auth(),checkpoint),tampered=structuredClone(backup);tampered.blobs.push(['sha256:'+'f'.repeat(64),{secret:'orphan'}]);const{checkpoint:_,...portable}=tampered;tampered.checkpoint={digest:digest(portable),...checkpoint(digest(portable))};expect(()=>new DesiredStateRegistry(trust).restore(auth(),tampered)).toThrow(/unreferenced blob/);const duplicate=structuredClone(backup);duplicate.blobs.push(structuredClone(duplicate.blobs[0]!));const{checkpoint:__,...duplicatePortable}=duplicate;duplicate.checkpoint={digest:digest(duplicatePortable),...checkpoint(digest(duplicatePortable))};expect(()=>new DesiredStateRegistry(trust).restore(auth(),duplicate)).toThrow(/duplicate blobs/)});
});
