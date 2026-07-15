import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";

export type HermesVersionPin = {
  release: string;
  upstreamRevision: string;
  localRevision: string;
  executableDigest: string;
};

export type HermesDeploymentBundle = {
  schema: "autonomy.hermes-live-deployment.v1";
  deploymentId: string;
  tenant: string;
  board: string;
  home: string;
  defaultWorkdir: string;
  pin: HermesVersionPin;
  configurationDigest: string;
  bundleDigest: string;
  manifest?: HermesProviderManifest;
};
export type HermesProviderManifest = {
  schema: "autonomy.hermes-provider-manifest.v1";
  configuration: Record<string, unknown>;
  implementation: Array<{ path: string; digest: string }>;
  workers: Array<{
    assignee: string;
    r11Runtime: string;
    profileDigest: string;
  }>;
  slack?: {
    gatewayProfile: string;
    channelAllowlist: string[];
    credentialRef: string;
  };
  hiddenState: Array<{
    path: string;
    kind: "durable" | "ephemeral" | "secret";
    includedInBackup: boolean;
  }>;
};
export type HermesResidual = {
  code:
    | "manifest-absent"
    | "durable-store-unproven"
    | "slack-unconfigured"
    | "worker-unconfigured"
    | "event-lift-unconfigured";
  explanation: string;
};
export type HermesSlackEnvelope = {
  eventId: string;
  channel: string;
  thread: string;
  user: string;
  at: string;
  text: string;
  kind?: "message" | "decision";
  workId?: string;
  decision?: "approve" | "reject";
  signature: string;
};
export interface HermesSlackGatewayPort {
  verify(value: HermesSlackEnvelope): boolean;
  send(value: {
    deliveryId: string;
    channel: string;
    thread: string;
    text: string;
  }): { externalId: string };
  health(): boolean;
}
export interface HermesR11WorkerPort {
  launch(value: {
    launchId: string;
    workId: string;
    assignee: string;
    fence: number;
    tenant: string;
  }): { executionId: string; sessionId: string };
  health(): boolean;
}
export type HermesNativeEvent = {
  cursor: number;
  id: string;
  kind: string;
  taskId: string;
  at: string;
  actor: string;
  payload: Record<string, unknown>;
  digest: string;
  signature: string;
};
export interface HermesEventPort {
  read(after: number): HermesNativeEvent[];
  verify(value: HermesNativeEvent): boolean;
  health(): boolean;
}
export type HermesPortableEvent = {
  id: string;
  type:
    | "work.created"
    | "work.transitioned"
    | "attempt.status"
    | "comment.recorded";
  subject: string;
  at: string;
  actor: string;
  nativeCursor: number;
  payload: Record<string, unknown>;
};

export type HermesNativeResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export interface HermesNativePort {
  invoke(
    argv: string[],
    environment: Record<string, string>,
  ): HermesNativeResult;
  executableDigest(): string;
  createBackup(
    output: string,
    environment: Record<string, string>,
  ): HermesNativeResult;
  restoreBackup(
    input: string,
    environment: Record<string, string>,
  ): HermesNativeResult;
  applyUpgrade(
    target: HermesVersionPin,
    environment: Record<string, string>,
  ): HermesNativeResult;
  rollbackVersion(
    prior: HermesVersionPin,
    environment: Record<string, string>,
  ): HermesNativeResult;
  artifactDigest(path: string): string;
}

export class ProcessHermesNativePort implements HermesNativePort {
  constructor(
    private readonly executable: string,
    private readonly digestExecutable: () => string,
    private readonly digestArtifact: (path: string) => string,
    private readonly upgradeInstallation?: (
      target: HermesVersionPin,
      environment: Record<string, string>,
    ) => HermesNativeResult,
    private readonly rollbackInstallation?: (
      prior: HermesVersionPin,
      environment: Record<string, string>,
    ) => HermesNativeResult,
  ) {}
  invoke(argv: string[], environment: Record<string, string>) {
    return this.run(argv, environment);
  }
  executableDigest() {
    return this.digestExecutable();
  }
  createBackup(output: string, environment: Record<string, string>) {
    return this.run(["backup", "--output", output], environment);
  }
  restoreBackup(input: string, environment: Record<string, string>) {
    return this.run(["import", "--force", input], environment);
  }
  applyUpgrade(target: HermesVersionPin, environment: Record<string, string>) {
    return this.upgradeInstallation
      ? this.upgradeInstallation(target, environment)
      : {
          code: 1,
          stdout: "",
          stderr: "no pinned Hermes installation upgrader configured",
        };
  }
  rollbackVersion(
    prior: HermesVersionPin,
    environment: Record<string, string>,
  ) {
    return this.rollbackInstallation
      ? this.rollbackInstallation(prior, environment)
      : {
          code: 1,
          stdout: "",
          stderr: "no pinned Hermes installation rollback configured",
        };
  }
  artifactDigest(path: string) {
    return this.digestArtifact(path);
  }
  private run(argv: string[], environment: Record<string, string>) {
    if (argv.some((value) => value.includes("\0")))
      throw new Error("Hermes argument contains NUL");
    const result = spawnSync(this.executable, argv, {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 120_000,
      windowsHide: true,
      env: environment,
    });
    return {
      code: result.status ?? -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? String(result.error ?? ""),
    };
  }
}

