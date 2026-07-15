import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  lstatSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";

export type PaperclipReleasePin = {
  repository: string;
  commit: string;
  treeDigest: string;
  lockDigest: string;
  executableDigest: string;
  builtExecutableDigest: string;
  workspaceBuildDigest: string;
  workspaceBuildRoots: string[];
  dependencyDigest: string;
  runtimeExecutable: string;
  runtimeVersion: string;
  runtimeDigest: string;
  runtimeLauncher: string;
  runtimeLauncherDigest: string;
  runtimeEntrypoint: string;
};
export type PaperclipDeploymentPlan = {
  schema: "autonomy.paperclip-deployment.v1";
  deploymentId: string;
  checkout: string;
  dataDir: string;
  endpoint: string;
  pin: PaperclipReleasePin;
  planDigest: string;
};
export type PaperclipDeploymentObservation = {
  running: boolean;
  pid: number | null;
  launchFence: number | null;
  endpoint: string;
  dataDir: string;
  pin: PaperclipReleasePin;
  healthy: boolean;
};
export type PaperclipDeploymentState = {
  schema: "autonomy.paperclip-deployment-state.v1";
  deploymentId: string;
  sequence: number;
  fence: number;
  lifecycleGeneration: number;
  restoreEpoch: number;
  processFence: number | null;
  status: "stopped" | "running" | "destroyed";
  pin: PaperclipReleasePin;
  backup?: { id: string; path: string; digest: string; pin: PaperclipReleasePin; platform: string; format: "paperclip-physical-v1" };
  operation?: {
    id: string;
    kind: "start" | "restart" | "backup" | "restore" | "upgrade" | "rollback" | "teardown";
    phase: "prepared" | "verified";
    digest: string;
  };
  backupIntent?: { id: string; path: string; resumeAfter: boolean };
  digest: string;
  signature: string;
};
export interface PaperclipDeploymentTrust {
  sign(digest: string): string;
  verify(digest: string, signature: string): boolean;
}
export interface PaperclipDeploymentStore {
  load(id: string): PaperclipDeploymentState | undefined;
  compareAndSwap(id: string, expected: number | undefined, next: PaperclipDeploymentState): boolean;
  delete(id: string, expected: number): boolean;
}
export interface PaperclipDeploymentNativePort {
  provision(plan: PaperclipDeploymentPlan): void;
  verifyCheckout(path: string, pin: PaperclipReleasePin): boolean;
  start(plan: PaperclipDeploymentPlan, fence: number): void;
  stop(plan: PaperclipDeploymentPlan, fence: number): void;
  inspect(plan: PaperclipDeploymentPlan): PaperclipDeploymentObservation;
  createBackup(plan: PaperclipDeploymentPlan, path: string): string;
  restoreBackup(plan: PaperclipDeploymentPlan, path: string, digest: string): void;
  install(plan: PaperclipDeploymentPlan, pin: PaperclipReleasePin): void;
  remove(plan: PaperclipDeploymentPlan): void;
}

