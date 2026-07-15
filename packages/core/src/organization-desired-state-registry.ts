import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export type RegistryObjectKind =
  "organization" | "profile" | "package" | "bundle" | "deployment" | "policy";
export type RegistryAction =
  | "read"
  | "write"
  | "branch"
  | "promote"
  | "approve"
  | "delete"
  | "backup"
  | "restore"
  | "export";
export interface RegistryAuthority {
  tenant: string;
  principal: string;
  actions: RegistryAction[];
  objectPrefixes: string[];
}
export interface RegistryTrust {
  now(): Date;
  verifyApproval(value: PromotionApproval): boolean;
  verifyRevocation(value: ApprovalRevocation): boolean;
  verifyCheckpoint(value: RegistryCheckpointEvidence): boolean;
}
export interface RegisteredMigration {
  id: string;
  kind: RegistryObjectKind;
  fromSchema: string;
  toSchema: string;
  digest: string;
  program: Array<{op:"set";path:string[];value:unknown}|{op:"remove";path:string[]}>;
}
export interface RegisteredObjectSchema{kind:RegistryObjectKind;version:string;validate(content:unknown):boolean}
export interface DesiredRevision {
  id: string;
  tenant: string;
  objectId: string;
  kind: RegistryObjectKind;
  branch: string;
  parents: string[];
  generation: number;
  schemaVersion: string;
  contentDigest: string;
  content?: unknown;
  author: string;
  committedAt: string;
  transactionId: string;
  migration?: {
    id: string;
    digest: string;
    fromSchema: string;
    inputDigest: string;
    outputDigest: string;
  };
}
export interface PromotionApproval {
  id: string;
  tenant: string;
  objectId: string;
  revisionId: string;
  environment: string;
  approver: string;
  role: string;
  sequence: number;
  expiresAt: string;
  statementDigest: string;
  signer: string;
  algorithm: string;
  signature: string;
}
export interface ApprovalRevocation {
  id: string;
  tenant: string;
  approvalId: string;
  sequence: number;
  effectiveAt: string;
  statementDigest: string;
  signer: string;
  algorithm: string;
  signature: string;
}
export interface Promotion {
  id: string;
  tenant: string;
  objectId: string;
  revisionId: string;
  environment: string;
  approvalIds: string[];
  requiredRoles:string[];
  promotedAt: string;
  promoter: string;
  transactionId: string;
  previousPromotionId?: string;
  generation:number;
}
export interface RegistryTombstone {
  tenant: string;
  objectId: string;
  deletedAt: string;
  purgeAfter: string;
  sequence: number;
  purgedAt?: string;
  priorHeadDigests: string[];
}
export interface RegistryCheckpointEvidence {
  digest: string;
  signer: string;
  algorithm: string;
  signature: string;
}
export type RegistryEventType =
  | "revision"
  | "branch"
  | "approval"
  | "revocation"
  | "promotion"
  | "delete"
  | "purge";
export interface RegistryJournalRecord {
  tenant: string;
  sequence: number;
  transactionId: string;
  requestDigest: string;
  type: RegistryEventType;
  objectId: string;
  occurredAt: string;
  payload: unknown;
  previousDigest: string;
  digest: string;
}
export interface CrashInjector {
  at(
    stage: "before-journal" | "after-journal",
    record: Omit<RegistryJournalRecord, "digest">,
  ): void;
}

const hash = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
const tuple = (...parts: string[]) => canonicalSemanticJson(parts);
const time = (value: string) => {
  const n = Date.parse(value);
  if (!Number.isFinite(n)) throw new Error(`invalid timestamp '${value}'`);
  return n;
};
const clone = <T>(value: T): T => structuredClone(value);
const exact = (a: unknown, b: unknown) =>
  canonicalSemanticJson(a) === canonicalSemanticJson(b);
function executeMigration(input:unknown,program:RegisteredMigration['program']){const out=clone(input);for(const step of program){if(!step.path.length||['__proto__','prototype','constructor'].some(x=>step.path.includes(x)))throw new Error('unsafe migration path');let target:any=out;if(!target||typeof target!=='object')throw new Error('migration target is not an object');for(const key of step.path.slice(0,-1)){if(!target[key]||typeof target[key]!=='object')target[key]={};target=target[key]}const key=step.path.at(-1)!;if(step.op==='set')target[key]=clone(step.value);else delete target[key]}return out}
export const approvalStatementDigest = (
  value: Omit<PromotionApproval, "statementDigest" | "signature">,
) => hash(value);
export const revocationStatementDigest = (
  value: Omit<ApprovalRevocation, "statementDigest" | "signature">,
) => hash(value);

interface Projection {
  revisions: Map<string, DesiredRevision>;
  heads: Map<string, string>;
  history: Map<string, string[]>;
  approvals: Map<string, PromotionApproval>;
  revocations: Map<string, ApprovalRevocation>;
  revoked: Set<string>;
  promotionHistory: Map<string, Promotion[]>;
  activePromotions: Map<string, Promotion>;
  tombstones: Map<string, RegistryTombstone>;
  receipts: Map<
    string,
    {
      requestDigest: string;
      resultId: string;
      objectId: string;
      type: RegistryEventType;
    }
  >;
  sequence: Map<string, number>;
}
const projection = (): Projection => ({
  revisions: new Map(),
  heads: new Map(),
  history: new Map(),
  approvals: new Map(),
  revocations: new Map(),
  revoked: new Set(),
  promotionHistory: new Map(),
  activePromotions: new Map(),
  tombstones: new Map(),
  receipts: new Map(),
  sequence: new Map(),
});

