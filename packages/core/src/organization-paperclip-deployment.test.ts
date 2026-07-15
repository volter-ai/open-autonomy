import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  DiskPaperclipDeploymentStore,
  LocalPaperclipProcessPort,
  MemoryPaperclipDeploymentStore,
  PaperclipDeploymentLifecycle,
  paperclipDependencyTreeDigest,
  paperclipDeploymentPlanDigest,
  paperclipWorkspaceBuildDigest,
  type PaperclipDeploymentNativePort,
  type PaperclipDeploymentObservation,
  type PaperclipDeploymentPlan,
  type PaperclipDeploymentTrust,
  type PaperclipReleasePin,
} from "./organization-paperclip-deployment";

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const pin = (digit = "1"): PaperclipReleasePin => ({
  repository: "https://github.com/paperclipai/paperclip.git",
  commit: digit.repeat(40), treeDigest: hash(`tree-${digit}`),
  lockDigest: hash(`lock-${digit}`), executableDigest: hash(`exe-${digit}`),
  builtExecutableDigest: hash(`built-${digit}`),
  workspaceBuildDigest: hash(`workspace-${digit}`),
  workspaceBuildRoots: ["packages/plugins/sdk/dist", "packages/shared/dist", "server/dist"],
  dependencyDigest: hash(`deps-${digit}`),
  runtimeExecutable: "/usr/bin/node",
  runtimeVersion: "v22.22.1",
  runtimeDigest: hash(`runtime-${digit}`),
  runtimeLauncher: "server/node_modules/tsx/dist/cli.mjs",
  runtimeLauncherDigest: hash(`launcher-${digit}`),
  runtimeEntrypoint: "server/src/index.ts",
});

const live = process.env.OPEN_AUTONOMY_PAPERCLIP_LIFECYCLE_LIVE === "1" ? test : test.skip;
live("provisions, starts, restarts, backs up, restores, and tears down the pinned real process", () => {
  const source = process.env.PAPERCLIP_REPO ?? "/mnt/c/users/porta/research/repos/paperclip";
  const git = (...args: string[]) => { const out = spawnSync("git", ["-C", source, ...args]); if (out.status !== 0) throw new Error(out.stderr.toString()); return out.stdout; };
  const canonicalCommit = "90f85a7d11c517b1d09db90dbec97f4de7d96b83";
  expect(git("rev-parse", "HEAD").toString().trim()).toBe(canonicalCommit);
  if (!readFileSync(resolve(source, "server/dist/index.js"))) throw new Error("pinned source build artifact is missing");
  const workspaceBuildRoots = ["packages/plugins/sdk/dist", "packages/shared/dist", "server/dist"];
  const livePin: PaperclipReleasePin = {
    repository: source,
    commit: canonicalCommit,
    treeDigest: `sha256:${createHash("sha256").update(git("ls-files", "-s", "-z")).digest("hex")}`,
    lockDigest: `sha256:${createHash("sha256").update(readFileSync(resolve(source, "pnpm-lock.yaml"))).digest("hex")}`,
    executableDigest: `sha256:${createHash("sha256").update(readFileSync(resolve(source, "server/src/index.ts"))).digest("hex")}`,
    builtExecutableDigest: `sha256:${createHash("sha256").update(readFileSync(resolve(source, "server/dist/index.js"))).digest("hex")}`,
    workspaceBuildDigest: paperclipWorkspaceBuildDigest(source, workspaceBuildRoots),
    workspaceBuildRoots,
    dependencyDigest: process.env.PAPERCLIP_DEPENDENCY_DIGEST ?? paperclipDependencyTreeDigest(source),
    runtimeExecutable: "/usr/bin/node",
    runtimeVersion: spawnSync("/usr/bin/node", ["--version"], { encoding: "utf8" }).stdout.trim(),
    runtimeDigest: `sha256:${createHash("sha256").update(readFileSync("/usr/bin/node")).digest("hex")}`,
    runtimeLauncher: "server/node_modules/tsx/dist/cli.mjs",
    runtimeLauncherDigest: `sha256:${createHash("sha256").update(readFileSync(resolve(source, "server/node_modules/tsx/dist/cli.mjs"))).digest("hex")}`,
    runtimeEntrypoint: "server/src/index.ts",
  };
  const ownedBase = process.env.PAPERCLIP_LIFECYCLE_ROOT ?? tmpdir();
  mkdirSync(ownedBase, { recursive: true });
  const root = mkdtempSync(resolve(ownedBase, "oa-paperclip-lifecycle-"));
  const body = { schema: "autonomy.paperclip-deployment.v1" as const, deploymentId: "live", checkout: resolve(root, "source"), dataDir: resolve(root, "data"), endpoint: `http://127.0.0.1:${process.env.PAPERCLIP_LIFECYCLE_PORT ?? "43211"}`, pin: livePin };
  const lifecycle = new PaperclipDeploymentLifecycle({ ...body, planDigest: paperclipDeploymentPlanDigest(body) }, new LocalPaperclipProcessPort(), trust, new DiskPaperclipDeploymentStore(resolve(root, "state")));
  lifecycle.initialize(); lifecycle.start("start"); lifecycle.backup("backup", resolve(root, "backup.tgz")); lifecycle.restart("restart"); lifecycle.restore("restore");
  expect(lifecycle.inspect().observed.healthy).toBe(true);
  lifecycle.teardown("teardown");
}, 1_200_000);
const plan = (): PaperclipDeploymentPlan => {
  const body = { schema: "autonomy.paperclip-deployment.v1" as const, deploymentId: "paperclip-test", checkout: "/tmp/oa-paperclip/source", dataDir: "/tmp/oa-paperclip/data", endpoint: "http://127.0.0.1:43210", pin: pin() };
  return { ...body, planDigest: paperclipDeploymentPlanDigest(body) };
};
const trust: PaperclipDeploymentTrust = {
  sign: (digest) => `signed:${digest}`,
  verify: (digest, signature) => signature === `signed:${digest}`,
};