export class DiskPaperclipDeploymentStore implements PaperclipDeploymentStore {
  constructor(private readonly root: string) { mkdirSync(root, { recursive: true }); }
  private path(id: string) { return resolve(this.root, `${safeId(id)}.json`); }
  load(id: string) {
    const path = this.path(id);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as PaperclipDeploymentState : undefined;
  }
  compareAndSwap(id: string, expected: number | undefined, next: PaperclipDeploymentState) {
    return this.locked(id, () => {
      const current = this.load(id);
      if (current?.sequence !== expected) return false;
      const path = this.path(id), temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      const fd = openSync(temporary, "wx", 0o600);
      try { writeFileSync(fd, `${canonicalSemanticJson(next)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, path);
      const parent = openSync(this.root, "r"); try { fsyncSync(parent); } finally { closeSync(parent); }
      return true;
    });
  }
  delete(id: string, expected: number) {
    return this.locked(id, () => { const current = this.load(id); if (current?.sequence !== expected) return false; rmSync(this.path(id)); const parent = openSync(this.root, "r"); try { fsyncSync(parent); } finally { closeSync(parent); } return true; });
  }
  private locked<T>(id: string, action: () => T): T {
    const lock = `${this.path(id)}.lock`, ownerPath = resolve(lock, "owner.json"), token = randomUUID(); let owned = false;
    for (let attempt = 0; attempt < 500; attempt++) {
      try { mkdirSync(lock, { mode: 0o700 }); writeFileSync(ownerPath, canonicalSemanticJson({ pid: process.pid, token, createdAt: Date.now() }), { mode: 0o600 }); owned = true; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const encoded = readFileSync(ownerPath, "utf8"), owner = JSON.parse(encoded) as { pid?: number; token?: string };
          if (owner.pid && owner.token && !processAlive(owner.pid)) {
            const observed = JSON.parse(readFileSync(ownerPath, "utf8")) as { pid?: number; token?: string };
            if (observed.pid === owner.pid && observed.token === owner.token) rmSync(lock, { recursive: true, force: true });
          }
        }
        catch { if (Date.now() - statSync(lock).mtimeMs > 30_000) rmSync(lock, { recursive: true, force: true }); }
        Bun.sleepSync(10);
      }
    }
    if (!owned) throw new Error("Paperclip disk state lock timeout");
    try { return action(); } finally { try { const owner = JSON.parse(readFileSync(ownerPath, "utf8")) as { token?: string }; if (owner.token === token) rmSync(lock, { recursive: true, force: true }); } catch { /* lost ownership: never delete another owner's lock */ } }
  }
}

export class MemoryPaperclipDeploymentStore implements PaperclipDeploymentStore {
  private readonly values = new Map<string, PaperclipDeploymentState>();
  load(id: string) { const value = this.values.get(id); return value && structuredClone(value); }
  compareAndSwap(id: string, expected: number | undefined, next: PaperclipDeploymentState) {
    if (this.values.get(id)?.sequence !== expected) return false;
    this.values.set(id, structuredClone(next)); return true;
  }
  delete(id: string, expected: number) {
    if (this.values.get(id)?.sequence !== expected) return false;
    return this.values.delete(id);
  }
}

/** Concrete local port. It may only target directories exclusively owned by the plan. */
export class LocalPaperclipProcessPort implements PaperclipDeploymentNativePort {
  private readonly dependencyAttestations = new Map<string, string>();
  private pidPath(plan: PaperclipDeploymentPlan) { return resolve(plan.dataDir, ".open-autonomy-paperclip.pid"); }
  provision(plan: PaperclipDeploymentPlan) {
    if (existsSync(plan.checkout)) throw new Error("Paperclip owned checkout path already exists but is not pinned");
    mkdirSync(dirname(plan.checkout), { recursive: true });
    checked(["git", "clone", "--no-checkout", plan.pin.repository, plan.checkout]);
    checked(["git", "-C", plan.checkout, "checkout", "--detach", plan.pin.commit]);
    if (plan.pin.repository.startsWith("/") && existsSync(resolve(plan.pin.repository, "node_modules"))) linkDependencyCaches(plan.pin.repository, plan.checkout, plan.pin.dependencyDigest);
    else checked(["corepack", "pnpm", "install", "--frozen-lockfile", "--prefer-offline"], plan.checkout);
    const pinnedBuild = resolve(plan.pin.repository, "server/dist");
    if (plan.pin.repository.startsWith("/") && existsSync(resolve(pinnedBuild, "index.js"))) copyWorkspaceBuildClosure(plan.pin.repository, plan.checkout, plan.pin.workspaceBuildRoots);
    else checked(["corepack", "pnpm", "--filter", "@paperclipai/server", "build"], plan.checkout);
    if (paperclipWorkspaceBuildDigest(plan.checkout, plan.pin.workspaceBuildRoots) !== plan.pin.workspaceBuildDigest) throw new Error("provisioned workspace build closure differs from pin");
    if (dependencyMetadataDigest(plan.checkout) !== plan.pin.dependencyDigest) throw new Error("provisioned dependency closure differs from pin");
    this.dependencyAttestations.set(resolve(plan.checkout), plan.pin.dependencyDigest);
  }
  verifyCheckout(path: string, pin: PaperclipReleasePin) {
    if (!existsSync(path)) return false;
    const commit = command(["git", "-C", path, "rev-parse", "HEAD"]).trim();
    const tree = commandBytes(["git", "-C", path, "ls-files", "-s", "-z"]);
    const lock = readFileSync(resolve(path, "pnpm-lock.yaml"));
    const executable = readFileSync(resolve(path, "server/src/index.ts"));
    const built = resolve(path, "server/dist/index.js");
    const key = resolve(path), dependencies = this.dependencyAttestations.get(key) ?? dependencyMetadataDigest(path);
    if (dependencies === pin.dependencyDigest) this.dependencyAttestations.set(key, dependencies);
    return commit === pin.commit && digestBytes(tree) === pin.treeDigest && digestBytes(lock) === pin.lockDigest && digestBytes(executable) === pin.executableDigest && existsSync(built) && digestBytes(readFileSync(built)) === pin.builtExecutableDigest && paperclipWorkspaceBuildDigest(path, pin.workspaceBuildRoots) === pin.workspaceBuildDigest && dependencies === pin.dependencyDigest && command(["git", "-C", path, "status", "--porcelain"]).trim() === "";
  }
  start(plan: PaperclipDeploymentPlan, fence: number) {
    mkdirSync(plan.dataDir, { recursive: true });
    attestRuntime(plan);
    const port = new URL(plan.endpoint).port;
    const logPath = resolve(plan.dataDir, "paperclip.log"), log = openSync(logPath, "a", 0o600);
    const child = spawn(plan.pin.runtimeExecutable, [resolve(plan.checkout, plan.pin.runtimeLauncher), resolve(plan.checkout, plan.pin.runtimeEntrypoint)], { cwd: plan.checkout, detached: true, stdio: ["ignore", log, log], env: { ...process.env, HOST: "127.0.0.1", PORT: port, PAPERCLIP_HOME: plan.dataDir, OPEN_AUTONOMY_FENCE: String(fence) } });
    closeSync(log);
    if (!child.pid) throw new Error("Paperclip process did not spawn");
    const startToken = processStartToken(child.pid);
    child.unref(); writeFileSync(this.pidPath(plan), canonicalSemanticJson({ pid: child.pid, launchFence: fence, token: randomUUID(), processStartToken: startToken, startedAt: Date.now() }), { mode: 0o600 });
    const commit = command(["git", "-C", plan.checkout, "rev-parse", "HEAD"]).trim();
    for (let i = 0; i < 1_800; i++) { if (health(plan.endpoint, commit)) return; Bun.sleepSync(100); }
    const tail = existsSync(logPath) ? readFileSync(logPath, "utf8").slice(-8_000) : "no process log";
    throw new Error(`Paperclip process health timeout: ${tail}`);
  }
  stop(plan: PaperclipDeploymentPlan, _fence: number) {
    const path = this.pidPath(plan); if (!existsSync(path)) return;
    const owner = JSON.parse(readFileSync(path, "utf8")) as { pid?: number; token?: string; launchFence?: number; processStartToken?: string }, pid = owner.pid ?? 0;
    if (Number.isSafeInteger(pid) && pid > 1) {
      if (owner.launchFence !== _fence) throw new Error("Paperclip stop fence does not own the observed process");
      const rechecked = JSON.parse(readFileSync(path, "utf8")) as { pid?: number; token?: string; launchFence?: number; processStartToken?: string };
      if (rechecked.pid !== pid || !owner.token || rechecked.token !== owner.token || rechecked.launchFence !== _fence || !owner.processStartToken || rechecked.processStartToken !== owner.processStartToken || processStartToken(pid) !== owner.processStartToken) throw new Error("Paperclip PID ownership changed before stop");
      try { process.kill(-pid, "SIGTERM"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      for (let attempt = 0; attempt < 300 && processGroupHasLiveMember(pid); attempt++) Bun.sleepSync(100);
      if (processGroupHasLiveMember(pid)) process.kill(-pid, "SIGKILL");
      for (let attempt = 0; attempt < 100 && processGroupHasLiveMember(pid); attempt++) Bun.sleepSync(50);
      if (processGroupHasLiveMember(pid)) throw new Error("Paperclip process group did not stop within bound");
    }
    rmSync(path, { force: true });
  }
  inspect(plan: PaperclipDeploymentPlan): PaperclipDeploymentObservation {
    const path = this.pidPath(plan), owner = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as { pid?: number; launchFence?: number } : undefined, pid = owner?.pid ?? null;
    let running = false; if (pid) { try { process.kill(pid, 0); running = true; } catch { /* stopped */ } }
    const zero = { repository: plan.pin.repository, commit: "0".repeat(40), treeDigest: hashEmpty(), lockDigest: hashEmpty(), executableDigest: hashEmpty(), builtExecutableDigest: hashEmpty(), workspaceBuildDigest: hashEmpty(), workspaceBuildRoots: structuredClone(plan.pin.workspaceBuildRoots), dependencyDigest: hashEmpty(), runtimeExecutable: plan.pin.runtimeExecutable, runtimeVersion: plan.pin.runtimeVersion, runtimeDigest: plan.pin.runtimeDigest, runtimeLauncher: plan.pin.runtimeLauncher, runtimeLauncherDigest: plan.pin.runtimeLauncherDigest, runtimeEntrypoint: plan.pin.runtimeEntrypoint };
    const dependencyDigest = this.dependencyAttestations.get(resolve(plan.checkout));
    const observed = existsSync(plan.checkout) ? observedPin(plan.checkout, plan.pin, dependencyDigest) : zero;
    return { running, pid, launchFence: owner?.launchFence ?? null, endpoint: plan.endpoint, dataDir: plan.dataDir, pin: observed, healthy: running && health(plan.endpoint, observed.commit) };
  }
  createBackup(plan: PaperclipDeploymentPlan, path: string) { mkdirSync(dirname(path), { recursive: true }); checked(["tar", "-C", plan.dataDir, "-czf", path, "."]); return digestBytes(readFileSync(path)); }
  restoreBackup(plan: PaperclipDeploymentPlan, path: string, expected: string) { if (digestBytes(readFileSync(path)) !== expected) throw new Error("backup digest mismatch"); rmSync(plan.dataDir, { recursive: true, force: true }); mkdirSync(plan.dataDir, { recursive: true }); checked(["tar", "-C", plan.dataDir, "-xzf", path]); }
  install(plan: PaperclipDeploymentPlan, pin: PaperclipReleasePin) { this.dependencyAttestations.delete(resolve(plan.checkout)); checked(["git", "-C", plan.checkout, "fetch", "origin", pin.commit]); checked(["git", "-C", plan.checkout, "checkout", "--detach", pin.commit]); checked(["corepack", "pnpm", "install", "--frozen-lockfile", "--prefer-offline"], plan.checkout); checked(["corepack", "pnpm", "--filter", "@paperclipai/server", "build"], plan.checkout); }
  remove(plan: PaperclipDeploymentPlan) { rmSync(plan.dataDir, { recursive: true, force: true }); rmSync(plan.checkout, { recursive: true, force: true }); }
}

export class PaperclipDeploymentLifecycle {
  constructor(
    readonly plan: PaperclipDeploymentPlan,
    private readonly native: PaperclipDeploymentNativePort,
    private readonly trust: PaperclipDeploymentTrust,
    private readonly store: PaperclipDeploymentStore,
  ) { validatePlan(plan); }

  initialize() {
    if (!this.native.verifyCheckout(this.plan.checkout, this.plan.pin)) this.native.provision(this.plan);
    if (!this.native.verifyCheckout(this.plan.checkout, this.plan.pin)) throw new Error("Paperclip checkout does not match exact release pin after provisioning");
    const current = this.store.load(this.plan.deploymentId);
    if (current) { this.verify(current); return current; }
    const state = this.seal({ schema: "autonomy.paperclip-deployment-state.v1", deploymentId: this.plan.deploymentId, sequence: 1, fence: 0, lifecycleGeneration: 0, restoreEpoch: 0, processFence: null, status: "stopped", pin: this.plan.pin });
    if (!this.store.compareAndSwap(this.plan.deploymentId, undefined, state)) throw new Error("concurrent Paperclip initialization");
    return state;
  }
  inspect() {
    const state = this.current(), observed = this.native.inspect(this.plan);
    this.assertIdentity(observed, state.pin);
    if (observed.running && observed.launchFence !== state.processFence) throw new Error("Paperclip running process fence differs from signed lifecycle state");
    return { state, observed };
  }
  start(operationId: string) {
    const current = this.current(), state = this.prepare(operationId, "start", current.pin);
    if (state.operation?.phase === "verified") return state;
    const before = this.native.inspect(this.plan);
    const launched = !before.running;
    if (launched) { this.assertFence(state.fence); this.native.start(this.plan, state.fence); }
    return this.verifyRunning(operationId, state.pin, launched || before.launchFence === state.fence);
  }
  restart(operationId: string) {
    const current = this.current(), state = this.prepare(operationId, "restart", current.pin);
    if (state.operation?.phase === "verified") return state;
    const observed = this.native.inspect(this.plan);
    if (observed.running && observed.launchFence === state.fence) return this.verifyRunning(operationId, state.pin);
    if (observed.running) { this.assertFence(state.fence); this.native.stop(this.plan, requiredProcessFence(state)); }
    this.assertFence(state.fence); this.native.start(this.plan, state.fence);
    return this.verifyRunning(operationId, state.pin);
  }
  backup(id: string, path: string) {
    let state = this.current();
    if (state.status === "destroyed") throw new Error("deployment destroyed");
    if (state.operation?.id === `backup:${id}` && state.operation.phase === "verified") return state;
    state = this.prepare(`backup:${id}`, "backup", { id, path });
    if (!state.backupIntent) { const request = { id, path, resumeAfter: this.native.inspect(this.plan).running }; state = this.mutate((next) => { next.backupIntent = request; }); }
    else if (state.backupIntent.id !== id || state.backupIntent.path !== path) throw new Error("Paperclip backup operation equivocation");
    const intent = state.backupIntent;
    if (!intent) throw new Error("Paperclip durable backup intent was not persisted");
    const resumeAfter = intent.resumeAfter;
    const resumed = this.native.inspect(this.plan);
    if (resumed.running && resumed.launchFence === state.fence && state.processFence !== state.fence) state = this.mutate((next) => { next.processFence = next.fence; next.lifecycleGeneration++; });
    if (this.native.inspect(this.plan).running) { this.assertFence(state.fence); this.native.stop(this.plan, requiredProcessFence(state)); }
    this.assertFence(state.fence);
    const artifactDigest = this.native.createBackup(this.plan, path);
    if (!sha(artifactDigest)) throw new Error("backup is not content addressed");
    if (resumeAfter) { this.assertFence(state.fence); this.native.start(this.plan, state.fence); this.assertIdentity(this.native.inspect(this.plan), state.pin); }
    return this.mutate((next) => { next.backup = { id, path, digest: artifactDigest, pin: structuredClone(state.pin), platform: `${process.platform}-${process.arch}`, format: "paperclip-physical-v1" }; if (resumeAfter) { next.processFence = state.fence; next.lifecycleGeneration++; } next.backupIntent = undefined; next.operation = verified(next.operation!); });
  }
  restore(operationId: string) {
    const before = this.current(), backup = before.backup;
    if (!backup) throw new Error("no verified backup");
    if (backup.platform !== `${process.platform}-${process.arch}` || backup.format !== "paperclip-physical-v1") throw new Error("Paperclip physical backup is not portable to this runtime");
    const state = this.prepare(operationId, "restore", backup);
    const resumed = this.native.inspect(this.plan);
    if (resumed.running && resumed.launchFence === state.fence) { const restored = this.verifyRunning(operationId, before.pin); return this.mutate((next) => { next.restoreEpoch = restored.restoreEpoch + 1; }); }
    this.assertFence(state.fence); this.native.stop(this.plan, requiredProcessFence(state));
    this.assertFence(state.fence); this.native.restoreBackup(this.plan, backup.path, backup.digest);
    this.assertFence(state.fence); this.native.start(this.plan, state.fence);
    const restored = this.verifyRunning(operationId, before.pin);
    return this.mutate((next) => { next.restoreEpoch = restored.restoreEpoch + 1; });
  }
  upgrade(operationId: string, target: PaperclipReleasePin, backupPath: string) {
    validatePin(target);
    const before = this.current();
    if (same(before.pin, target)) return before;
    this.backup(`upgrade:${operationId}`, backupPath);
    const prepared = this.prepare(operationId, "upgrade", target);
    try {
      const reconciled = this.native.inspect(this.plan);
      if (reconciled.running && reconciled.launchFence === prepared.fence && same(reconciled.pin, target)) return this.mutate((state) => { state.pin = structuredClone(target); state.status = "running"; state.processFence = prepared.fence; state.lifecycleGeneration++; state.operation = verified(state.operation!); });
      this.assertFence(prepared.fence); this.native.stop(this.plan, requiredProcessFence(prepared));
      this.assertFence(prepared.fence); this.native.install(this.plan, target);
      if (!this.native.verifyCheckout(this.plan.checkout, target)) throw new Error("installed checkout differs from target pin");
      this.assertFence(prepared.fence); this.native.start(this.plan, prepared.fence);
      this.assertIdentity(this.native.inspect(this.plan), target);
      return this.mutate((state) => { state.pin = structuredClone(target); state.status = "running"; state.processFence = prepared.fence; state.lifecycleGeneration++; state.operation = verified(state.operation!); });
    } catch (cause) {
      return this.rollback(`rollback:${operationId}`, before.pin, cause);
    }
  }
  rollback(operationId: string, target?: PaperclipReleasePin, cause?: unknown) {
    const state = this.current(), pin = target ?? state.backup?.pin;
    if (!pin || !state.backup) throw new Error("rollback has no pinned checkpoint", { cause });
    const prepared = this.prepare(operationId, "rollback", pin);
    const reconciled = this.native.inspect(this.plan);
    if (reconciled.running && reconciled.launchFence === prepared.fence && same(reconciled.pin, pin)) return this.mutate((next) => { next.pin = structuredClone(pin); next.status = "running"; next.processFence = prepared.fence; next.lifecycleGeneration++; next.restoreEpoch++; next.operation = verified(next.operation!); });
    this.assertFence(prepared.fence); this.native.stop(this.plan, requiredProcessFence(prepared));
    this.assertFence(prepared.fence); this.native.install(this.plan, pin);
    if (!this.native.verifyCheckout(this.plan.checkout, pin)) throw new Error("rollback source identity mismatch", { cause });
    this.assertFence(prepared.fence); this.native.restoreBackup(this.plan, state.backup.path, state.backup.digest);
    this.assertFence(prepared.fence); this.native.start(this.plan, prepared.fence);
    this.assertIdentity(this.native.inspect(this.plan), pin);
    return this.mutate((next) => { next.pin = structuredClone(pin); next.status = "running"; next.processFence = prepared.fence; next.lifecycleGeneration++; next.restoreEpoch++; next.operation = verified(next.operation!); });
  }
  teardown(operationId: string) {
    const current = this.current();
    if (current.status === "destroyed") { const observed = this.native.inspect(this.plan); if (observed.running || observed.healthy || existsIdentity(observed)) throw new Error("destroyed deployment resources reappeared"); return current; }
    const state = this.prepare(operationId, "teardown", current.pin);
    this.assertFence(state.fence); this.native.stop(this.plan, requiredProcessFence(state));
    this.assertFence(state.fence); this.native.remove(this.plan);
    const observed = this.native.inspect(this.plan);
    if (observed.running || observed.healthy || existsIdentity(observed)) throw new Error("Paperclip teardown left process, data, or checkout identity");
    return this.mutate((next) => { next.status = "destroyed"; next.processFence = null; next.operation = verified(next.operation!); });
  }
  assertFence(fence: number) { if (fence !== this.current().fence) throw new Error("stale Paperclip lifecycle fence"); }

  private prepare(id: string, kind: NonNullable<PaperclipDeploymentState["operation"]>["kind"], input: unknown) {
    const current = this.current(), requestDigest = digest({ kind, input });
    if (current.operation?.id === id) {
      if (current.operation.kind !== kind || current.operation.digest !== requestDigest) throw new Error("Paperclip lifecycle operation equivocation");
      return current;
    }
    if (current.operation?.phase === "prepared" && !(kind === "rollback" && id === `rollback:${current.operation.id}`)) throw new Error("another Paperclip lifecycle operation owns the durable claim");
    return this.mutate((state) => { state.fence++; state.operation = { id, kind, phase: "prepared", digest: requestDigest }; });
  }
  private verifyRunning(id: string, pin: PaperclipReleasePin, replacedProcess = true) {
    const observed = this.native.inspect(this.plan); this.assertIdentity(observed, pin);
    if (!observed.running || !observed.healthy) throw new Error("Paperclip process did not become healthy");
    return this.mutate((state) => { if (state.operation?.id !== id) throw new Error("operation lost ownership"); state.status = "running"; if (replacedProcess) state.processFence = state.fence; else requiredProcessFence(state); state.lifecycleGeneration++; state.operation = verified(state.operation); });
  }
  private assertIdentity(value: PaperclipDeploymentObservation, pin: PaperclipReleasePin) {
    if (value.endpoint !== this.plan.endpoint || value.dataDir !== this.plan.dataDir || !same(value.pin, pin)) throw new Error("Paperclip observed process identity mismatch");
  }
  private current() { const value = this.store.load(this.plan.deploymentId); if (!value) throw new Error("Paperclip deployment is not initialized"); this.verify(value); return value; }
  private mutate(change: (state: PaperclipDeploymentState) => void) {
    for (let attempt = 0; attempt < 8; attempt++) { const current = this.current(), next = structuredClone(current); change(next); next.sequence++; const sealed = this.seal(next); if (this.store.compareAndSwap(this.plan.deploymentId, current.sequence, sealed)) return sealed; }
    throw new Error("Paperclip deployment CAS contention");
  }
  private seal(value: Omit<PaperclipDeploymentState, "digest" | "signature"> | PaperclipDeploymentState) { const body = { ...value, digest: undefined, signature: undefined }; delete body.digest; delete body.signature; const d = digest(body); return { ...body, digest: d, signature: this.trust.sign(d) } as PaperclipDeploymentState; }
  private verify(value: PaperclipDeploymentState) { const body = { ...value, digest: undefined, signature: undefined }; delete body.digest; delete body.signature; const d = digest(body); if (d !== value.digest || !this.trust.verify(d, value.signature) || value.deploymentId !== this.plan.deploymentId) throw new Error("Paperclip deployment state authentication failed"); }
}

export function paperclipDeploymentPlanDigest(value: Omit<PaperclipDeploymentPlan, "planDigest">) { return digest(value); }
export function paperclipDependencyTreeDigest(root: string) {
  return filesystemRootsDigest(root, ["node_modules"]);
}
export function paperclipWorkspaceBuildDigest(root: string, roots: string[]) {
  validateWorkspaceBuildRoots(roots);
  return filesystemRootsDigest(root, roots);
}
function filesystemRootsDigest(root: string, roots: string[]) {
  const aggregate = createHash("sha256"), base = resolve(root);
  const add = (record: Record<string, unknown>) => { const encoded = canonicalSemanticJson(record), bytes = Buffer.from(encoded); aggregate.update(`${bytes.length}:`); aggregate.update(bytes); };
  const visit = (path: string, relative: string) => {
    const stat = lstatSync(path), mode = stat.mode & 0o7777;
    if (stat.isSymbolicLink()) { add({ kind: "symlink", path: relative, target: readlinkSync(path) }); return; }
    if (stat.isDirectory()) { add({ kind: "directory", path: relative, mode }); for (const name of readdirSync(path).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)))) visit(resolve(path, name), `${relative}/${name}`); return; }
    if (stat.isFile()) { add({ kind: "file", path: relative, mode, digest: digestBytes(readFileSync(path)) }); return; }
    throw new Error(`dependency closure contains unsupported node: ${relative}`);
  };
  for (const relative of roots) {
    const path = resolve(base, relative);
    if (path !== base && !path.startsWith(`${base}/`)) throw new Error(`filesystem closure root escapes base: ${relative}`);
    if (!existsSync(path)) throw new Error(`filesystem closure root is missing: ${relative}`);
    visit(path, relative);
  }
  return `sha256:${aggregate.digest("hex")}`;
}
function validatePlan(value: PaperclipDeploymentPlan) { const { planDigest, ...body } = value; if (value.schema !== "autonomy.paperclip-deployment.v1" || planDigest !== digest(body) || !value.deploymentId || !value.endpoint.startsWith("http://127.0.0.1:") || resolve(value.checkout) === resolve(value.dataDir)) throw new Error("invalid Paperclip deployment plan"); validatePin(value.pin); }
function validatePin(pin: PaperclipReleasePin) { if (!/^[a-f0-9]{40}$/.test(pin.commit) || !sha(pin.treeDigest) || !sha(pin.lockDigest) || !sha(pin.executableDigest) || !sha(pin.builtExecutableDigest) || !sha(pin.workspaceBuildDigest) || !sha(pin.dependencyDigest) || !sha(pin.runtimeDigest) || !sha(pin.runtimeLauncherDigest) || !pin.runtimeExecutable.startsWith("/") || basename(pin.runtimeExecutable) !== "node" || !/^v\d+\.\d+\.\d+$/.test(pin.runtimeVersion) || !safeRelativePath(pin.runtimeLauncher) || !safeRelativePath(pin.runtimeEntrypoint)) throw new Error("Paperclip release is not exactly pinned"); validateWorkspaceBuildRoots(pin.workspaceBuildRoots); }
function safeRelativePath(path: string) { return !!path && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((part) => part === "" || part === "." || part === ".."); }
function attestRuntime(plan: PaperclipDeploymentPlan) {
  const pin = plan.pin, launcher = resolve(plan.checkout, pin.runtimeLauncher), entrypoint = resolve(plan.checkout, pin.runtimeEntrypoint);
  if (!existsSync(pin.runtimeExecutable) || digestBytes(readFileSync(pin.runtimeExecutable)) !== pin.runtimeDigest || command([pin.runtimeExecutable, "--version"]).trim() !== pin.runtimeVersion || !existsSync(launcher) || digestBytes(readFileSync(launcher)) !== pin.runtimeLauncherDigest || !existsSync(entrypoint) || digestBytes(readFileSync(entrypoint)) !== pin.executableDigest) throw new Error("Paperclip runtime invocation differs from exact release pin");
}
function validateWorkspaceBuildRoots(roots: string[]) {
  if (!Array.isArray(roots) || roots.length === 0 || !roots.includes("server/dist")) throw new Error("Paperclip workspace build roots must explicitly include server/dist");
  for (const root of roots) if (!root || root.startsWith("/") || root.includes("\\") || root.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error(`unsafe Paperclip workspace build root: ${root}`);
  const canonical = [...roots].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  if (new Set(roots).size !== roots.length || !roots.every((root, index) => root === canonical[index])) throw new Error("Paperclip workspace build roots must be unique and byte-sorted");
}
function digest(value: unknown) { return `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`; }
function sha(value: string) { return /^sha256:[a-f0-9]{64}$/.test(value); }
function same(a: unknown, b: unknown) { return canonicalSemanticJson(a) === canonicalSemanticJson(b); }
function safeId(value: string) { if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("unsafe deployment id"); return value; }
function verified(value: NonNullable<PaperclipDeploymentState["operation"]>) { return { ...value, phase: "verified" as const }; }
function existsIdentity(value: PaperclipDeploymentObservation) { return value.pid !== null || value.pin.commit !== "0000000000000000000000000000000000000000"; }
function checked(argv: string[], cwd?: string) { const result = spawnSync(argv[0]!, argv.slice(1), { cwd, encoding: "utf8" }); if (result.status !== 0) throw new Error(`${argv[0]} failed: ${result.stderr}`); return result.stdout; }
function command(argv: string[]) { return checked(argv); }
function commandBytes(argv: string[]) { const result = spawnSync(argv[0]!, argv.slice(1)); if (result.status !== 0) throw new Error(`${argv[0]} failed: ${result.stderr}`); return result.stdout; }
function digestBytes(value: Uint8Array) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function hashEmpty() { return digestBytes(new Uint8Array()); }
function health(endpoint: string, commit: string) { const result = spawnSync("curl", ["-fsS", `${endpoint}/api/health`], { timeout: 1_000, encoding: "utf8" }); if (result.status !== 0) return false; try { const body = JSON.parse(result.stdout) as { status?: string; deploymentMode?: string; deploymentExposure?: string; authReady?: boolean; bootstrapStatus?: string; serverInfo?: { git?: { fullSha?: string } } }; return body.status === "ok" && body.deploymentMode === "local_trusted" && body.deploymentExposure === "private" && body.authReady === true && body.bootstrapStatus === "ready" && body.serverInfo?.git?.fullSha === commit; } catch { return false; } }
function observedPin(path: string, runtimePin: PaperclipReleasePin, attestedDependencyDigest?: string): PaperclipReleasePin { return { repository: runtimePin.repository, commit: command(["git", "-C", path, "rev-parse", "HEAD"]).trim(), treeDigest: digestBytes(commandBytes(["git", "-C", path, "ls-files", "-s", "-z"])), lockDigest: digestBytes(readFileSync(resolve(path, "pnpm-lock.yaml"))), executableDigest: digestBytes(readFileSync(resolve(path, runtimePin.runtimeEntrypoint))), builtExecutableDigest: digestBytes(readFileSync(resolve(path, "server/dist/index.js"))), workspaceBuildDigest: paperclipWorkspaceBuildDigest(path, runtimePin.workspaceBuildRoots), workspaceBuildRoots: structuredClone(runtimePin.workspaceBuildRoots), dependencyDigest: attestedDependencyDigest ?? dependencyMetadataDigest(path), runtimeExecutable: runtimePin.runtimeExecutable, runtimeVersion: runtimePin.runtimeVersion, runtimeDigest: runtimePin.runtimeDigest, runtimeLauncher: runtimePin.runtimeLauncher, runtimeLauncherDigest: digestBytes(readFileSync(resolve(path, runtimePin.runtimeLauncher))), runtimeEntrypoint: runtimePin.runtimeEntrypoint }; }
function copyWorkspaceBuildClosure(source: string, target: string, roots: string[]) {
  validateWorkspaceBuildRoots(roots);
  for (const relative of roots) {
    const sourceRoot = resolve(source, relative), targetRoot = resolve(target, relative);
    if (!existsSync(sourceRoot)) throw new Error(`pinned workspace build root is missing: ${relative}`);
    mkdirSync(dirname(targetRoot), { recursive: true });
    checked(["bash", "-c", "set -o pipefail; tar -C \"$1\" -cf - \"$3\" | tar --same-permissions -C \"$2\" -xf -", "_", dirname(sourceRoot), dirname(targetRoot), basename(sourceRoot)]);
  }
}
function linkDependencyCaches(source: string, target: string, expected: string) {
  if (!sha(expected)) throw new Error("dependency cache pin is invalid");
  const found = spawnSync("find", [source, "-type", "d", "-name", "node_modules", "-prune", "-print0"]);
  if (found.status !== 0) throw new Error(`dependency cache discovery failed: ${found.stderr}`);
  for (const item of found.stdout.toString().split("\0").filter(Boolean)) {
    const relative = item.slice(source.length + 1), destination = resolve(target, relative);
    mkdirSync(dirname(destination), { recursive: true });
    checked(["bash", "-c", "set -o pipefail; tar -C \"$1\" -cf - node_modules | tar --same-permissions -C \"$2\" -xf -", "_", dirname(item), dirname(destination)]);
  }
}
function dependencyMetadataDigest(root: string) { return existsSync(resolve(root, "node_modules")) ? paperclipDependencyTreeDigest(root) : hashEmpty(); }
function processAlive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
function processGroupHasLiveMember(pgid: number) { const result = spawnSync("ps", ["-o", "stat=", "-g", String(pgid)], { encoding: "utf8" }); return result.status === 0 && result.stdout.split(/\s+/).some((state) => state && !state.startsWith("Z")); }
function processStartToken(pid: number) { const value = readFileSync(`/proc/${pid}/stat`, "utf8"), close = value.lastIndexOf(")"); if (close < 0) throw new Error("Paperclip process identity is unavailable"); const fields = value.slice(close + 2).trim().split(/\s+/), token = fields[19]; if (!token) throw new Error("Paperclip process start token is unavailable"); return token; }
function requiredProcessFence(state: PaperclipDeploymentState) { if (state.processFence === null) throw new Error("Paperclip running process has no launch fence"); return state.processFence; }