export type HermesBoardObservation = {
  slug: string;
  name: string;
  description: string;
  dbPath: string;
  archived: boolean;
  counts: Record<string, number>;
  total: number;
};

export type HermesTaskObservation = {
  id: string;
  title: string;
  body: string;
  assignee: string | null;
  status: string;
  tenant: string | null;
  createdAt: number;
  result: string | null;
};

export type HermesProviderSnapshot = {
  schema: "autonomy.hermes-live-provider-state.v1";
  deploymentId: string;
  board: string;
  sequence: number;
  paused: boolean;
  version: HermesVersionPin;
  workReceipts: Record<string, { requestDigest: string; nativeId: string }>;
  backup?: { path: string; digest: string; sequence: number };
  transition?: {
    kind: "upgrade" | "rollback" | "restore" | "teardown";
    phase: "prepared" | "native-applied" | "verified" | "failed";
    target?: HermesVersionPin;
    error?: string;
  };
  dispatcher?: { owner: string; fence: number; expiresAt: string };
  dispatcherFence?: number;
  outbox?: Array<{
    id: string;
    kind: string;
    requestDigest: string;
    status: "pending" | "acknowledged";
    externalId?: string;
  }>;
  slackCorrelations?: Record<
    string,
    {
      channel: string;
      thread: string;
      workId?: string;
      kind?: "message" | "decision";
      decision?: "approve" | "reject";
    }
  >;
  slackReceipts?: Record<string, string>;
  workerReceipts?: Record<
    string,
    {
      launchId: string;
      assignee: string;
      fence: number;
      executionId: string;
      sessionId: string;
    }
  >;
  slackSeen?: string[];
  eventCursor?: number;
  portableEvents?: HermesPortableEvent[];
  eventGaps?: Array<{ cursor: number; kind: string }>;
  digest: string;
  signature: string;
};

export interface HermesProviderTrust {
  signState(digest: string): string;
  verifyState(digest: string, signature: string): boolean;
  verifyBackup(path: string, digest: string, board: string): boolean;
}

export interface HermesProviderStateStore {
  load(deploymentId: string): HermesProviderSnapshot | undefined;
  compareAndSwap(
    deploymentId: string,
    expectedSequence: number | undefined,
    next: HermesProviderSnapshot,
  ): boolean;
  delete(deploymentId: string, expectedSequence: number): boolean;
}