class FakeNative implements PaperclipDeploymentNativePort {
  running = false; healthy = false; removed = false; current = pin(); data = "initial";
  backups = new Map<string, { digest: string; data: string }>();
  calls: string[] = []; failInstall = false; failBackup = false; partitioned = false;
  launchFence: number | null = null;
  onStop?: () => void;
  crashOnNextStartedInspect = false; private failInspect = false;
  provision(value: PaperclipDeploymentPlan) { this.calls.push("provision"); this.current = structuredClone(value.pin); }
  verifyCheckout(_path: string, expected: PaperclipReleasePin) { return JSON.stringify(this.current) === JSON.stringify(expected); }
  start(_plan: PaperclipDeploymentPlan, fence: number) { this.calls.push(`start:${fence}`); this.launchFence = fence; this.running = true; this.healthy = !this.partitioned; this.removed = false; if (this.crashOnNextStartedInspect) { this.crashOnNextStartedInspect = false; this.failInspect = true; } }
  stop(_plan: PaperclipDeploymentPlan, fence: number) { if (this.running && fence !== this.launchFence) throw new Error("fake PID launch fence mismatch"); this.calls.push(`stop:${fence}`); this.running = false; this.healthy = false; const hook = this.onStop; this.onStop = undefined; hook?.(); }
  inspect(value: PaperclipDeploymentPlan): PaperclipDeploymentObservation {
    if (this.failInspect) { this.failInspect = false; throw new Error("injected crash after native start"); }
    return { running: this.running, healthy: this.healthy, pid: this.running ? 42 : null, launchFence: this.running ? this.launchFence : null, endpoint: value.endpoint, dataDir: value.dataDir, pin: this.removed ? { ...pin("0") } : structuredClone(this.current) };
  }
  createBackup(_plan: PaperclipDeploymentPlan, path: string) { if (this.failBackup) { this.failBackup = false; throw new Error("injected backup crash"); } const digest = hash(this.data); this.backups.set(path, { digest, data: this.data }); return digest; }
  restoreBackup(_plan: PaperclipDeploymentPlan, path: string, digest: string) { const backup = this.backups.get(path); if (!backup || backup.digest !== digest) throw new Error("backup loss or substitution"); this.data = backup.data; }
  install(_plan: PaperclipDeploymentPlan, target: PaperclipReleasePin) { this.calls.push(`install:${target.commit}`); if (this.failInstall) { this.failInstall = false; throw new Error("injected upgrade loss"); } this.current = structuredClone(target); }
  remove() { this.calls.push("remove"); this.running = false; this.healthy = false; this.removed = true; this.data = ""; }
}
const fixture = () => { const native = new FakeNative(), store = new MemoryPaperclipDeploymentStore(), lifecycle = new PaperclipDeploymentLifecycle(plan(), native, trust, store); lifecycle.initialize(); return { native, store, lifecycle }; };

