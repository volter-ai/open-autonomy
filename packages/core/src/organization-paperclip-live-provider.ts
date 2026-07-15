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

export type PaperclipManifest = {
  schema: "autonomy.paperclip-live-provider.v1";
  deploymentId: string;
  baseUrl: string;
  companyId: string;
  controlAuthBinding: string;
  workerAuthBinding: string;
  source: {
    repository: string;
    releaseVersion: string;
    commit: string;
    treeDigest: string;
    lockDigest: string;
  };
  controlProviderId: string;
  workerProviderId: string;
  interactionProviderId: string;
  eventSchema: string;
  assumptions: Array<{ id: string; statement: string; consequence: string }>;
  manifestDigest: string;
};

export type PaperclipHttpRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  authBinding: string;
  body?: unknown;
  requestId: string;
  headers?: Record<string, string>;
};
export type PaperclipHttpResult = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};
export interface PaperclipNativePort {
  request(input: PaperclipHttpRequest): PaperclipHttpResult;
  verifySource(source: PaperclipManifest["source"]): boolean;
  endpoint(): string;
}

export type PaperclipEffect = {
  id: string;
  requestDigest: string;
  kind:
    | "issue-create"
    | "issue-checkout"
    | "issue-update"
    | "agent-wakeup"
    | "agent-pause"
    | "agent-resume"
    | "approval-create"
    | "approval-resolve"
    | "budget-update"
    | "backup-restore";
  status: "pending" | "acknowledged";
  nativeId?: string;
};
export type PaperclipProviderState = {
  schema: "autonomy.paperclip-live-state.v1";
  deploymentId: string;
  sequence: number;
  companyId: string;
  eventCursor: string | null;
  effects: Record<string, PaperclipEffect>;
  issueByEffect: Record<string, string>;
  digest: string;
  signature: string;
};
export interface PaperclipProviderTrust {
  signState(digest: string): string;
  verifyState(digest: string, signature: string): boolean;
}
export interface PaperclipProviderStateStore {
  load(id: string): PaperclipProviderState | undefined;
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: PaperclipProviderState,
  ): boolean;
}
export class MemoryPaperclipProviderStateStore implements PaperclipProviderStateStore {
  private readonly values = new Map<string, PaperclipProviderState>();
  load(id: string) {
    const value = this.values.get(id);
    return value && structuredClone(value);
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: PaperclipProviderState,
  ) {
    if (this.values.get(id)?.sequence !== expected) return false;
    this.values.set(id, structuredClone(next));
    return true;
  }
}