export class MemoryHermesProviderStateStore implements HermesProviderStateStore {
  private readonly states = new Map<string, HermesProviderSnapshot>();
  load(id: string) {
    const value = this.states.get(id);
    return value && structuredClone(value);
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: HermesProviderSnapshot,
  ) {
    if (this.states.get(id)?.sequence !== expected) return false;
    this.states.set(id, structuredClone(next));
    return true;
  }
  delete(id: string, expected: number) {
    if (this.states.get(id)?.sequence !== expected) return false;
    return this.states.delete(id);
  }
}
export class DiskHermesProviderStateStore implements HermesProviderStateStore {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }
  load(id: string) {
    const p = this.path(id);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf8")) as HermesProviderSnapshot;
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    next: HermesProviderSnapshot,
  ) {
    return this.lock(id, () => {
      if (this.load(id)?.sequence !== expected) return false;
      this.atomic(this.path(id), next);
      return true;
    });
  }
  delete(id: string, expected: number) {
    return this.lock(id, () => {
      if (this.load(id)?.sequence !== expected) return false;
      rmSync(this.path(id));
      return true;
    });
  }
  private path(id: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("unsafe deployment id");
    return join(this.directory, `${id}.json`);
  }
  private lock<T>(id: string, fn: () => T): T {
    const p = `${this.path(id)}.lock`;
    let fd: number | undefined;
    for (let i = 0; i < 100; i++)
      try {
        fd = openSync(p, "wx");
        writeFileSync(fd, String(process.pid));
        fsyncSync(fd);
        break;
      } catch {
        try {
          const pid = Number(readFileSync(p, "utf8"));
          process.kill(pid, 0);
        } catch {
          rmSync(p, { force: true });
        }
        if (i === 99) throw new Error("durable state lock contention");
      }
    try {
      return fn();
    } finally {
      if (fd !== undefined) closeSync(fd);
      rmSync(p, { force: true });
    }
  }
  private atomic(path: string, value: unknown) {
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`,
      fd = openSync(tmp, "wx");
    try {
      writeFileSync(fd, canonicalSemanticJson(value));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
    const dir = openSync(this.directory, "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  }
}

export class HermesLiveProvider {
  private readonly environment: Record<string, string>;
  constructor(
    private readonly bundle: HermesDeploymentBundle,
    private readonly native: HermesNativePort,
    private readonly trust: HermesProviderTrust,
    private readonly store: HermesProviderStateStore,
    baseEnvironment: Record<string, string> = {},
    private readonly owner = `provider:${process.pid}`,
    private readonly integrations: {
      slack?: HermesSlackGatewayPort;
      worker?: HermesR11WorkerPort;
      events?: HermesEventPort;
    } = {},
  ) {
    validateBundle(bundle);
    this.environment = {
      PATH: baseEnvironment.PATH ?? "",
      HOME: baseEnvironment.HOME ?? bundle.home,
      HERMES_HOME: bundle.home,
      HERMES_KANBAN_BOARD: bundle.board,
      HERMES_KANBAN_DISPATCH_IN_GATEWAY: "0",
      NO_COLOR: "1",
    };
  }

  discover(
    expected = this.store.load(this.bundle.deploymentId)?.version ??
      this.bundle.pin,
  ) {
    if (this.native.executableDigest() !== expected.executableDigest)
      throw new Error("Hermes executable digest differs from deployment pin");
    for (const artifact of this.bundle.manifest?.implementation ?? [])
      if (this.native.artifactDigest(artifact.path) !== artifact.digest)
        throw new Error(
          `Hermes implementation artifact differs from manifest: ${artifact.path}`,
        );
    const observed = this.checked(["--version"]),
      version = parseVersion(observed.stdout, this.native.executableDigest());
    if (
      version.release !== expected.release ||
      version.localRevision !== expected.localRevision ||
      version.executableDigest !== expected.executableDigest
    )
      throw new Error("Hermes observed version differs from deployment pin");
    return structuredClone(expected);
  }

  deploy() {
    const version = this.discover(),
      prior = this.store.load(this.bundle.deploymentId);
    if (prior) {
      this.verifySnapshot(prior);
      if (prior.board !== this.bundle.board)
        throw new Error("deployment id is already bound to another board");
      this.requireBoard();
      return prior;
    }
    if (!this.boards().some((value) => value.slug === this.bundle.board)) {
      this.checked([
        "kanban",
        "boards",
        "create",
        this.bundle.board,
        "--name",
        this.bundle.deploymentId,
        "--description",
        `Open Autonomy deployment ${this.bundle.bundleDigest}`,
        "--default-workdir",
        this.bundle.defaultWorkdir,
      ]);
    }
    this.requireBoard();
    this.checked(["kanban", "init"]);
    const state = this.seal({
      schema: "autonomy.hermes-live-provider-state.v1",
      deploymentId: this.bundle.deploymentId,
      board: this.bundle.board,
      sequence: 1,
      paused: false,
      version,
      outbox: [],
      slackCorrelations: {},
      slackReceipts: {},
      workerReceipts: {},
      slackSeen: [],
      dispatcherFence: 0,
      eventCursor: 0,
      portableEvents: [],
      eventGaps: [],
      workReceipts: {},
    });
    if (!this.store.compareAndSwap(this.bundle.deploymentId, undefined, state))
      throw new Error("concurrent Hermes deployment state creation");
    return structuredClone(state);
  }

  createWork(input: {
    idempotencyKey: string;
    title: string;
    body: string;
    assignee: string;
    maxRuntime: string;
    maxRetries: number;
  }) {
    const state = this.current();
    if (!input.idempotencyKey || !input.title || !input.assignee)
      throw new Error("Hermes work request is incomplete");
    if (!Number.isSafeInteger(input.maxRetries) || input.maxRetries < 1)
      throw new Error("Hermes retry bound must be a positive integer");
    const requestDigest = digest({
        deploymentId: this.bundle.deploymentId,
        tenant: this.bundle.tenant,
        ...input,
      }),
      prior = state.workReceipts[input.idempotencyKey];
    if (prior) {
      if (prior.requestDigest !== requestDigest)
        throw new Error("Hermes work idempotency key equivocation");
      return this.task(prior.nativeId);
    }
    const result = this.checked([
      "kanban",
      "create",
      input.title,
      "--body",
      input.body,
      "--assignee",
      input.assignee,
      "--tenant",
      this.bundle.tenant,
      "--idempotency-key",
      input.idempotencyKey,
      "--max-runtime",
      input.maxRuntime,
      "--max-retries",
      String(input.maxRetries),
      "--json",
    ]);
    const reported = parseTask(result.stdout),
      observed = this.task(reported.id);
    if (
      observed.id !== reported.id ||
      observed.title !== input.title ||
      observed.body !== input.body ||
      observed.tenant !== this.bundle.tenant ||
      observed.assignee !== input.assignee
    )
      throw new Error(
        "Hermes CLI reported success without the required mutation",
      );
    this.mutate((next) => {
      const existing = next.workReceipts[input.idempotencyKey];
      if (
        existing &&
        (existing.requestDigest !== requestDigest ||
          existing.nativeId !== observed.id)
      )
        throw new Error("concurrent Hermes work idempotency equivocation");
      next.workReceipts[input.idempotencyKey] = {
        requestDigest,
        nativeId: observed.id,
      };
    });
    return observed;
  }

  pause() {
    return this.mutate((state) => {
      state.paused = true;
    });
  }
  resume() {
    return this.mutate((state) => {
      state.paused = false;
    });
  }
  dispatchOnce() {
    const state = this.current();
    if (state.paused) throw new Error("Hermes deployment is paused");
    const lease = this.acquireDispatcherLease();
    try {
      const before = this.tasks(),
        result = this.checked(["kanban", "dispatch", "--json"]),
        reported = this.json(result.stdout),
        after = this.tasks();
      if (!record(reported) || !Array.isArray(reported.spawned))
        throw new Error("Hermes dispatch response is malformed");
      if (
        reported.spawned.length > 0 &&
        canonicalSemanticJson(before) === canonicalSemanticJson(after)
      )
        throw new Error(
          "Hermes dispatch reported success without observed mutation",
        );
      return { before, after, stdout: result.stdout, fence: lease.fence };
    } finally {
      this.releaseDispatcherLease(lease.fence);
    }
  }
  handleSlack(envelope: HermesSlackEnvelope) {
    const slack = this.integrations.slack;
    if (
      !slack ||
      !slack.verify(envelope) ||
      !this.bundle.manifest?.slack?.channelAllowlist.includes(envelope.channel)
    )
      throw new Error("Slack envelope unauthenticated or outside manifest");
    timeValue(envelope.at);
    const kind = envelope.kind ?? "message",
      receipt = digest(envelope),
      state = this.current(),
      prior = state.slackReceipts?.[envelope.eventId],
      key = `${envelope.channel}:${envelope.thread}`;
    if (prior) {
      if (prior !== receipt) throw new Error("Slack event id equivocation");
      return state.slackCorrelations?.[key];
    }
    if (kind === "decision") {
      if (!envelope.workId || !envelope.decision)
        throw new Error("typed Slack decision requires work and value");
      if (this.task(envelope.workId).tenant !== this.bundle.tenant)
        throw new Error("Slack decision work is absent or tenant-mismatched");
    }
    const correlated = state.slackCorrelations?.[key];
    if (
      correlated?.workId &&
      envelope.workId &&
      correlated.workId !== envelope.workId
    )
      throw new Error("Slack thread work correlation equivocation");
    return this.mutate((s) => {
      s.slackSeen = [...(s.slackSeen ?? []), envelope.eventId];
      s.slackReceipts = {
        ...(s.slackReceipts ?? {}),
        [envelope.eventId]: receipt,
      };
      s.slackCorrelations = {
        ...(s.slackCorrelations ?? {}),
        [key]: {
          channel: envelope.channel,
          thread: envelope.thread,
          kind,
          ...(envelope.workId ? { workId: envelope.workId } : {}),
          ...(envelope.decision ? { decision: envelope.decision } : {}),
        },
      };
    });
  }
  sendSlack(input: {
    deliveryId: string;
    channel: string;
    thread: string;
    text: string;
  }) {
    const slack = this.integrations.slack;
    if (!slack || !slack.health()) throw new Error("Slack gateway unavailable");
    if (
      !this.bundle.manifest?.slack?.channelAllowlist.includes(input.channel) ||
      !input.thread ||
      !input.text
    )
      throw new Error("Slack delivery outside typed manifest scope");
    const requestDigest = digest(input),
      existing = this.current().outbox?.find((x) => x.id === input.deliveryId);
    if (existing && existing.requestDigest !== requestDigest)
      throw new Error("Slack delivery id equivocation");
    if (existing?.status === "acknowledged") return existing;
    this.mutate((s) => {
      if (!s.outbox?.some((x) => x.id === input.deliveryId))
        s.outbox?.push({
          id: input.deliveryId,
          kind: "slack",
          requestDigest,
          status: "pending",
        });
    });
    const sent = slack.send(input);
    return this.mutate((s) => {
      const item = s.outbox!.find((x) => x.id === input.deliveryId)!;
      if (item.requestDigest !== requestDigest)
        throw new Error("Slack outbox changed before acknowledgement");
      item.status = "acknowledged";
      item.externalId = sent.externalId;
    }).outbox!.find((x) => x.id === input.deliveryId)!;
  }
  launchR11(workId: string, assignee: string) {
    const worker = this.integrations.worker,
      declared = this.bundle.manifest?.workers.find(
        (x) => x.assignee === assignee,
      );
    if (!worker || !worker.health() || !declared)
      throw new Error("R11 worker binding unavailable");
    const prior = this.current().workerReceipts?.[workId];
    if (prior) {
      if (prior.assignee !== assignee)
        throw new Error("R11 work launch equivocation");
      return structuredClone(prior);
    }
    const lease = this.acquireDispatcherLease(),
      launchId = digest({
        deploymentId: this.bundle.deploymentId,
        workId,
        assignee,
      });
    try {
      const launched = worker.launch({
        launchId,
        workId,
        assignee,
        fence: lease.fence,
        tenant: this.bundle.tenant,
      });
      return this.mutate((s) => {
        const existing = s.workerReceipts?.[workId];
        if (
          existing &&
          (existing.launchId !== launchId ||
            existing.executionId !== launched.executionId)
        )
          throw new Error("concurrent R11 launch equivocation");
        s.workerReceipts = {
          ...(s.workerReceipts ?? {}),
          [workId]: { launchId, assignee, fence: lease.fence, ...launched },
        };
      }).workerReceipts![workId]!;
    } finally {
      this.releaseDispatcherLease(lease.fence);
    }
  }
  acceptR11Completion(input: {
    workId: string;
    executionId: string;
    fence: number;
  }) {
    const receipt = this.current().workerReceipts?.[input.workId];
    if (
      !receipt ||
      receipt.executionId !== input.executionId ||
      receipt.fence !== input.fence
    )
      throw new Error("stale or unknown R11 completion");
    return structuredClone(receipt);
  }
  liftEvents() {
    const source = this.integrations.events;
    if (!source || !source.health())
      throw new Error("Hermes event source unavailable");
    const start = this.current().eventCursor ?? 0,
      events = source.read(start).sort((a, b) => a.cursor - b.cursor);
    return this.mutate((s) => {
      let cursor = s.eventCursor ?? 0;
      for (const event of events) {
        timeValue(event.at);
        if (
          !Number.isSafeInteger(event.cursor) ||
          event.cursor !== cursor + 1 ||
          !record(event.payload) ||
          !source.verify(event) ||
          event.digest !==
            digest({
              cursor: event.cursor,
              id: event.id,
              kind: event.kind,
              taskId: event.taskId,
              at: event.at,
              actor: event.actor,
              payload: event.payload,
            })
        )
          throw new Error("Hermes event cursor, digest, or signature invalid");
        const types: Record<string, HermesPortableEvent["type"]> = {
            created: "work.created",
            transitioned: "work.transitioned",
            run: "attempt.status",
            comment: "comment.recorded",
          },
          type = types[event.kind];
        if (type)
          s.portableEvents!.push({
            id: event.id,
            type,
            subject: event.taskId,
            at: event.at,
            actor: event.actor,
            nativeCursor: event.cursor,
            payload: structuredClone(event.payload),
          });
        else s.eventGaps!.push({ cursor: event.cursor, kind: event.kind });
        cursor = event.cursor;
      }
      s.eventCursor = cursor;
    }).portableEvents;
  }

  health() {
    const state = this.current(),
      version = this.discover(),
      board = this.requireBoard(),
      stats = this.json(this.checked(["kanban", "stats", "--json"]).stdout);
    const residuals = this.residuals(),
      compatibilityFailures: Array<{ code: string; explanation: string }> = [];
    return {
      healthy: residuals.length === 0 && compatibilityFailures.length === 0,
      paused: state.paused,
      version,
      board,
      stats,
      components: {
        installation: true,
        board: true,
        controlStore: this.store instanceof DiskHermesProviderStateStore,
        workers: Boolean(
          this.bundle.manifest?.workers.length &&
          this.integrations.worker?.health(),
        ),
        slack: Boolean(
          this.bundle.manifest?.slack && this.integrations.slack?.health(),
        ),
        eventLift: Boolean(this.integrations.events?.health()),
      },
      residuals,
      compatibilityFailures,
    };
  }

  backup(path: string) {
    const state = this.current(),
      result = this.native.createBackup(path, this.environment);
    if (result.code !== 0)
      throw new Error(`Hermes backup failed: ${result.stderr}`);
    const artifactDigest = this.native.artifactDigest(path);
    if (!this.trust.verifyBackup(path, artifactDigest, this.bundle.board))
      throw new Error(
        "Hermes backup does not prove inclusion of the deployed board",
      );
    return this.mutate((next) => {
      next.backup = { path, digest: artifactDigest, sequence: state.sequence };
    });
  }

  restore() {
    const state = this.current(),
      backup = state.backup;
    if (
      !backup ||
      !this.trust.verifyBackup(backup.path, backup.digest, state.board)
    )
      throw new Error("no verified Hermes backup is available");
    if (this.native.artifactDigest(backup.path) !== backup.digest)
      throw new Error("Hermes backup artifact changed after verification");
    this.mutate((s) => {
      s.transition = { kind: "restore", phase: "prepared" };
    });
    const result = this.native.restoreBackup(backup.path, this.environment);
    if (result.code !== 0)
      throw new Error(`Hermes restore failed: ${result.stderr}`);
    this.requireBoard();
    const tasks = this.tasks();
    this.mutate((s) => {
      s.transition = { kind: "restore", phase: "verified" };
    });
    return tasks;
  }

  upgrade(target: HermesVersionPin, backupPath: string) {
    const before = this.current();
    if (!/^sha256:[a-f0-9]{64}$/.test(target.executableDigest))
      throw new Error("Hermes upgrade target is not digest pinned");
    this.backup(backupPath);
    this.mutate((s) => {
      s.transition = {
        kind: "upgrade",
        phase: "prepared",
        target: structuredClone(target),
      };
    });
    const result = this.native.applyUpgrade(target, this.environment);
    try {
      if (result.code !== 0)
        throw new Error(`Hermes update command failed: ${result.stderr}`);
      const observed = parseVersion(
        this.native.invoke(["--version"], this.environment).stdout,
        this.native.executableDigest(),
      );
      if (canonicalSemanticJson(observed) !== canonicalSemanticJson(target))
        throw new Error("Hermes update did not produce the pinned target");
      this.requireBoard();
      return this.mutate((state) => {
        state.version = structuredClone(target);
        state.transition = {
          kind: "upgrade",
          phase: "verified",
          target: structuredClone(target),
        };
      });
    } catch (error) {
      const checkpoint = this.current().backup;
      if (!checkpoint) throw error;
      const rollback = this.native.rollbackVersion(
        before.version,
        this.environment,
      );
      if (rollback.code !== 0)
        throw new Error(
          `Hermes upgrade failed and rollback failed: ${rollback.stderr}`,
          { cause: error },
        );
      const restored = parseVersion(
        this.native.invoke(["--version"], this.environment).stdout,
        this.native.executableDigest(),
      );
      if (
        canonicalSemanticJson(restored) !==
        canonicalSemanticJson(before.version)
      )
        throw new Error("Hermes rollback did not restore the prior version", {
          cause: error,
        });
      if (this.native.artifactDigest(checkpoint.path) !== checkpoint.digest)
        throw new Error("Hermes rollback backup changed before restore", {
          cause: error,
        });
      const restore = this.native.restoreBackup(
        checkpoint.path,
        this.environment,
      );
      if (restore.code !== 0)
        throw new Error(
          `Hermes executable rollback succeeded but state restore failed: ${restore.stderr}`,
          { cause: error },
        );
      this.requireBoard();
      this.mutate((s) => {
        s.transition = { kind: "rollback", phase: "verified" };
        s.version = structuredClone(before.version);
      });
      throw error;
    }
  }

  teardown() {
    if (this.current().transition?.kind !== "teardown")
      this.mutate((state) => {
        state.transition = { kind: "teardown", phase: "prepared" };
      });
    if (this.boards().some((value) => value.slug === this.bundle.board))
      this.checked(["kanban", "boards", "rm", "--delete", this.bundle.board]);
    if (this.boards().some((value) => value.slug === this.bundle.board))
      throw new Error(
        "Hermes teardown returned success without removing the board",
      );
    const state = this.current();
    if (!this.store.delete(this.bundle.deploymentId, state.sequence))
      throw new Error("concurrent Hermes teardown state change");
  }

  tasks() {
    return this.parseTasks(this.checked(["kanban", "list", "--json"]).stdout);
  }
  task(id: string) {
    const value = this.json(
      this.checked(["kanban", "show", id, "--json"]).stdout,
    );
    if (!record(value) || !record(value.task))
      throw new Error("Hermes show response is malformed");
    return parseTask(canonicalSemanticJson(value.task));
  }
  boards() {
    const value = this.json(
      this.checked(["kanban", "boards", "list", "--json"]).stdout,
    );
    if (!Array.isArray(value))
      throw new Error("Hermes board list is malformed");
    return value.map(parseBoard);
  }

  private requireBoard() {
    const values = this.boards().filter(
      (value) => value.slug === this.bundle.board,
    );
    if (values.length !== 1 || values[0]!.archived)
      throw new Error("Hermes deployed board is absent or ambiguous");
    return values[0]!;
  }
  private parseTasks(text: string) {
    const value = this.json(text);
    if (!Array.isArray(value)) throw new Error("Hermes task list is malformed");
    return value.map((item) => parseTask(canonicalSemanticJson(item)));
  }
  private checked(argv: string[]) {
    const result = this.native.invoke(argv, this.environment);
    if (result.code !== 0)
      throw new Error(
        `Hermes command failed (${argv.join(" ")}): ${result.stderr}`,
      );
    return result;
  }
  private json(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Hermes returned malformed JSON");
    }
  }
  private current() {
    const state = this.store.load(this.bundle.deploymentId);
    if (!state) throw new Error("Hermes deployment is absent");
    this.verifySnapshot(state);
    return state;
  }
  private acquireDispatcherLease() {
    const now = Date.now(),
      expiresAt = new Date(now + 30_000).toISOString();
    return this.mutate((s) => {
      if (
        s.dispatcher &&
        Date.parse(s.dispatcher.expiresAt) > now &&
        s.dispatcher.owner !== this.owner
      )
        throw new Error("Hermes dispatcher lease held by another owner");
      s.dispatcherFence = (s.dispatcherFence ?? 0) + 1;
      s.dispatcher = { owner: this.owner, fence: s.dispatcherFence, expiresAt };
    }).dispatcher!;
  }
  private releaseDispatcherLease(fence: number) {
    this.mutate((s) => {
      if (s.dispatcher?.owner !== this.owner || s.dispatcher.fence !== fence)
        throw new Error("Hermes dispatcher fence lost");
      s.dispatcher = undefined;
    });
  }
  private residuals(): HermesResidual[] {
    const r: HermesResidual[] = [];
    if (!this.bundle.manifest)
      r.push({
        code: "manifest-absent",
        explanation: "no self-verifying provider manifest",
      });
    if (!(this.store instanceof DiskHermesProviderStateStore))
      r.push({
        code: "durable-store-unproven",
        explanation: "control state is not the atomic disk store",
      });
    if (!this.bundle.manifest?.slack || !this.integrations.slack?.health())
      r.push({
        code: "slack-unconfigured",
        explanation: "Slack gateway is not configured and healthy",
      });
    if (
      !this.bundle.manifest?.workers.length ||
      !this.integrations.worker?.health()
    )
      r.push({
        code: "worker-unconfigured",
        explanation: "no healthy R11 worker profiles are bound",
      });
    if (!this.integrations.events?.health())
      r.push({
        code: "event-lift-unconfigured",
        explanation: "authenticated native event cursor/lift is not configured",
      });
    return r;
  }
  private mutate(change: (state: HermesProviderSnapshot) => void) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = this.current(),
        next = structuredClone(current);
      change(next);
      next.sequence++;
      const sealed = this.seal(stripSeal(next));
      if (
        this.store.compareAndSwap(
          this.bundle.deploymentId,
          current.sequence,
          sealed,
        )
      )
        return structuredClone(sealed);
    }
    throw new Error("Hermes provider state CAS contention");
  }
  private seal(value: Omit<HermesProviderSnapshot, "digest" | "signature">) {
    const stateDigest = digest(value);
    return {
      ...value,
      digest: stateDigest,
      signature: this.trust.signState(stateDigest),
    };
  }
  private verifySnapshot(value: HermesProviderSnapshot) {
    const { digest: observed, signature, ...state } = value;
    if (
      observed !== digest(state) ||
      !this.trust.verifyState(observed, signature) ||
      value.deploymentId !== this.bundle.deploymentId ||
      value.board !== this.bundle.board
    )
      throw new Error("Hermes provider snapshot is invalid or misbound");
  }
}

function parseVersion(
  text: string,
  executableDigest: string,
): HermesVersionPin {
  const release = /Hermes Agent v([^ ]+)/.exec(text)?.[1],
    upstreamRevision = /upstream ([a-f0-9]+)/.exec(text)?.[1],
    localRevision = /local ([a-f0-9]+)/.exec(text)?.[1];
  if (!release || !upstreamRevision || !localRevision)
    throw new Error("Hermes version output is unrecognized");
  return { release, upstreamRevision, localRevision, executableDigest };
}

function parseBoard(value: unknown): HermesBoardObservation {
  if (!record(value)) throw new Error("Hermes board entry is malformed");
  const counts = value.counts;
  if (!record(counts) || Object.values(counts).some((item) => !safeCount(item)))
    throw new Error("Hermes board counts are malformed");
  return {
    slug: required(value.slug, "board.slug"),
    name: required(value.name, "board.name"),
    description: string(value.description),
    dbPath: required(value.db_path, "board.db_path"),
    archived: boolean(value.archived, "board.archived"),
    counts: counts as Record<string, number>,
    total: count(value.total, "board.total"),
  };
}

function parseTask(text: string): HermesTaskObservation {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Hermes task response is malformed");
  }
  if (!record(value)) throw new Error("Hermes task response is malformed");
  return {
    id: required(value.id, "task.id"),
    title: required(value.title, "task.title"),
    body: string(value.body),
    assignee: nullableString(value.assignee, "task.assignee"),
    status: required(value.status, "task.status"),
    tenant: nullableString(value.tenant, "task.tenant"),
    createdAt: count(value.created_at, "task.created_at"),
    result: nullableString(value.result, "task.result"),
  };
}

function validateBundle(value: HermesDeploymentBundle) {
  if (
    value.schema !== "autonomy.hermes-live-deployment.v1" ||
    !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(value.board) ||
    !value.deploymentId ||
    !value.tenant ||
    !value.home ||
    !value.defaultWorkdir ||
    !/^sha256:[a-f0-9]{64}$/.test(value.configurationDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.bundleDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.pin.executableDigest)
  )
    throw new Error("Hermes deployment bundle is malformed or unpinned");
  const manifest = value.manifest;
  if (!manifest) throw new Error("Hermes provider manifest is required");
  {
    if (
      manifest.schema !== "autonomy.hermes-provider-manifest.v1" ||
      manifest.configuration.dispatchInGateway !== false ||
      digest(manifest.configuration) !== value.configurationDigest
    )
      throw new Error("Hermes manifest configuration is malformed or unbound");
    if (
      !manifest.workers.length ||
      new Set(manifest.workers.map((x) => x.assignee)).size !==
        manifest.workers.length ||
      manifest.workers.some(
        (x) =>
          !x.assignee ||
          !x.r11Runtime ||
          !/^sha256:[a-f0-9]{64}$/.test(x.profileDigest),
      )
    )
      throw new Error("Hermes worker manifest is malformed");
    if (
      new Set(manifest.hiddenState.map((x) => x.path)).size !==
        manifest.hiddenState.length ||
      manifest.hiddenState.some(
        (x) =>
          !x.path ||
          (x.kind === "durable" && !x.includedInBackup) ||
          (x.kind === "secret" && x.includedInBackup),
      )
    )
      throw new Error("Hermes hidden state backup policy is unsafe");
    if (
      manifest.implementation.some(
        (x) => !x.path || !/^sha256:[a-f0-9]{64}$/.test(x.digest),
      )
    )
      throw new Error("Hermes implementation manifest is unpinned");
  }
}

function stripSeal(value: HermesProviderSnapshot) {
  const { digest: _, signature: __, ...state } = value;
  return state;
}
function digest(value: unknown) {
  return `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
}
function timeValue(value: string) {
  if (!Number.isFinite(Date.parse(value))) throw new Error("invalid timestamp");
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function required(value: unknown, path: string) {
  if (typeof value !== "string" || !value)
    throw new Error(`${path} is invalid`);
  return value;
}
function string(value: unknown) {
  if (typeof value !== "string")
    throw new Error("Hermes string field is invalid");
  return value;
}
function nullableString(value: unknown, path: string) {
  if (value === null) return null;
  return required(value, path);
}
function boolean(value: unknown, path: string) {
  if (typeof value !== "boolean") throw new Error(`${path} is invalid`);
  return value;
}
function safeCount(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function count(value: unknown, path: string) {
  if (!safeCount(value)) throw new Error(`${path} is invalid`);
  return value as number;
}