describe("R16 Paperclip deployment lifecycle", () => {
  test("controller runtime cannot leak into the pinned Paperclip process runtime", () => {
    const base = plan(), unsafePin = { ...base.pin, runtimeExecutable: process.execPath };
    const body = { ...base, pin: unsafePin, planDigest: undefined };
    delete body.planDigest;
    expect(() => new PaperclipDeploymentLifecycle({ ...body, planDigest: paperclipDeploymentPlanDigest(body) } as PaperclipDeploymentPlan, new FakeNative(), trust, new MemoryPaperclipDeploymentStore())).toThrow("exactly pinned");
  });

  test("local start rejects launcher substitution before spawning", () => {
    const root = mkdtempSync(resolve(tmpdir(), "oa-launcher-"));
    try {
      mkdirSync(resolve(root, "source/server/node_modules/tsx/dist"), { recursive: true });
      mkdirSync(resolve(root, "source/server/src"), { recursive: true });
      writeFileSync(resolve(root, "source/server/node_modules/tsx/dist/cli.mjs"), "substituted\n");
      writeFileSync(resolve(root, "source/server/src/index.ts"), "entry\n");
      const base = plan(), runtimePin = { ...base.pin, executableDigest: hash("entry\n"), runtimeDigest: `sha256:${createHash("sha256").update(readFileSync("/usr/bin/node")).digest("hex")}`, runtimeVersion: spawnSync("/usr/bin/node", ["--version"], { encoding: "utf8" }).stdout.trim(), runtimeLauncherDigest: hash("expected launcher\n") };
      const body = { ...base, checkout: resolve(root, "source"), dataDir: resolve(root, "data"), pin: runtimePin, planDigest: undefined };
      delete body.planDigest;
      const localPlan = { ...body, planDigest: paperclipDeploymentPlanDigest(body) } as PaperclipDeploymentPlan;
      expect(() => new LocalPaperclipProcessPort().start(localPlan, 1)).toThrow("runtime invocation differs");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("workspace startup closure is explicit, copy-stable, and fails closed when plugin-sdk output is absent", () => {
    const left = mkdtempSync(resolve(tmpdir(), "oa-build-left-")), right = mkdtempSync(resolve(tmpdir(), "oa-build-right-"));
    const roots = ["packages/plugins/sdk/dist", "server/dist"];
    try {
      mkdirSync(resolve(left, "packages/plugins/sdk/dist"), { recursive: true });
      mkdirSync(resolve(left, "server/dist"), { recursive: true });
      writeFileSync(resolve(left, "packages/plugins/sdk/dist/index.js"), "export const sdk = 1;\n");
      writeFileSync(resolve(left, "server/dist/index.js"), "import '@paperclipai/plugin-sdk';\n");
      mkdirSync(resolve(right, "server/dist"), { recursive: true });
      writeFileSync(resolve(right, "server/dist/index.js"), "import '@paperclipai/plugin-sdk';\n");
      expect(() => paperclipWorkspaceBuildDigest(right, roots)).toThrow("packages/plugins/sdk/dist");
      mkdirSync(resolve(right, "packages/plugins/sdk/dist"), { recursive: true });
      writeFileSync(resolve(right, "packages/plugins/sdk/dist/index.js"), "export const sdk = 1;\n");
      const before = paperclipWorkspaceBuildDigest(left, roots);
      expect(paperclipWorkspaceBuildDigest(right, roots)).toBe(before);
      writeFileSync(resolve(right, "packages/plugins/sdk/dist/index.js"), "export const sdk = 2;\n");
      expect(paperclipWorkspaceBuildDigest(right, roots)).not.toBe(before);
    } finally { rmSync(left, { recursive: true, force: true }); rmSync(right, { recursive: true, force: true }); }
  });

  test("dependency archive digest is copy-stable and content-sensitive", () => {
    const left = mkdtempSync(resolve(tmpdir(), "oa-deps-left-")), right = mkdtempSync(resolve(tmpdir(), "oa-deps-right-"));
    try {
      mkdirSync(resolve(left, "node_modules/pkg"), { recursive: true });
      writeFileSync(resolve(left, "node_modules/pkg/index.js"), "export default 1;\n");
      const copied = spawnSync("bash", ["-c", "set -o pipefail; tar -C \"$1\" -cf - node_modules | tar --same-permissions -C \"$2\" -xf -", "_", left, right]);
      expect(copied.status).toBe(0);
      const before = paperclipDependencyTreeDigest(left);
      expect(paperclipDependencyTreeDigest(right)).toBe(before);
      writeFileSync(resolve(right, "node_modules/pkg/index.js"), "export default 2;\n");
      expect(paperclipDependencyTreeDigest(right)).not.toBe(before);
    } finally { rmSync(left, { recursive: true, force: true }); rmSync(right, { recursive: true, force: true }); }
  });

  test("dependency digest ignores hardlink topology but not bytes", () => {
    const left = mkdtempSync(resolve(tmpdir(), "oa-hardlink-left-")), right = mkdtempSync(resolve(tmpdir(), "oa-hardlink-right-"));
    try {
      mkdirSync(resolve(left, "node_modules/pkg"), { recursive: true }); mkdirSync(resolve(right, "node_modules/pkg"), { recursive: true });
      for (const name of ["a.js", "b.js"]) writeFileSync(resolve(left, `node_modules/pkg/${name}`), "same bytes\n");
      writeFileSync(resolve(right, "node_modules/pkg/a.js"), "same bytes\n"); linkSync(resolve(right, "node_modules/pkg/a.js"), resolve(right, "node_modules/pkg/b.js"));
      expect(paperclipDependencyTreeDigest(right)).toBe(paperclipDependencyTreeDigest(left));
      writeFileSync(resolve(right, "node_modules/pkg/b.js"), "changed\n");
      expect(paperclipDependencyTreeDigest(right)).not.toBe(paperclipDependencyTreeDigest(left));
    } finally { rmSync(left, { recursive: true, force: true }); rmSync(right, { recursive: true, force: true }); }
  });

  test("dependency digest binds every symlink path to its target", () => {
    const left = mkdtempSync(resolve(tmpdir(), "oa-links-left-")), right = mkdtempSync(resolve(tmpdir(), "oa-links-right-"));
    try {
      mkdirSync(resolve(left, "node_modules")); mkdirSync(resolve(right, "node_modules"));
      symlinkSync("target-x", resolve(left, "node_modules/a")); symlinkSync("target-y", resolve(left, "node_modules/b"));
      symlinkSync("target-y", resolve(right, "node_modules/a")); symlinkSync("target-x", resolve(right, "node_modules/b"));
      expect(paperclipDependencyTreeDigest(left)).not.toBe(paperclipDependencyTreeDigest(right));
    } finally { rmSync(left, { recursive: true, force: true }); rmSync(right, { recursive: true, force: true }); }
  });

  test("dependency digest preserves trailing newlines in symlink targets", () => {
    const left = mkdtempSync(resolve(tmpdir(), "oa-link-nl-left-")), right = mkdtempSync(resolve(tmpdir(), "oa-link-nl-right-"));
    try {
      mkdirSync(resolve(left, "node_modules")); mkdirSync(resolve(right, "node_modules"));
      symlinkSync("target", resolve(left, "node_modules/a")); symlinkSync("target\n", resolve(right, "node_modules/a"));
      expect(paperclipDependencyTreeDigest(left)).not.toBe(paperclipDependencyTreeDigest(right));
    } finally { rmSync(left, { recursive: true, force: true }); rmSync(right, { recursive: true, force: true }); }
  });

  test("dependency digest includes modes and empty directories", () => {
    const root = mkdtempSync(resolve(tmpdir(), "oa-modes-"));
    try {
      mkdirSync(resolve(root, "node_modules/pkg"), { recursive: true }); const file = resolve(root, "node_modules/pkg/tool"); writeFileSync(file, "tool\n"); chmodSync(file, 0o644);
      const base = paperclipDependencyTreeDigest(root); chmodSync(file, 0o755); expect(paperclipDependencyTreeDigest(root)).not.toBe(base);
      const executable = paperclipDependencyTreeDigest(root); mkdirSync(resolve(root, "node_modules/pkg/empty")); expect(paperclipDependencyTreeDigest(root)).not.toBe(executable);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("owns start, inspect, duplicate reconciliation, restart, and full teardown", () => {
    const { lifecycle, native, store } = fixture();
    const started = lifecycle.start("start-1");
    expect(started.status).toBe("running");
    expect(lifecycle.start("start-1").sequence).toBe(started.sequence);
    expect(native.calls.filter((x) => x.startsWith("start:")).length).toBe(1);
    const restarted = lifecycle.restart("restart-1");
    expect(restarted.fence).toBeGreaterThan(started.fence);
    expect(restarted.lifecycleGeneration).toBeGreaterThan(started.lifecycleGeneration);
    lifecycle.teardown("destroy-1");
    expect(native.calls.at(-1)).toBe("remove");
    expect(store.load(plan().deploymentId)).toMatchObject({ status: "destroyed" });
    expect(lifecycle.teardown("destroy-duplicate")).toMatchObject({ status: "destroyed" });
  });

  test("durable state survives controller restart and rejects stale fences and tampering", () => {
    const { lifecycle, native, store } = fixture();
    const started = lifecycle.start("start");
    const recovered = new PaperclipDeploymentLifecycle(plan(), native, trust, store);
    expect(recovered.inspect().state.sequence).toBe(started.sequence);
    expect(() => recovered.assertFence(started.fence - 1)).toThrow("stale");
    const raw = store.load(plan().deploymentId)!; raw.fence += 100;
    store.compareAndSwap(plan().deploymentId, raw.sequence, { ...raw, sequence: raw.sequence + 1 });
    expect(() => recovered.inspect()).toThrow("authentication");
  });

  test("disk CAS serializes simultaneous processes and reclaims a dead owner", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "oa-paperclip-cas-"));
    try {
      const first = new DiskPaperclipDeploymentStore(root), second = new DiskPaperclipDeploymentStore(root);
      const { lifecycle } = fixture();
      const initial = lifecycle.initialize();
      expect(first.compareAndSwap("shared", undefined, initial)).toBe(true);
      const script = `import { DiskPaperclipDeploymentStore } from './packages/core/src/organization-paperclip-deployment.ts'; const s=new DiskPaperclipDeploymentStore(process.argv[1]); const v=s.load('shared'); await Bun.sleep(100); v.sequence++; v.fence=Number(process.argv[2]); process.stdout.write(String(s.compareAndSwap('shared',v.sequence-1,v)));`;
      const children = [1, 2].map((fence) => Bun.spawn([process.execPath, "-e", script, root, String(fence)], { cwd: resolve(import.meta.dir, "../../.."), stdout: "pipe", stderr: "pipe" }));
      const results = await Promise.all(children.map(async (child) => { await child.exited; return new Response(child.stdout).text(); }));
      expect(results.filter((value) => value === "true")).toHaveLength(1);
      mkdirSync(resolve(root, "dead.json.lock"));
      writeFileSync(resolve(root, "dead.json.lock/owner.json"), JSON.stringify({ pid: 2_000_000_000, token: "dead" }));
      expect(first.compareAndSwap("dead", undefined, initial)).toBe(true);
      writeFileSync(resolve(root, "crash.json.999.tmp"), "partial");
      expect(second.compareAndSwap("crash", undefined, initial)).toBe(true);
      expect(second.load("crash")).toEqual(initial);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("partition never counts an unhealthy process as started", () => {
    const { lifecycle, native } = fixture(); native.partitioned = true;
    expect(() => lifecycle.start("partitioned-start")).toThrow("healthy");
  });

  test("backup loss and digest substitution fail closed", () => {
    const { lifecycle, native } = fixture(); lifecycle.start("start"); lifecycle.backup("b1", "/backup/b1"); native.data = "changed"; native.backups.clear();
    expect(() => lifecycle.restore("restore-lost")).toThrow("loss or substitution");
  });

  test("restore advances the checkpoint invalidation epoch", () => {
    const { lifecycle } = fixture(); const started = lifecycle.start("start"); lifecycle.backup("b", "/backup/b");
    const restored = lifecycle.restore("restore");
    expect(restored.restoreEpoch).toBe(started.restoreEpoch + 1);
    expect(restored.lifecycleGeneration).toBeGreaterThan(started.lifecycleGeneration);
  });

  test("durable backup intent resumes the process after crash-after-stop", () => {
    const { lifecycle, native } = fixture(); lifecycle.start("start"); native.failBackup = true;
    expect(() => lifecycle.backup("durable", "/backup/durable")).toThrow("crash");
    expect(native.running).toBe(false);
    const recovered = lifecycle.backup("durable", "/backup/durable");
    expect(recovered).toMatchObject({ status: "running", backupIntent: undefined, operation: { kind: "backup", phase: "verified" } });
    expect(native.running).toBe(true);
  });

  test("upgrade is exact-source and atomically rolls executable and data back on failure", () => {
    const { lifecycle, native } = fixture(); lifecycle.start("start"); native.data = "before"; native.failInstall = true;
    const result = lifecycle.upgrade("upgrade-2", pin("2"), "/backup/upgrade-2");
    expect(result.pin).toEqual(pin()); expect(native.data).toBe("before"); expect(native.running).toBe(true);
    expect(result.operation).toMatchObject({ kind: "rollback", phase: "verified" });
  });

  test("rejects operation-id equivocation", () => {
    const { lifecycle } = fixture(); lifecycle.start("same-id");
    expect(() => lifecycle.restart("same-id")).toThrow("equivocation");
  });

  test("a prepared durable claim rejects preemption across native side effects", () => {
    const { lifecycle, native, store } = fixture(); lifecycle.start("start");
    const contender = new PaperclipDeploymentLifecycle(plan(), native, trust, store);
    let rejected = "";
    native.onStop = () => { try { contender.restart("newer-restart"); } catch (error) { rejected = (error as Error).message; } };
    const completed = lifecycle.restart("claimed-restart");
    expect(rejected).toContain("owns the durable claim");
    const starts = native.calls.filter((value) => value.startsWith("start:"));
    expect(starts.at(-1)).toBe(`start:${completed.fence}`);
  });

  test("signed processFence always equals the actual PID launch fence", () => {
    const { lifecycle, native } = fixture();
    const started = lifecycle.start("start-a"); expect(started.processFence).toBe(native.launchFence);
    const reconciled = lifecycle.start("start-b"); expect(reconciled.processFence).toBe(started.processFence);
    expect(native.launchFence).toBe(started.processFence);
    const backedUp = lifecycle.backup("b", "/backup/fence"); expect(backedUp.processFence).toBe(native.launchFence);
    const restarted = lifecycle.restart("restart"); expect(restarted.processFence).toBe(native.launchFence);
    const restored = lifecycle.restore("restore"); expect(restored.processFence).toBe(native.launchFence);
    lifecycle.teardown("teardown"); expect(lifecycle.teardown("teardown-again").processFence).toBeNull();
  });

  test("restart adopts an owned PID after crash-after-start-before-state-commit", () => {
    const { lifecycle, native, store } = fixture(); lifecycle.start("start"); native.crashOnNextStartedInspect = true;
    expect(() => lifecycle.restart("crashy")).toThrow("crash after native start");
    const prepared = store.load(plan().deploymentId)!;
    expect(native.launchFence).toBe(prepared.fence);
    expect(prepared.processFence).not.toBe(native.launchFence);
    const recovered = new PaperclipDeploymentLifecycle(plan(), native, trust, store).restart("crashy");
    expect(recovered).toMatchObject({ processFence: native.launchFence, operation: { phase: "verified" } });
    expect(native.calls.filter((value) => value === `start:${native.launchFence}`).length).toBe(1);
  });

  test("backup cannot overwrite another prepared lifecycle claim", () => {
    const { lifecycle, native } = fixture(); lifecycle.start("start"); native.crashOnNextStartedInspect = true;
    expect(() => lifecycle.restart("prepared-restart")).toThrow("crash after native start");
    expect(() => lifecycle.backup("intruder", "/backup/intruder")).toThrow("owns the durable claim");
  });

  test("inspect rejects a PID whose launch fence differs from signed state", () => {
    const { lifecycle, native } = fixture(); lifecycle.start("start"); native.launchFence!++;
    expect(() => lifecycle.inspect()).toThrow("fence differs");
  });

  test("local stop rejects PID reuse by OS process-start identity", () => {
    const root = mkdtempSync(resolve(tmpdir(), "oa-paperclip-pid-")), child = Bun.spawn(["sleep", "60"]);
    try {
      mkdirSync(resolve(root, "data"));
      writeFileSync(resolve(root, "data/.open-autonomy-paperclip.pid"), JSON.stringify({ pid: child.pid, launchFence: 7, token: "owner", processStartToken: "substituted", startedAt: Date.now() }));
      const base = plan(), body = { ...base, deploymentId: "pid-test", dataDir: resolve(root, "data"), planDigest: undefined };
      delete body.planDigest;
      const ownedPlan = { ...body, planDigest: paperclipDeploymentPlanDigest(body) } as PaperclipDeploymentPlan;
      expect(() => new LocalPaperclipProcessPort().stop(ownedPlan, 7)).toThrow("ownership changed");
    } finally { child.kill(); rmSync(root, { recursive: true, force: true }); }
  });
});