export class DiskPaperclipProviderStateStore implements PaperclipProviderStateStore {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  private path(id: string) {
    return resolve(
      this.root,
      `${createHash("sha256").update(id).digest("hex")}.json`,
    );
  }
  private lockPath(id: string) {
    return `${this.path(id)}.lock`;
  }
  load(id: string) {
    const path = this.path(id);
    if (!existsSync(path)) return undefined;
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!record(value)) throw new Error("Paperclip disk state is malformed");
    return structuredClone(value) as PaperclipProviderState;
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: PaperclipProviderState,
  ) {
    const lock = this.acquire(id);
    if (!lock) return false;
    try {
      if (this.load(id)?.sequence !== expected) return false;
      const path = this.path(id),
        temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(temporary, `${canonicalSemanticJson(next)}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      const descriptor = openSync(temporary, "r");
      try {
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
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
      rmSync(lock, { recursive: true, force: true });
    }
  }
  private acquire(id: string) {
    const lock = this.lockPath(id);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        mkdirSync(lock, { mode: 0o700 });
        writeFileSync(resolve(lock, "owner"), `${process.pid}\n`, {
          mode: 0o600,
        });
        return lock;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const owner = Number(
            readFileSync(resolve(lock, "owner"), "utf8").trim(),
          );
          let alive = Number.isSafeInteger(owner) && owner > 0;
          if (alive)
            try {
              process.kill(owner, 0);
            } catch {
              alive = false;
            }
          if (!alive || Date.now() - statSync(lock).mtimeMs > 30_000)
            rmSync(lock, { recursive: true, force: true });
          else return undefined;
        } catch (inspectionError) {
          if ((inspectionError as NodeJS.ErrnoException).code !== "ENOENT")
            throw inspectionError;
        }
      }
    }
    return undefined;
  }
}

export type PortablePaperclipObservation =
  | {
      kind: "work.observed";
      work: string;
      status: string;
      assignee?: string;
      nativeRevision: string;
    }
  | {
      kind: "attempt.observed";
      work: string;
      attempt: string;
      actor: string;
      state: string;
      costCents: number | null;
      costEvidence: "observed" | "missing";
    }
  | {
      kind: "approval.observed";
      approval: string;
      state: string;
      work: string[];
    }
  | {
      kind: "gap";
      nativeType: string;
      reason: string;
    };

export type PaperclipTimelineLift = {
  observations: PortablePaperclipObservation[];
  nextOffset: number | null;
  nativeWindow: { from: string; to: string; capped: boolean };
};

export type PaperclipPortableBackup = {
  schema: "autonomy.paperclip-portable-backup.v1";
  sourceCompanyId: string;
  native: {
    rootPath: string;
    manifest: Record<string, unknown>;
    files: Record<string, unknown>;
  };
  digest: string;
};

export class PaperclipLiveProvider {
  constructor(
    private readonly manifest: PaperclipManifest,
    private readonly native: PaperclipNativePort,
    private readonly trust: PaperclipProviderTrust,
    private readonly store: PaperclipProviderStateStore,
  ) {
    validateManifest(manifest);
  }

  deploy() {
    if (
      new URL(this.native.endpoint()).href !==
      new URL(this.manifest.baseUrl).href
    )
      throw new Error("Paperclip native endpoint is not manifest-bound");
    if (!this.native.verifySource(this.manifest.source))
      throw new Error("Paperclip source/tree/lock pin verification failed");
    const health = this.call("GET", "/api/health", undefined, "deploy:health");
    if (
      health.status !== 200 ||
      !record(health.body) ||
      health.body.status !== "ok" ||
      health.body.version !== this.manifest.source.releaseVersion ||
      !record(health.body.serverInfo) ||
      !record(health.body.serverInfo.git) ||
      health.body.serverInfo.git.fullSha !== this.manifest.source.commit
    )
      throw new Error("Paperclip native health is not ready");
    const existing = this.store.load(this.manifest.deploymentId);
    if (existing) {
      this.verify(existing);
      return existing;
    }
    const state = seal(
      {
        schema: "autonomy.paperclip-live-state.v1",
        deploymentId: this.manifest.deploymentId,
        sequence: 1,
        companyId: this.manifest.companyId,
        eventCursor: null,
        effects: {},
        issueByEffect: {},
      },
      this.trust,
    );
    if (
      !this.store.compareAndSwap(this.manifest.deploymentId, undefined, state)
    )
      throw new Error("concurrent Paperclip deployment state creation");
    return structuredClone(state);
  }

  createIssue(input: {
    effectId: string;
    title: string;
    description: string;
    assigneeAgentId?: string;
    parentId?: string;
    priority: "low" | "medium" | "high" | "critical";
  }) {
    this.current();
    const marker = `\n\n[open-autonomy-effect:${effectKey(this.manifest.deploymentId, input.effectId)}]`,
      body = {
        title: input.title,
        description: `${input.description}${marker}`,
        status: input.assigneeAgentId ? "todo" : "backlog",
        priority: input.priority,
        ...(input.assigneeAgentId
          ? { assigneeAgentId: input.assigneeAgentId }
          : {}),
        ...(input.parentId ? { parentId: input.parentId } : {}),
      },
      effect = this.intent(input.effectId, "issue-create", body);
    if (effect.status === "acknowledged") return this.issue(effect.nativeId!);
    const reconciled = this.findIssueByMarker(marker);
    const result =
      reconciled ??
      this.expectObject(
        this.call(
          "POST",
          `/api/companies/${encodeURIComponent(this.manifest.companyId)}/issues`,
          body,
          effect.id,
        ),
        201,
        "Paperclip issue create",
      );
    if (
      result.title !== input.title ||
      result.description !== body.description ||
      result.companyId !== this.manifest.companyId
    )
      throw new Error("Paperclip issue create post-state mismatch");
    this.ack(effect.id, required(result.id, "issue.id"));
    return structuredClone(result);
  }

  checkout(input: {
    effectId: string;
    issueId: string;
    agentId: string;
    runId: string;
    expectedStatuses: string[];
  }) {
    const effect = this.intent(input.effectId, "issue-checkout", input);
    if (effect.status === "acknowledged") return this.issue(input.issueId);
    const before = this.issue(input.issueId);
    if (
      before.checkoutRunId === input.runId &&
      before.assigneeAgentId === input.agentId &&
      before.status === "in_progress"
    ) {
      this.ack(effect.id, input.issueId);
      return before;
    }
    const result = this.expectObject(
      this.call(
        "POST",
        `/api/issues/${encodeURIComponent(input.issueId)}/checkout`,
        { agentId: input.agentId, expectedStatuses: input.expectedStatuses },
        effect.id,
        { "x-paperclip-run-id": input.runId },
        this.manifest.workerAuthBinding,
      ),
      200,
      "Paperclip issue checkout",
    );
    if (
      result.id !== input.issueId ||
      result.assigneeAgentId !== input.agentId ||
      result.checkoutRunId !== input.runId ||
      result.status !== "in_progress"
    )
      throw new Error("Paperclip checkout returned success without ownership");
    this.ack(effect.id, input.issueId);
    return result;
  }

  pauseAgent(effectId: string, agentId: string) {
    return this.agentMutation(
      effectId,
      "agent-pause",
      agentId,
      "pause",
      "paused",
    );
  }
  resumeAgent(effectId: string, agentId: string) {
    return this.agentMutation(
      effectId,
      "agent-resume",
      agentId,
      "resume",
      "active",
    );
  }
  wakeAgent(
    effectId: string,
    agentId: string,
    reason: string,
    issueId: string,
  ) {
    const nativeEffectId = effectKey(this.manifest.deploymentId, effectId),
      body = {
        source: "automation",
        triggerDetail: "system",
        reason,
        payload: { issueId },
        idempotencyKey: nativeEffectId,
      },
      effect = this.intent(effectId, "agent-wakeup", body);
    if (effect.status === "acknowledged") return effect.nativeId;
    const result = this.expectObject(
      this.call(
        "POST",
        `/api/agents/${encodeURIComponent(agentId)}/wakeup`,
        body,
        effect.id,
      ),
      202,
      "Paperclip wakeup",
    );
    // Paperclip's native heartbeat-run representation uses `id`; older API
    // clients sometimes projected that value as `runId`. Accept only one
    // unambiguous identifier and bind it into the effect receipt.
    const nativeId =
      typeof result.id === "string" && result.id
        ? result.id
        : typeof result.runId === "string" && result.runId
          ? result.runId
          : undefined;
    const run = required(nativeId, "wakeup.id");
    this.ack(effect.id, run);
    return run;
  }

  createApproval(input: {
    effectId: string;
    type:
      | "hire_agent"
      | "approve_ceo_strategy"
      | "budget_override_required"
      | "request_board_approval";
    requestedByAgentId?: string;
    payload: Record<string, unknown>;
    issueIds: string[];
  }) {
    const nativeEffectId = effectKey(
        this.manifest.deploymentId,
        input.effectId,
      ),
      marker = `open-autonomy:${nativeEffectId}`,
      body = {
        type: input.type,
        requestedByAgentId: input.requestedByAgentId ?? null,
        payload: { ...input.payload, _openAutonomyEffect: marker },
        issueIds: input.issueIds,
      },
      effect = this.intent(input.effectId, "approval-create", body);
    if (effect.status === "acknowledged") return effect.nativeId;
    const value =
      this.findApprovalByMarker(marker) ??
      this.expectObject(
        this.call(
          "POST",
          `/api/companies/${encodeURIComponent(this.manifest.companyId)}/approvals`,
          body,
          effect.id,
        ),
        201,
        "Paperclip approval create",
      );
    if (
      value.type !== input.type ||
      !record(value.payload) ||
      value.payload._openAutonomyEffect !== marker
    )
      throw new Error("Paperclip approval create post-state mismatch");
    const id = required(value.id, "approval.id");
    this.ack(effect.id, id);
    return id;
  }

  resolveApproval(input: {
    effectId: string;
    approvalId: string;
    decision: "approve" | "reject";
    decisionNote: string;
  }) {
    const body = { decisionNote: input.decisionNote },
      effect = this.intent(input.effectId, "approval-resolve", input);
    if (effect.status === "acknowledged") return effect.nativeId;
    const value = this.expectObject(
      this.call(
        "POST",
        `/api/approvals/${encodeURIComponent(input.approvalId)}/${input.decision}`,
        body,
        effect.id,
      ),
      200,
      `Paperclip approval ${input.decision}`,
    );
    const expectedStatus =
      input.decision === "approve" ? "approved" : "rejected";
    if (value.id !== input.approvalId || value.status !== expectedStatus)
      throw new Error("Paperclip approval resolution post-state mismatch");
    this.ack(effect.id, input.approvalId);
    return input.approvalId;
  }

  setCompanyBudget(effectId: string, budgetMonthlyCents: number) {
    safeCount(budgetMonthlyCents, "budgetMonthlyCents");
    const body = { budgetMonthlyCents },
      effect = this.intent(effectId, "budget-update", body);
    if (effect.status === "acknowledged") return budgetMonthlyCents;
    const value = this.expectObject(
      this.call(
        "PATCH",
        `/api/companies/${encodeURIComponent(this.manifest.companyId)}/budgets`,
        body,
        effect.id,
      ),
      200,
      "Paperclip company budget update",
    );
    if (
      value.id !== this.manifest.companyId ||
      value.budgetMonthlyCents !== budgetMonthlyCents
    )
      throw new Error("Paperclip budget update post-state mismatch");
    this.ack(effect.id, this.manifest.companyId);
    return budgetMonthlyCents;
  }

  budgetOverview() {
    const value = this.expectObject(
      this.call(
        "GET",
        `/api/companies/${encodeURIComponent(this.manifest.companyId)}/budgets/overview`,
        undefined,
        "budget:overview",
      ),
      200,
      "Paperclip budget overview",
    );
    if (
      value.companyId !== this.manifest.companyId ||
      !Array.isArray(value.policies)
    )
      throw new Error("Paperclip budget overview is malformed or cross-tenant");
    return structuredClone(value);
  }

  heartbeatRun(runId: string) {
    const value = this.expectObject(
      this.call(
        "GET",
        `/api/heartbeat-runs/${encodeURIComponent(runId)}`,
        undefined,
        `heartbeat:${runId}`,
      ),
      200,
      "Paperclip heartbeat run",
    );
    if (value.id !== runId || value.companyId !== this.manifest.companyId)
      throw new Error("Paperclip heartbeat run is malformed or cross-tenant");
    return structuredClone(value);
  }

  exportPortableBackup(): PaperclipPortableBackup {
    const value = this.expectObject(
      this.call(
        "POST",
        `/api/companies/${encodeURIComponent(this.manifest.companyId)}/export`,
        {
          include: {
            company: true,
            agents: true,
            projects: true,
            issues: true,
            skills: true,
          },
        },
        "backup:export",
      ),
      200,
      "Paperclip portable export",
    );
    const rootPath = required(value.rootPath, "backup.rootPath"),
      nativeManifest = requiredRecord(value.manifest, "backup.manifest"),
      files = requiredRecord(value.files, "backup.files");
    if (
      !record(nativeManifest.source) ||
      nativeManifest.source.companyId !== this.manifest.companyId ||
      Object.keys(files).length === 0 ||
      Object.keys(files).length > 10_000 ||
      Object.keys(files).some(unsafePortablePath)
    )
      throw new Error("Paperclip portable export is incomplete or misbound");
    const body = {
      schema: "autonomy.paperclip-portable-backup.v1" as const,
      sourceCompanyId: this.manifest.companyId,
      native: {
        rootPath,
        manifest: structuredClone(nativeManifest),
        files: structuredClone(files),
      },
    };
    const encoded = canonicalSemanticJson(body);
    if (Buffer.byteLength(encoded) > 64 * 1024 * 1024)
      throw new Error("Paperclip portable export exceeds backup bounds");
    return { ...body, digest: digest(body) };
  }

  restorePortableBackup(effectId: string, backup: PaperclipPortableBackup) {
    const { digest: observed, ...body } = backup;
    if (
      body.schema !== "autonomy.paperclip-portable-backup.v1" ||
      observed !== digest(body) ||
      body.sourceCompanyId !== this.manifest.companyId
    )
      throw new Error("Paperclip portable backup is invalid or misbound");
    const restoreName = `oa-restore-${effectKey(this.manifest.deploymentId, effectId).slice(-24)}`,
      effect = this.intent(effectId, "backup-restore", {
        backupDigest: observed,
        restoreName,
      });
    if (effect.status === "acknowledged") return effect.nativeId;
    const listed = this.call(
      "GET",
      "/api/companies",
      undefined,
      `restore:list:${effect.id}`,
    );
    if (listed.status !== 200 || !Array.isArray(listed.body))
      throw new Error("Paperclip restore reconciliation failed");
    const matches = listed.body.filter(
      (value) => record(value) && value.name === restoreName,
    );
    if (matches.length > 1)
      throw new Error("Paperclip restore identity is ambiguous");
    let company = matches[0] as Record<string, unknown> | undefined;
    if (!company) {
      const restored = this.expectObject(
        this.call(
          "POST",
          "/api/companies/import",
          {
            source: {
              type: "inline",
              rootPath: backup.native.rootPath,
              files: backup.native.files,
            },
            include: {
              company: true,
              agents: true,
              projects: true,
              issues: true,
              skills: true,
            },
            target: { mode: "new_company", newCompanyName: restoreName },
            agents: "all",
            collisionStrategy: "rename",
          },
          effect.id,
        ),
        200,
        "Paperclip portable restore",
      );
      company = requiredRecord(restored.company, "restore.company");
    }
    const restoredId = required(company.id, "restore.company.id");
    if (company.name !== restoreName)
      throw new Error("Paperclip portable restore post-state mismatch");
    this.ack(effect.id, restoredId);
    return restoredId;
  }

  liftTimeline(input: unknown): PaperclipTimelineLift {
    if (
      !record(input) ||
      !Array.isArray(input.spans) ||
      !Array.isArray(input.events)
    )
      throw new Error("Paperclip timeline is malformed");
    if (!record(input.pagination) || !record(input.window))
      throw new Error("Paperclip timeline bounds are missing");
    const observations: PortablePaperclipObservation[] = [];
    for (const value of input.spans) {
      if (!record(value))
        throw new Error("Paperclip timeline span is malformed");
      const usage = record(value.usage) ? value.usage : undefined;
      observations.push({
        kind: "attempt.observed",
        work: required(value.issueId, "timeline.span.issueId"),
        attempt: required(value.runId, "timeline.span.runId"),
        actor: requiredActorId(value.actorId),
        state: required(value.status, "timeline.span.status"),
        costCents:
          usage && Number.isSafeInteger(usage.costCents)
            ? safeCount(usage.costCents, "timeline.span.usage.costCents")
            : null,
        costEvidence:
          usage && Number.isSafeInteger(usage.costCents)
            ? "observed"
            : "missing",
      });
    }
    for (const value of input.events) {
      if (!record(value))
        throw new Error("Paperclip timeline event is malformed");
      observations.push({
        kind: "gap",
        nativeType: `timeline.${required(value.kind, "timeline.event.kind")}`,
        reason: "timeline event lacks a total portable work-state projection",
      });
    }
    const limit = safePositiveCount(
        input.pagination.limit,
        "timeline.pagination.limit",
      ),
      offset = safeCount(input.pagination.offset, "timeline.pagination.offset"),
      total = safeCount(
        input.pagination.totalIssues,
        "timeline.pagination.totalIssues",
      ),
      hasMore = input.pagination.hasMore;
    if (typeof hasMore !== "boolean" || hasMore !== offset + limit < total)
      throw new Error("Paperclip timeline pagination is inconsistent");
    return {
      observations,
      nextOffset: hasMore ? offset + limit : null,
      nativeWindow: {
        from: requiredInstant(input.window.from, "timeline.window.from"),
        to: requiredInstant(input.window.to, "timeline.window.to"),
        capped: requiredBoolean(input.window.capped, "timeline.window.capped"),
      },
    };
  }

  projectNativeEvent(value: unknown): PortablePaperclipObservation {
    if (!record(value)) throw new Error("Paperclip event must be an object");
    const type = required(value.type, "event.type");
    if (type === "issue.updated")
      return {
        kind: "work.observed",
        work: required(value.issueId, "event.issueId"),
        status: required(value.status, "event.status"),
        ...(typeof value.assigneeAgentId === "string"
          ? { assignee: value.assigneeAgentId }
          : {}),
        nativeRevision: required(value.revision, "event.revision"),
      };
    if (type === "heartbeat.run")
      return {
        kind: "attempt.observed",
        work: required(value.issueId, "event.issueId"),
        attempt: required(value.runId, "event.runId"),
        actor: required(value.agentId, "event.agentId"),
        state: required(value.status, "event.status"),
        costCents: safeCount(value.costCents, "event.costCents"),
        costEvidence: "observed",
      };
    if (type === "approval.updated")
      return {
        kind: "approval.observed",
        approval: required(value.approvalId, "event.approvalId"),
        state: required(value.status, "event.status"),
        work: stringArray(value.issueIds, "event.issueIds"),
      };
    return {
      kind: "gap",
      nativeType: type,
      reason: "unsupported Paperclip event",
    };
  }

  health() {
    const state = this.current(),
      native = this.call("GET", "/api/health", undefined, "health"),
      residuals = [
        ...this.manifest.assumptions.map((value) => ({
          kind: "assumption" as const,
          id: value.id,
          detail: value.consequence,
        })),
      ];
    return {
      healthy:
        native.status === 200 &&
        record(native.body) &&
        native.body.status === "ok",
      native: native.body,
      stateSequence: state.sequence,
      independentControl: this.manifest.controlProviderId !== "hermes",
      separateWorker:
        this.manifest.workerProviderId !== this.manifest.controlProviderId,
      separateInteraction:
        this.manifest.interactionProviderId !== this.manifest.controlProviderId,
      residuals,
    };
  }

  issue(id: string) {
    return this.expectObject(
      this.call(
        "GET",
        `/api/issues/${encodeURIComponent(id)}`,
        undefined,
        `issue:${id}`,
      ),
      200,
      "Paperclip issue read",
    );
  }
  private findIssueByMarker(marker: string) {
    const response = this.call(
      "GET",
      `/api/companies/${encodeURIComponent(this.manifest.companyId)}/issues`,
      undefined,
      `reconcile:${digest(marker)}`,
    );
    if (response.status !== 200 || !Array.isArray(response.body))
      throw new Error("Paperclip issue reconciliation query failed");
    const matches = response.body.filter(
      (value) =>
        record(value) &&
        typeof value.description === "string" &&
        (value.description === marker.trimStart() ||
          value.description.endsWith(marker)),
    );
    if (matches.length > 1)
      throw new Error("Paperclip idempotency marker is ambiguous");
    return matches[0] as Record<string, unknown> | undefined;
  }
  private agentMutation(
    effectId: string,
    kind: "agent-pause" | "agent-resume",
    agentId: string,
    operation: string,
    expectedStatus: string,
  ) {
    const effect = this.intent(effectId, kind, { agentId, operation });
    if (effect.status === "acknowledged") return effect.nativeId;
    const value = this.expectObject(
      this.call(
        "POST",
        `/api/agents/${encodeURIComponent(agentId)}/${operation}`,
        {},
        effect.id,
      ),
      200,
      `Paperclip agent ${operation}`,
    );
    if (value.status !== expectedStatus)
      throw new Error(`Paperclip agent ${operation} post-state mismatch`);
    this.ack(effect.id, agentId);
    return agentId;
  }
  private findApprovalByMarker(marker: string) {
    const response = this.call(
      "GET",
      `/api/companies/${encodeURIComponent(this.manifest.companyId)}/approvals`,
      undefined,
      `approval:reconcile:${digest(marker)}`,
    );
    if (response.status !== 200 || !Array.isArray(response.body))
      throw new Error("Paperclip approval reconciliation query failed");
    const matches = response.body.filter(
      (value) =>
        record(value) &&
        record(value.payload) &&
        value.payload._openAutonomyEffect === marker,
    );
    if (matches.length > 1)
      throw new Error("Paperclip approval idempotency marker is ambiguous");
    return matches[0] as Record<string, unknown> | undefined;
  }
  private intent(
    effectId: string,
    kind: PaperclipEffect["kind"],
    body: unknown,
  ) {
    if (!effectId) throw new Error("Paperclip effect id is required");
    const id = effectKey(this.manifest.deploymentId, effectId),
      requestDigest = digest({ kind, body });
    const existing = this.current().effects[id];
    if (existing) {
      if (existing.requestDigest !== requestDigest || existing.kind !== kind)
        throw new Error("Paperclip effect id equivocation");
      return structuredClone(existing);
    }
    let result!: PaperclipEffect;
    this.mutate((state) => {
      const prior = state.effects[id];
      if (prior && prior.requestDigest !== requestDigest)
        throw new Error("Paperclip effect id equivocation");
      state.effects[id] ??= { id, requestDigest, kind, status: "pending" };
      result = structuredClone(state.effects[id]!);
    });
    return result;
  }
  private ack(id: string, nativeId: string) {
    this.mutate((state) => {
      const effect = state.effects[id];
      if (!effect) throw new Error("Paperclip effect intent is missing");
      if (effect.nativeId && effect.nativeId !== nativeId)
        throw new Error("Paperclip effect acknowledgement equivocation");
      effect.status = "acknowledged";
      effect.nativeId = nativeId;
      if (effect.kind === "issue-create") state.issueByEffect[id] = nativeId;
    });
  }
  private call(
    method: PaperclipHttpRequest["method"],
    path: string,
    body: unknown,
    requestId: string,
    headers: Record<string, string> = {},
    authBinding = this.manifest.controlAuthBinding,
  ) {
    return this.native.request({
      method,
      path,
      authBinding,
      ...(body === undefined ? {} : { body }),
      requestId,
      ...(Object.keys(headers).length === 0 ? {} : { headers }),
    });
  }
  private expectObject(
    result: PaperclipHttpResult,
    status: number,
    operation: string,
  ) {
    if (result.status !== status || !record(result.body))
      throw new Error(`${operation} failed or returned malformed native state`);
    return result.body;
  }
  private current() {
    const state = this.store.load(this.manifest.deploymentId);
    if (!state) throw new Error("Paperclip deployment state is absent");
    this.verify(state);
    return state;
  }
  private mutate(change: (state: PaperclipProviderState) => void) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = this.current(),
        next = structuredClone(current);
      change(next);
      next.sequence++;
      const sealed = seal(stripSeal(next), this.trust);
      if (
        this.store.compareAndSwap(
          this.manifest.deploymentId,
          current.sequence,
          sealed,
        )
      )
        return;
    }
    throw new Error("Paperclip provider state CAS contention");
  }
  private verify(state: PaperclipProviderState) {
    const { digest: observed, signature, ...body } = state;
    if (
      observed !== digest(body) ||
      !this.trust.verifyState(observed, signature) ||
      state.deploymentId !== this.manifest.deploymentId ||
      state.companyId !== this.manifest.companyId
    )
      throw new Error("Paperclip provider state is invalid or misbound");
  }
}

export function paperclipManifestDigest(
  value: Omit<PaperclipManifest, "manifestDigest">,
) {
  return digest(value);
}
function validateManifest(value: PaperclipManifest) {
  const { manifestDigest, ...body } = value;
  let trustedBaseUrl = false;
  try {
    const base = new URL(value.baseUrl);
    trustedBaseUrl =
      base.username === "" &&
      base.password === "" &&
      base.pathname === "/" &&
      base.search === "" &&
      base.hash === "" &&
      (base.protocol === "https:" ||
        (base.protocol === "http:" &&
          (base.hostname === "127.0.0.1" || base.hostname === "[::1]")));
  } catch {
    trustedBaseUrl = false;
  }
  if (
    value.schema !== "autonomy.paperclip-live-provider.v1" ||
    manifestDigest !== paperclipManifestDigest(body) ||
    !trustedBaseUrl ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(
      value.source.releaseVersion,
    ) ||
    !/^[a-f0-9]{40}$/.test(value.source.commit) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.source.treeDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.source.lockDigest) ||
    !value.controlAuthBinding ||
    !value.workerAuthBinding ||
    value.controlAuthBinding === value.workerAuthBinding ||
    new Set([
      value.controlProviderId,
      value.workerProviderId,
      value.interactionProviderId,
    ]).size !== 3
  )
    throw new Error("Paperclip manifest is malformed, unpinned, or coupled");
}
function seal(
  value: Omit<PaperclipProviderState, "digest" | "signature">,
  trust: PaperclipProviderTrust,
): PaperclipProviderState {
  const stateDigest = digest(value);
  return {
    ...value,
    digest: stateDigest,
    signature: trust.signState(stateDigest),
  };
}
function stripSeal(value: PaperclipProviderState) {
  const { digest: _, signature: __, ...body } = value;
  return body;
}
function effectKey(deploymentId: string, effectId: string) {
  return `effect:${digest([deploymentId, effectId]).slice(7)}`;
}
function digest(value: unknown) {
  return `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function required(value: unknown, path: string) {
  if (typeof value !== "string" || !value)
    throw new Error(`${path} is invalid`);
  return value;
}
function safeCount(value: unknown, path: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error(`${path} is invalid`);
  return value as number;
}
function safePositiveCount(value: unknown, path: string) {
  const count = safeCount(value, path);
  if (count === 0) throw new Error(`${path} is invalid`);
  return count;
}
function requiredBoolean(value: unknown, path: string) {
  if (typeof value !== "boolean") throw new Error(`${path} is invalid`);
  return value;
}
function requiredInstant(value: unknown, path: string) {
  const instant = required(value, path);
  if (!Number.isFinite(Date.parse(instant)))
    throw new Error(`${path} is invalid`);
  return instant;
}
function requiredActorId(value: unknown) {
  const actor = required(value, "timeline.span.actorId"),
    separator = actor.indexOf(":");
  if (separator <= 0 || separator === actor.length - 1)
    throw new Error("timeline.span.actorId is invalid");
  return actor.slice(separator + 1);
}
function stringArray(value: unknown, path: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`${path} is invalid`);
  return [...value] as string[];
}
function requiredRecord(value: unknown, path: string) {
  if (!record(value)) throw new Error(`${path} is invalid`);
  return value;
}
function unsafePortablePath(path: string) {
  return (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}