export class DesiredStateRegistry {
  private state = projection();
  private journal: RegistryJournalRecord[] = [];
  private blobs = new Map<string, unknown>();
  private migrations = new Map<string, RegisteredMigration>();
  private schemas=new Map<string,RegisteredObjectSchema>();
  constructor(
    private readonly trust: RegistryTrust,
    migrations: RegisteredMigration[] = [],
    schemas:RegisteredObjectSchema[] = [],
  ) {
    for (const migration of migrations) {
      if (
        !migration.id ||
        migration.digest!==hash(migration.program) ||
        this.migrations.has(migration.id)
      )
        throw new Error("migration registry identity invalid");
      this.migrations.set(migration.id, migration);
    }
    const defaults:RegisteredObjectSchema[]=["organization","profile","package","bundle","deployment","policy"].map(kind=>({kind:kind as RegistryObjectKind,version:"v1",validate:(x)=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x)}));
    for(const schema of [...defaults,...schemas])this.schemas.set(tuple(schema.kind,schema.version),schema);
  }

  commit(
    authority: RegistryAuthority,
    input: {
      transactionId: string;
      objectId: string;
      kind: RegistryObjectKind;
      branch: string;
      expectedHead?: string;
      parents?: string[];
      schemaVersion: string;
      content: unknown;
      committedAt: string;
    },
    crash?: CrashInjector,
  ) {
    this.require(authority, "write", input.objectId);
    this.complete(input);
    if(!this.schemas.get(tuple(input.kind,input.schemaVersion))?.validate(clone(input.content)))throw new Error('content fails authoritative class schema');
    time(input.committedAt);
    const receipt = this.receipt(authority.tenant, input.transactionId, input);
    if (receipt)
      return this.withContent(
        this.revision(authority.tenant, receipt.resultId),
      );
    const objectKey = tuple(authority.tenant, input.objectId),
      branchKey = tuple(authority.tenant, input.objectId, input.branch),
      current = this.state.heads.get(branchKey);
    if (this.state.tombstones.has(objectKey))
      throw new Error("deleted desired object cannot be resurrected");
    if (current !== input.expectedHead)
      throw new Error("branch compare-and-swap conflict");
    const parents = input.parents ?? (current ? [current] : []);
    if (current && !parents.includes(current))
      throw new Error("revision must descend from branch head");
    const parentRecords = parents.map((id) =>
      this.revision(authority.tenant, id),
    );
    if (parentRecords.some((x) => x.objectId !== input.objectId))
      throw new Error("cross-object parent");
    const prior = parentRecords[0];
    if (parentRecords.some(parent=>parent.kind!==input.kind||parent.schemaVersion!==input.schemaVersion))
      throw new Error("kind/schema change requires registered migration");
    const contentDigest = hash(input.content),
      generation = Math.max(0, ...parentRecords.map((x) => x.generation)) + 1,
      statement = {
        tenant: authority.tenant,
        objectId: input.objectId,
        kind: input.kind,
        branch: input.branch,
        parents,
        generation,
        schemaVersion: input.schemaVersion,
        contentDigest,
        author: authority.principal,
        committedAt: input.committedAt,
        transactionId: input.transactionId,
      },
      revision: DesiredRevision = {
        id: `revision:${hash(statement).slice(7)}`,
        ...statement,
      };
    this.transact(
      authority.tenant,
      input.transactionId,
      "revision",
      input.objectId,
      input.committedAt,
      { revision },
      hash(input),
      crash,
      [[contentDigest,input.content]],
    );
    return this.withContent(revision);
  }

  migrate(
    authority: RegistryAuthority,
    input: {
      transactionId: string;
      objectId: string;
      branch: string;
      expectedHead: string;
      migrationId: string;
      committedAt: string;
    },
    crash?: CrashInjector,
  ) {
    this.require(authority, "write", input.objectId);
    const priorReceipt=this.receipt(authority.tenant,input.transactionId,input);if(priorReceipt)return this.withContent(this.revision(authority.tenant,priorReceipt.resultId));
    const source = this.revision(authority.tenant, input.expectedHead),
      migration = this.migrations.get(input.migrationId);
    if (
      !migration ||
      migration.kind !== source.kind ||
      migration.fromSchema !== source.schemaVersion
    )
      throw new Error("migration is absent or incompatible");
    const sourceContent = this.content(authority.tenant, source),
      first = executeMigration(sourceContent,migration.program);
    if(!this.schemas.get(tuple(source.kind,migration.toSchema))?.validate(clone(first)))throw new Error('migration output fails target schema');
    const outputDigest = hash(first),
      current = this.state.heads.get(
        tuple(authority.tenant, input.objectId, input.branch),
      );
    if (current !== source.id)
      throw new Error("migration source is not branch head");
    const contentDigest = outputDigest,
      generation = source.generation + 1,
      statement = {
        tenant: authority.tenant,
        objectId: source.objectId,
        kind: source.kind,
        branch: input.branch,
        parents: [source.id],
        generation,
        schemaVersion: migration.toSchema,
        contentDigest,
        author: authority.principal,
        committedAt: input.committedAt,
        transactionId: input.transactionId,
        migration: {
          id: migration.id,
          digest: migration.digest,
          fromSchema: source.schemaVersion,
          inputDigest: source.contentDigest,
          outputDigest,
        },
      },
      revision: DesiredRevision = {
        id: `revision:${hash(statement).slice(7)}`,
        ...statement,
      };
    this.transact(
      authority.tenant,
      input.transactionId,
      "revision",
      input.objectId,
      input.committedAt,
      { revision },
      hash(input),
      crash,
      [[contentDigest,first]],
    );
    return this.withContent(revision);
  }

  createBranch(
    authority: RegistryAuthority,
    input: {
      transactionId: string;
      objectId: string;
      branch: string;
      fromRevision: string;
      createdAt: string;
    },
    crash?: CrashInjector,
  ) {
    this.require(authority, "branch", input.objectId);
    time(input.createdAt);
    const existing = this.receipt(authority.tenant, input.transactionId, input);
    if (existing) return;
    const revision = this.revision(authority.tenant, input.fromRevision);
    if (revision.objectId !== input.objectId)
      throw new Error("branch source cross-object");
    const k = tuple(authority.tenant, input.objectId, input.branch);
    if (this.state.heads.has(k)) throw new Error("branch already exists");
    this.transact(
      authority.tenant,
      input.transactionId,
      "branch",
      input.objectId,
      input.createdAt,
      { branch: input.branch, fromRevision: input.fromRevision },
      hash(input),
      crash,
    );
  }

  addApproval(
    authority: RegistryAuthority,
    value: PromotionApproval,
    crash?: CrashInjector,
  ) {
    this.require(authority, "approve", value.objectId);
    const { statementDigest, signature: _, ...statement } = value,
      current = this.seq(authority.tenant);
    if (
      value.tenant !== authority.tenant ||
      value.approver !== authority.principal ||
      value.signer !== value.approver ||
      value.sequence !== current + 1 ||
      statementDigest !== approvalStatementDigest(statement) ||
      !this.trust.verifyApproval(value) ||
      time(value.expiresAt) <= this.trust.now().getTime() ||
      this.state.approvals.has(tuple(value.tenant, value.id))
    )
      throw new Error(
        "approval invalid, unordered, duplicate, expired, or untrusted",
      );
    const revision = this.revision(value.tenant, value.revisionId);
    if (revision.objectId !== value.objectId)
      throw new Error("approval target cross-object");
    this.transact(
      value.tenant,
      `approval:${value.id}`,
      "approval",
      value.objectId,
      this.trust.now().toISOString(),
      { approval: clone(value) },
      hash(value),
      crash,
    );
  }
  revokeApproval(
    authority: RegistryAuthority,
    value: ApprovalRevocation,
    crash?: CrashInjector,
  ) {
    const approval = this.state.approvals.get(
      tuple(authority.tenant, value.approvalId),
    );
    if (!approval) throw new Error("approval absent");
    this.require(authority, "approve", approval.objectId);
    const { statementDigest, signature: _, ...statement } = value;
    if (
      value.tenant !== authority.tenant ||
      value.signer !== authority.principal ||
      value.sequence !== this.seq(authority.tenant) + 1 ||
      this.state.revocations.has(tuple(value.tenant, value.id)) ||
      this.state.revoked.has(tuple(value.tenant, value.approvalId)) ||
      statementDigest !== revocationStatementDigest(statement) ||
      !this.trust.verifyRevocation(value) ||
      time(value.effectiveAt) > this.trust.now().getTime()
    )
      throw new Error(
        "revocation invalid, unordered, duplicate, future, or untrusted",
      );
    this.transact(
      value.tenant,
      `revocation:${value.id}`,
      "revocation",
      approval.objectId,
      value.effectiveAt,
      { revocation: clone(value) },
      hash(value),
      crash,
    );
  }

  promote(
    authority: RegistryAuthority,
    input: {
      transactionId: string;
      id: string;
      objectId: string;
      revisionId: string;
      environment: string;
      approvalIds: string[];
      promotedAt: string;
      requiredRoles: string[];
      expectedPromotionId?: string;
    },
    crash?: CrashInjector,
  ) {
    this.require(authority, "promote", input.objectId);
    time(input.promotedAt);
    const priorReceipt = this.receipt(
      authority.tenant,
      input.transactionId,
      input,
    );
    if (priorReceipt)
      return this.promotionById(
        authority.tenant,
        input.objectId,
        input.environment,
        priorReceipt.resultId,
      );
    const revision = this.revision(authority.tenant, input.revisionId);
    if (
      revision.objectId !== input.objectId ||
      this.state.tombstones.has(tuple(authority.tenant, input.objectId))
    )
      throw new Error("promotion target invalid");
    const envKey = tuple(authority.tenant, input.objectId, input.environment),
      active = this.state.activePromotions.get(envKey);
    if (
      active?.id !== input.expectedPromotionId &&
      !(active === undefined && input.expectedPromotionId === undefined)
    )
      throw new Error("promotion compare-and-swap conflict");
    const approvals = input.approvalIds.map((id) =>
      this.state.approvals.get(tuple(authority.tenant, id)),
    );
    if (
      approvals.some((x) => !x) ||
      new Set(approvals.map((x) => x!.approver)).size !== approvals.length ||
      input.requiredRoles.some(
        (role) => !approvals.some((x) => x!.role === role),
      ) ||
      approvals.some(
        (x) =>
          x!.revisionId !== input.revisionId ||
          x!.objectId !== input.objectId ||
          x!.environment !== input.environment ||
          time(x!.expiresAt) <= this.trust.now().getTime() ||
          this.state.revoked.has(tuple(authority.tenant, x!.id)),
      )
    )
      throw new Error("promotion lacks live independent exact-target quorum");
    const generation=(active?.generation??0)+1,promotionStatement = {
      tenant: authority.tenant,
      objectId: input.objectId,
      revisionId: input.revisionId,
      environment: input.environment,
      approvalIds: [...input.approvalIds],
      requiredRoles:[...input.requiredRoles].sort(),
      promotedAt: input.promotedAt,
      promoter: authority.principal,
      transactionId: input.transactionId,
      generation,
      ...(active ? { previousPromotionId: active.id } : {}),
    };
    const promotion:Promotion={id:`promotion:${hash(promotionStatement).slice(7)}`,...promotionStatement};
    this.transact(
      authority.tenant,
      input.transactionId,
      "promotion",
      input.objectId,
      input.promotedAt,
      { promotion },
      hash(input),
      crash,
    );
    return clone(promotion);
  }

  deleteObject(
    authority: RegistryAuthority,
    input: {
      transactionId: string;
      objectId: string;
      deletedAt: string;
      purgeAfter: string;
    },
    crash?: CrashInjector,
  ) {
    this.require(authority, "delete", input.objectId);
    if (time(input.purgeAfter) <= time(input.deletedAt))
      throw new Error("purge deadline must follow deletion");
    const prior = this.receipt(authority.tenant, input.transactionId, input);
    if (prior)
      return clone(
        this.state.tombstones.get(tuple(authority.tenant, input.objectId))!,
      );
    if (this.state.tombstones.has(tuple(authority.tenant, input.objectId)))
      throw new Error("object already deleted under another transaction");
    const heads = [...this.state.heads.entries()]
        .filter(([k]) => this.keyIs(k, authority.tenant, input.objectId))
        .map(([, id]) => hash(id)),
      tombstone: RegistryTombstone = {
        tenant: authority.tenant,
        objectId: input.objectId,
        deletedAt: input.deletedAt,
        purgeAfter: input.purgeAfter,
        sequence: this.seq(authority.tenant) + 1,
        priorHeadDigests: heads,
      };
    this.transact(
      authority.tenant,
      input.transactionId,
      "delete",
      input.objectId,
      input.deletedAt,
      { tombstone },
      hash(input),
      crash,
    );
    return clone(tombstone);
  }
  purgeObject(
    authority: RegistryAuthority,
    input: { transactionId: string; objectId: string; at: string },
    crash?: CrashInjector,
  ) {
    this.require(authority, "delete", input.objectId);
    const tombstone = this.state.tombstones.get(
      tuple(authority.tenant, input.objectId),
    );
    if (!tombstone || time(input.at) < time(tombstone.purgeAfter))
      throw new Error("object not eligible for irreversible purge");
    const prior = this.receipt(authority.tenant, input.transactionId, input);
    if (prior) return clone(tombstone);
    const digests = [...this.state.revisions.values()]
      .filter(
        (r) => r.tenant === authority.tenant && r.objectId === input.objectId,
      )
      .map((r) => r.contentDigest);
    this.transact(
      authority.tenant,
      input.transactionId,
      "purge",
      input.objectId,
      input.at,
      { purgedAt: input.at },
      hash(input),
      crash,
    );
    for (const digest of digests)if(![...this.state.revisions.values()].some(r=>r.tenant===authority.tenant&&r.contentDigest===digest))
      this.blobs.delete(tuple(authority.tenant, digest));
    return clone(
      this.state.tombstones.get(tuple(authority.tenant, input.objectId))!,
    );
  }

  history(
    authority: RegistryAuthority,
    objectId: string,
    options: { limit: number; after?: { generation: number; id: string } },
  ) {
    this.require(authority, "read", objectId);
    if (
      !Number.isSafeInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 1000
    )
      throw new Error("history limit 1..1000");
    const ids = this.state.history.get(tuple(authority.tenant, objectId)) ?? [],
      start = options.after ? options.after.generation : 0;
    if(options.after&&(start<1||ids[start-1]!==options.after.id))throw new Error('history cursor is invalid for this tenant/object');
    const
      selected = ids.slice(start, start + options.limit + 1),
      items = selected
        .slice(0, options.limit)
        .map((id) => this.withContent(this.revision(authority.tenant, id)));
    return {
      items,
      next:
        selected.length > options.limit
          ? { generation: start+items.length, id: items.at(-1)!.id }
          : undefined,
      examined: Math.min(selected.length, options.limit + 1),
    };
  }
  promotionHistory(
    authority: RegistryAuthority,
    objectId: string,
    environment: string,
    options:{limit:number;afterGeneration?:number}={limit:100},
  ) {
    this.require(authority, "read", objectId);
    if(!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>1000||options.afterGeneration!==undefined&&(!Number.isSafeInteger(options.afterGeneration)||options.afterGeneration<0))throw new Error('promotion history bounds invalid');
    return clone((
      this.state.promotionHistory.get(
        tuple(authority.tenant, objectId, environment),
      ) ?? []
    ).slice(options.afterGeneration??0,(options.afterGeneration??0)+options.limit));
  }
  activePromotion(
    authority: RegistryAuthority,
    objectId: string,
    environment: string,
  ) {
    this.require(authority, "read", objectId);
    const value = this.state.activePromotions.get(
      tuple(authority.tenant, objectId, environment),
    );
    if (
      !value ||
      value.objectId !== objectId ||
      value.environment !== environment ||
      value.approvalIds.some((id) =>
        this.state.revoked.has(tuple(authority.tenant, id)),
      )
    )
      return undefined;
    return clone(value);
  }
  stateAt(
    authority: RegistryAuthority,
    objectId: string,
    branch: string,
    at: string,
    environment?:string,
  ):
    | { status: "present"; revision: DesiredRevision; promotion?: Promotion }
    | { status: "absent" | "deleted" } | {status:"purged";irreversible:true} {
    this.require(authority, "read", objectId);
    const cutoff = time(at),
      tomb = this.state.tombstones.get(tuple(authority.tenant, objectId));
    if (tomb?.purgedAt) return { status: "purged",irreversible:true };
    const replay = this.replay(
      this.journal.filter(
        (r) => r.tenant === authority.tenant && time(r.occurredAt) <= cutoff,
      ),
    );
    const deleted = replay.tombstones.get(tuple(authority.tenant, objectId));
    if (deleted) return deleted.purgedAt ? {status:"purged",irreversible:true}:{status:"deleted"};
    const id = replay.heads.get(tuple(authority.tenant, objectId, branch));
    if (!id) return { status: "absent" };
    const revision = replay.revisions.get(tuple(authority.tenant, id))!;
    const promotions=[...replay.activePromotions.values()].filter(p=>p.objectId===objectId&&(!environment||p.environment===environment)&&!p.approvalIds.some(id=>replay.revoked.has(tuple(authority.tenant,id))));
    if(!environment&&promotions.length>1)throw new Error('PITR environment is ambiguous');
    return {
      status: "present",
      revision: this.withContent(revision),
      promotion: promotions[0],
    };
  }

  listObjects(authority: RegistryAuthority,options:{limit:number;after?:string}={limit:1000}) {
    this.require(authority, "read", "*");
    if(!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>1000)throw new Error('object list bounds invalid');const all=[
      ...new Set(
        [...this.state.revisions.values()]
          .filter(
            (x) =>
              x.tenant === authority.tenant &&
              !this.state.tombstones.has(tuple(authority.tenant, x.objectId)),
          )
          .map((x) => x.objectId),
      ),
    ].sort(),start=options.after?all.findIndex(x=>x===options.after)+1:0;if(options.after&&start===0)throw new Error('object cursor invalid');return all.slice(start,start+options.limit);
  }
  exportTenant(authority: RegistryAuthority) {
    this.require(authority, "export", "*");
    return this.portable(authority.tenant);
  }
  exportJournal(authority: RegistryAuthority) {
    this.require(authority, "backup", "*");
    return clone(this.journal.filter((x) => x.tenant === authority.tenant));
  }
  backup(
    authority: RegistryAuthority,
    sign: (digest: string) => Omit<RegistryCheckpointEvidence, "digest">,
  ) {
    this.require(authority, "backup", "*");
    const state = this.portable(authority.tenant),
      checkpointDigest = hash(state);
    return {
      ...state,
      checkpoint: { digest: checkpointDigest, ...sign(checkpointDigest) },
    };
  }
  restore(
    authority: RegistryAuthority,
    backup: ReturnType<DesiredStateRegistry["backup"]>,
    suffix: ApprovalRevocation[] = [],
  ) {
    this.require(authority, "restore", "*");
    const { checkpoint, ...portable } = backup;
    if (
      portable.tenant !== authority.tenant ||
      checkpoint.digest !== hash(portable) ||
      !this.trust.verifyCheckpoint(checkpoint)
    )
      throw new Error("backup cross-tenant, tampered, or untrusted");
    const records = clone(portable.journal);
    this.validateJournal(records, authority.tenant);
    if(portable.lastSequence!==records.length||portable.lastDigest!==(records.at(-1)?.digest??'genesis'))throw new Error('backup high-watermark invariant invalid');
    if(this.seq(authority.tenant)>portable.lastSequence)throw new Error('restore would roll back authoritative high-watermark');
    const restored = this.replay(records);
    this.validateProjection(restored, portable.blobs);
    let expected=portable.lastSequence,lastSuffixTime=records.at(-1)?.occurredAt;const seen=new Set<string>(),revocationIds=new Set([...restored.revocations.values()].map(x=>x.id));for(const r of [...suffix].sort((a,b)=>a.sequence-b.sequence)){const approval=restored.approvals.get(tuple(authority.tenant,r.approvalId));const{statementDigest,signature:_,...statement}=r;if(!approval||r.tenant!==authority.tenant||r.sequence!==++expected||seen.has(r.approvalId)||restored.revoked.has(tuple(authority.tenant,r.approvalId))||revocationIds.has(r.id)||restored.receipts.has(tuple(authority.tenant,`revocation:${r.id}`))||statementDigest!==revocationStatementDigest(statement)||!this.trust.verifyRevocation(r)||time(r.effectiveAt)>this.trust.now().getTime()||(lastSuffixTime&&time(r.effectiveAt)<time(lastSuffixTime)))throw new Error('revocation suffix unordered, invalid, or rollback-unsafe');seen.add(r.approvalId);revocationIds.add(r.id);lastSuffixTime=r.effectiveAt}
    this.clearTenant(authority.tenant);
    this.journal.push(...records);
    for (const [d, v] of portable.blobs)
      this.blobs.set(tuple(authority.tenant, d), clone(v));
    this.state = this.replay(this.journal);
    for (const revocation of [...suffix].sort(
      (a, b) => a.sequence - b.sequence,
    ))
      this.revokeApproval(
        {
          ...authority,
          principal: revocation.signer,
          actions: [...new Set([...authority.actions, "approve" as const])],
          objectPrefixes: ["*"],
        },
        revocation,
      );
  }
  recover(authority: RegistryAuthority) {
    this.require(authority, "restore", "*");
    const records = this.journal.filter((x) => x.tenant === authority.tenant);
    this.validateJournal(records, authority.tenant);
    const blobs = [...this.blobs.entries()]
      .filter(([k]) => (JSON.parse(k) as string[])[0] === authority.tenant)
      .map(
        ([k, v]) =>
          [(JSON.parse(k) as string[])[1], clone(v)] as [string, unknown],
      );
    const restored = this.replay(records);
    this.validateProjection(restored, blobs);
    this.state = this.replay(this.journal);
    this.cleanupPurgedBlobs(authority.tenant);
  }
  recoverTenant(
    authority: RegistryAuthority,
    records: RegistryJournalRecord[],
    blobs: Array<[string, unknown]>,
  ) {
    this.require(authority, "restore", "*");
    this.validateJournal(records, authority.tenant);
    const restored = this.replay(records);
    this.validateProjection(restored, blobs);
    this.clearTenant(authority.tenant);
    this.journal.push(...clone(records));
    for (const [d, v] of blobs)
      this.blobs.set(tuple(authority.tenant, d), clone(v));
    this.state = this.replay(this.journal);
  }

  private transact(
    tenant: string,
    transactionId: string,
    type: RegistryEventType,
    objectId: string,
    occurredAt: string,
    payload: unknown,
    requestDigest: string,
    crash?: CrashInjector,
    blobWrites:Array<[string,unknown]>=[],
  ) {
    if (!transactionId) throw new Error("transaction id required");
    time(occurredAt);const priorRecord=this.journal.filter(x=>x.tenant===tenant).at(-1);if(priorRecord&&time(occurredAt)<time(priorRecord.occurredAt))throw new Error('journal time must be monotonic per tenant');
    const previous =
        this.journal.filter((x) => x.tenant === tenant).at(-1)?.digest ??
        "genesis",
      base = {
        tenant,
        sequence: this.seq(tenant) + 1,
        transactionId,
        requestDigest,
        type,
        objectId,
        occurredAt,
        payload: clone(payload),
        previousDigest: previous,
      };
    crash?.at("before-journal", base);
    const record = { ...base, digest: hash(base) };
    for(const[d,v]of blobWrites)this.blobs.set(tuple(tenant,d),clone(v));
    this.journal.push(record);
    crash?.at("after-journal", base);
    this.apply(this.state, record);
  }
  private apply(state: Projection, record: RegistryJournalRecord) {
    const p = record.payload as any,
      stateKey = tuple(record.tenant, record.objectId);
    state.sequence.set(record.tenant, record.sequence);
    if (record.type === "revision") {
      const r = p.revision as DesiredRevision;
      state.revisions.set(tuple(record.tenant, r.id), clone(r));
      state.heads.set(tuple(record.tenant, r.objectId, r.branch), r.id);
      const h = state.history.get(stateKey) ?? [];
      h.push(r.id);
      h.sort((a, b) => {
        const x = state.revisions.get(tuple(record.tenant, a))!,
          y = state.revisions.get(tuple(record.tenant, b))!;
        return x.generation - y.generation || x.id.localeCompare(y.id);
      });
      state.history.set(stateKey, h);
    }
    if (record.type === "branch")
      state.heads.set(
        tuple(record.tenant, record.objectId, p.branch),
        p.fromRevision,
      );
    if (record.type === "approval")
      state.approvals.set(
        tuple(record.tenant, p.approval.id),
        clone(p.approval),
      );
    if (record.type === "revocation") {
      state.revocations.set(
        tuple(record.tenant, p.revocation.id),
        clone(p.revocation),
      );
      state.revoked.add(tuple(record.tenant, p.revocation.approvalId));
    }
    if (record.type === "promotion") {
      const x = p.promotion as Promotion,
        k = tuple(record.tenant, x.objectId, x.environment),
        h = state.promotionHistory.get(k) ?? [];
      h.push(clone(x));
      state.promotionHistory.set(k, h);
      state.activePromotions.set(k, clone(x));
    }
    if (record.type === "delete") {
      state.tombstones.set(stateKey, clone(p.tombstone));
      for (const [k, x] of state.activePromotions)
        if (x.tenant === record.tenant && x.objectId === record.objectId)
          state.activePromotions.delete(k);
    }
    if (record.type === "purge") {
      const tomb = state.tombstones.get(stateKey)!;
      tomb.purgedAt = p.purgedAt;
      tomb.priorHeadDigests = [];
      for (const [k, r] of state.revisions)
        if (r.tenant === record.tenant && r.objectId === record.objectId)
          state.revisions.delete(k);
      for (const k of state.heads.keys())
        if (this.keyIs(k, record.tenant, record.objectId))
          state.heads.delete(k);
      const removedApprovals=new Set([...state.approvals.values()].filter(a=>a.tenant===record.tenant&&a.objectId===record.objectId).map(a=>a.id));
      for (const [k, a] of state.approvals)
        if (a.tenant === record.tenant && a.objectId === record.objectId)
          state.approvals.delete(k);
      for(const[k,r]of state.revocations)if(r.tenant===record.tenant&&removedApprovals.has(r.approvalId))state.revocations.delete(k);
      for(const id of removedApprovals)state.revoked.delete(tuple(record.tenant,id));
      for(const[k,h]of state.promotionHistory)if(h.some(p=>p.tenant===record.tenant&&p.objectId===record.objectId))state.promotionHistory.delete(k);
      for(const[k,promotion]of state.activePromotions)if(promotion.tenant===record.tenant&&promotion.objectId===record.objectId)state.activePromotions.delete(k);
      state.history.delete(stateKey);
      for (const [k, r] of state.receipts)
        if ((JSON.parse(k) as string[])[0]===record.tenant&&r.objectId === record.objectId) state.receipts.delete(k);
    }
    state.receipts.set(tuple(record.tenant, record.transactionId), {
      requestDigest: record.requestDigest,
      resultId: this.resultId(record),
      objectId: record.objectId,
      type: record.type,
    });
  }
  private replay(records: RegistryJournalRecord[]) {
    const p = projection();
    for (const r of records) this.apply(p, r);
    return p;
  }
  private validateJournal(records: RegistryJournalRecord[], tenant: string) {
    let prior = "genesis",
      seq = 0;
    const tx = new Set<string>(),journalRevisions=new Map<string,DesiredRevision>(),journalApprovals=new Map<string,PromotionApproval>(),journalRevoked=new Set<string>(),journalDeleted=new Set<string>();
    let priorTime:number|undefined;for (const r of records) {
      const { digest, ...base } = r;
      if (
        r.tenant !== tenant ||
        r.sequence !== ++seq ||
        r.previousDigest !== prior ||
        digest !== hash(base) ||
        tx.has(r.transactionId)||
        (priorTime!==undefined&&time(r.occurredAt)<priorTime)
      )
        throw new Error("backup journal invariant invalid");
      prior = digest;
      priorTime=time(r.occurredAt);
      tx.add(r.transactionId);
      const p=r.payload as any;
      if(r.type==='revision'){
        const x=p?.revision as DesiredRevision|undefined;if(!x||x.tenant!==tenant||x.objectId!==r.objectId||x.transactionId!==r.transactionId||x.committedAt!==r.occurredAt||x.content!==undefined||new Set(x.parents).size!==x.parents.length||x.id!==`revision:${hash((({id:_,...statement})=>statement)(x)).slice(7)}`)throw new Error('backup revision record binding invalid');
        if(journalDeleted.has(x.objectId)||x.parents.some(id=>journalRevisions.get(id)?.objectId!==x.objectId))throw new Error('backup revision causal order invalid');journalRevisions.set(x.id,x);
      }else if(r.type==='approval'){const x=p?.approval as PromotionApproval|undefined,revision=x&&journalRevisions.get(x.revisionId);if(!x||x.tenant!==tenant||x.objectId!==r.objectId||x.sequence!==r.sequence||x.signer!==x.approver||time(x.expiresAt)<=time(r.occurredAt)||revision?.objectId!==x.objectId||journalApprovals.has(x.id))throw new Error('backup approval record binding invalid');journalApprovals.set(x.id,x)}
      else if(r.type==='revocation'){const x=p?.revocation as ApprovalRevocation|undefined;if(!x||x.tenant!==tenant||x.sequence!==r.sequence||x.effectiveAt!==r.occurredAt||!journalApprovals.has(x.approvalId)||journalRevoked.has(x.approvalId))throw new Error('backup revocation record binding invalid');journalRevoked.add(x.approvalId)}
      else if(r.type==='promotion'){const x=p?.promotion as Promotion|undefined,approvals=x?x.approvalIds.map(id=>journalApprovals.get(id)):[];if(!x||x.tenant!==tenant||x.objectId!==r.objectId||x.transactionId!==r.transactionId||x.promotedAt!==r.occurredAt||journalRevisions.get(x.revisionId)?.objectId!==x.objectId||approvals.some(a=>!a)||x.approvalIds.some(id=>journalRevoked.has(id))||new Set(approvals.map(a=>a?.approver)).size!==approvals.length)throw new Error('backup promotion record binding invalid')}
      else if(r.type==='delete'){if(!p?.tombstone||journalDeleted.has(r.objectId))throw new Error('backup tombstone record invalid');journalDeleted.add(r.objectId)}
      else if(r.type==='branch'&&(!p||typeof p.branch!=='string'||typeof p.fromRevision!=='string'||journalRevisions.get(p.fromRevision)?.objectId!==r.objectId))throw new Error('backup branch record invalid');
      else if(r.type==='purge'&&(!p||p.purgedAt!==r.occurredAt||!journalDeleted.has(r.objectId)))throw new Error('backup purge record invalid');
    }
  }
  private validateProjection(
    state: Projection,
    blobs: Array<[string, unknown]>,
  ) {
    const available = new Map(blobs);
    if(available.size!==blobs.length)throw new Error('backup contains duplicate blobs');
    for (const r of state.revisions.values()) {
      const { id, content, ...statement } = r;
      if (
        r.tenant === "" ||
        content !== undefined ||
        id !== `revision:${hash(statement).slice(7)}`
      )
        throw new Error("backup revision identity invalid");
      if(!this.schemas.get(tuple(r.kind,r.schemaVersion))?.validate(clone(available.get(r.contentDigest))))throw new Error('backup authoritative class schema invalid');
      if(r.generation!==Math.max(0,...r.parents.map(id=>state.revisions.get(tuple(r.tenant,id))?.generation??-1))+1)throw new Error('backup revision generation invalid');
      if(r.migration){const m=this.migrations.get(r.migration.id),parent=state.revisions.get(tuple(r.tenant,r.parents[0]!));if(!m||m.digest!==r.migration.digest||m.fromSchema!==r.migration.fromSchema||m.toSchema!==r.schemaVersion||r.migration.inputDigest!==parent?.contentDigest||r.migration.outputDigest!==r.contentDigest||hash(executeMigration(available.get(parent!.contentDigest),m.program))!==r.contentDigest)throw new Error('backup migration provenance invalid')}
      if (
        !state.tombstones.get(tuple(r.tenant, r.objectId))?.purgedAt &&
        (!available.has(r.contentDigest) ||
          hash(available.get(r.contentDigest)) !== r.contentDigest)
      )
        throw new Error("backup revision blob invariant invalid");
      for (const parent of r.parents) {
        const p = state.revisions.get(tuple(r.tenant, parent));
        if (!p || p.objectId !== r.objectId || p.kind !== r.kind||(r.migration?false:p.schemaVersion!==r.schemaVersion))
          throw new Error("backup revision DAG invalid");
      }
    }
    for (const [k, id] of state.heads){const parts=JSON.parse(k) as string[],target=state.revisions.get(tuple(parts[0]!,id));
      if (!target||target.tenant!==parts[0]||target.objectId!==parts[1])
        throw new Error("backup head target invalid");
    }
    for (const a of state.approvals.values())
      if (
        approvalStatementDigest((({statementDigest:_,signature:__,...x})=>x)(a))!==a.statementDigest||!this.trust.verifyApproval(a) ||
        a.signer!==a.approver||state.revisions.get(tuple(a.tenant,a.revisionId))?.objectId!==a.objectId
      )
        throw new Error("backup approval invariant invalid");
    for (const r of state.revocations.values())
      if (
        revocationStatementDigest((({statementDigest:_,signature:__,...x})=>x)(r))!==r.statementDigest||!this.trust.verifyRevocation(r) ||
        !state.approvals.has(tuple(r.tenant, r.approvalId))
      )
        throw new Error("backup revocation invariant invalid");
    for(const [key,history]of state.promotionHistory){let previous:Promotion|undefined;for(const p of history){const revision=state.revisions.get(tuple(p.tenant,p.revisionId)),approvals=p.approvalIds.map(id=>state.approvals.get(tuple(p.tenant,id)));if(!revision||revision.objectId!==p.objectId||new Set(p.approvalIds).size!==p.approvalIds.length||new Set(approvals.map(a=>a?.approver)).size!==approvals.length||new Set(p.requiredRoles).size!==p.requiredRoles.length||p.generation!==(previous?.generation??0)+1||p.previousPromotionId!==previous?.id||p.id!==`promotion:${hash((({id:_,...x})=>x)(p)).slice(7)}`||approvals.some(a=>!a||a.objectId!==p.objectId||a.revisionId!==p.revisionId||a.environment!==p.environment||time(a.expiresAt)<=time(p.promotedAt))||p.requiredRoles.some(role=>!approvals.some(a=>a?.role===role)))throw new Error('backup promotion invariant invalid');previous=p}if(previous&&state.activePromotions.get(key)?.id!==previous.id)throw new Error('backup active promotion invariant invalid')}
    for(const [key,t] of state.tombstones){const parts=JSON.parse(key) as string[];if(t.tenant!==parts[0]||t.objectId!==parts[1]||time(t.purgeAfter)<=time(t.deletedAt)||t.purgedAt&&time(t.purgedAt)<time(t.purgeAfter))throw new Error('backup tombstone invariant invalid');}
    const referenced=new Set([...state.revisions.values()].map(r=>r.contentDigest));for(const digest of available.keys())if(!referenced.has(digest))throw new Error('backup contains unreferenced blob');
  }
  private portable(tenant: string) {
    const records = this.journal.filter((x) => x.tenant === tenant),
      purged = new Set(
        [...this.state.tombstones.values()]
          .filter((x) => x.tenant === tenant && x.purgedAt)
          .map((x) => x.objectId),
      ),
      digests = new Set(
        [...this.state.revisions.values()]
          .filter((x) => x.tenant === tenant && !purged.has(x.objectId))
          .map((x) => x.contentDigest),
      );
    return {
      schema: "autonomy.desired-state-backup.v2" as const,
      tenant,
      journal: clone(records),
      blobs: [...digests].map(
        (d) =>
          [d, clone(this.blobs.get(tuple(tenant, d)))] as [string, unknown],
      ),
      lastSequence: this.seq(tenant),
      lastDigest: records.at(-1)?.digest ?? "genesis",
    };
  }
  private receipt(tenant: string, transactionId: string, input: unknown) {
    const r = this.state.receipts.get(tuple(tenant, transactionId));
    if (!r) return undefined;
    if (r.requestDigest !== hash(input))
      throw new Error("transaction id equivocation");
    return r;
  }
  private resultId(record: RegistryJournalRecord) {
    const p = record.payload as any;
    return (
      p.revision?.id ??
      p.promotion?.id ??
      p.approval?.id ??
      p.revocation?.id ??
      record.transactionId
    );
  }
  private revision(tenant: string, id: string) {
    const r = this.state.revisions.get(tuple(tenant, id));
    if (!r) throw new Error("revision absent");
    return r;
  }
  private withContent(r: DesiredRevision) {
    return { ...clone(r), content: this.content(r.tenant, r) };
  }
  private content(tenant: string, r: DesiredRevision) {
    const value = this.blobs.get(tuple(tenant, r.contentDigest));
    if (value === undefined)
      throw new Error("revision content irreversibly purged");
    return clone(value);
  }
  private promotionById(
    tenant: string,
    objectId: string,
    environment: string,
    id: string,
  ) {
    const p = (
      this.state.promotionHistory.get(tuple(tenant, objectId, environment)) ??
      []
    ).find((x) => x.id === id);
    if (!p) throw new Error("promotion receipt target absent");
    return clone(p);
  }
  private seq(tenant: string) {
    return this.state.sequence.get(tenant) ?? 0;
  }
  private complete(input: {
    transactionId: string;
    objectId: string;
    kind: string;
    branch: string;
    schemaVersion: string;
  }) {
    if (
      !input.transactionId ||
      !input.objectId ||
      !input.branch ||
      !input.schemaVersion ||
      ![
        "organization",
        "profile",
        "package",
        "bundle",
        "deployment",
        "policy",
      ].includes(input.kind)
    )
      throw new Error("revision transaction incomplete");
  }
  private keyIs(encoded: string, tenant: string, objectId: string) {
    const parts = JSON.parse(encoded) as string[];
    return parts[0] === tenant && parts[1] === objectId;
  }
  private clearTenant(tenant: string) {
    this.journal = this.journal.filter((x) => x.tenant !== tenant);
    for (const k of this.blobs.keys())
      if ((JSON.parse(k) as string[])[0] === tenant) this.blobs.delete(k);
    this.state = this.replay(this.journal);
  }
  private cleanupPurgedBlobs(tenant: string) {
    const purged = new Set(
      [...this.state.tombstones.values()]
        .filter((t) => t.tenant === tenant && t.purgedAt)
        .map((t) => t.objectId),
    );
    for (const record of this.journal)
      if (
        record.tenant === tenant &&
        record.type === "revision" &&
        purged.has(record.objectId)
      ) {
        const revision = (record.payload as { revision: DesiredRevision })
          .revision;
        if(![...this.state.revisions.values()].some(r=>r.tenant===tenant&&r.contentDigest===revision.contentDigest))this.blobs.delete(tuple(tenant, revision.contentDigest));
      }
  }
  private require(
    authority: RegistryAuthority,
    action: RegistryAction,
    objectId: string,
  ) {
    if (
      !authority.tenant ||
      !authority.principal ||
      !authority.actions.includes(action) ||
      !authority.objectPrefixes.some(
        (prefix) =>
          prefix === "*" ||
          objectId === prefix ||
          objectId.startsWith(`${prefix}/`),
      )
    )
      throw new Error("registry action outside tenant object authority");
  }
}
