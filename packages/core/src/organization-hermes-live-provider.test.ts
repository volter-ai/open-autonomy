import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HermesLiveProvider,
  DiskHermesProviderStateStore,
  MemoryHermesProviderStateStore,
  ProcessHermesNativePort,
  type HermesDeploymentBundle,
  type HermesNativePort,
  type HermesNativeResult,
  type HermesProviderTrust,
  type HermesVersionPin,
} from "./organization-hermes-live-provider";

const sha = (character: string) => `sha256:${character.repeat(64)}`;
const pin = {
  release: "0.18.2",
  upstreamRevision: "bb5fc723",
  localRevision: "226e8de8",
  executableDigest: sha("a"),
};
const defaultConfiguration = { dispatchInGateway: false },
  defaultConfigurationDigest = `sha256:${createHash("sha256").update(JSON.stringify(defaultConfiguration)).digest("hex")}`;
const defaultManifest = {
  schema: "autonomy.hermes-provider-manifest.v1" as const,
  configuration: defaultConfiguration,
  implementation: [],
  workers: [
    {
      assignee: "default",
      r11Runtime: "portable-worker-v1",
      profileDigest: sha("f"),
    },
  ],
  hiddenState: [
    {
      path: "kanban/boards/oa-r15-test/kanban.db",
      kind: "durable" as const,
      includedInBackup: true,
    },
  ],
};
const bundle = (
  changes: Partial<HermesDeploymentBundle> = {},
): HermesDeploymentBundle => ({
  schema: "autonomy.hermes-live-deployment.v1",
  deploymentId: "deployment-r15",
  tenant: "tenant-r15",
  board: "oa-r15-test",
  home: "/isolated/hermes-home",
  defaultWorkdir: "/isolated/work",
  pin,
  configurationDigest: defaultConfigurationDigest,
  bundleDigest: sha("c"),
  manifest: defaultManifest,
  ...changes,
});
const trust: HermesProviderTrust = {
  signState: (value) => `signed:${value}`,
  verifyState: (value, signature) => signature === `signed:${value}`,
  verifyBackup: (path, digest, board) =>
    path.endsWith(".zip") && digest === sha("d") && board === "oa-r15-test",
};

class NativeFixture implements HermesNativePort {
  boards: Array<Record<string, unknown>> = [];
  tasks: Array<Record<string, unknown>> = [];
  calls: string[][] = [];
  suppressMutation = false;
  observedPin = structuredClone(pin);
  upgradeTarget?: HermesVersionPin;
  failUpgrade = false;
  dispatchSpawnWithoutMutation = false;
  executableDigest() {
    return this.observedPin.executableDigest;
  }
  artifactDigest() {
    return sha("d");
  }
  createBackup() {
    this.calls.push(["backup"]);
    return ok("backup created");
  }
  restoreBackup() {
    this.calls.push(["import"]);
    return ok("backup imported");
  }
  applyUpgrade(target: HermesVersionPin) {
    this.calls.push(["upgrade", target.localRevision]);
    if (this.failUpgrade) return fail("injected upgrade failure");
    this.upgradeTarget = structuredClone(target);
    this.observedPin = structuredClone(target);
    return ok("upgraded");
  }
  rollbackVersion(prior: HermesVersionPin) {
    this.calls.push(["rollback", prior.localRevision]);
    this.observedPin = structuredClone(prior);
    return ok("rolled back");
  }
  invoke(argv: string[], environment: Record<string, string>) {
    this.calls.push([...argv]);
    expect(environment).toMatchObject({
      HERMES_HOME: "/isolated/hermes-home",
      HERMES_KANBAN_BOARD: "oa-r15-test",
      HERMES_KANBAN_DISPATCH_IN_GATEWAY: "0",
    });
    if (argv[0] === "--version")
      return ok(
        `Hermes Agent v${this.observedPin.release} (fixture) · upstream ${this.observedPin.upstreamRevision} · local ${this.observedPin.localRevision}`,
      );
    if (argv.join(" ") === "kanban boards list --json")
      return ok(JSON.stringify(this.boards));
    if (argv[0] === "kanban" && argv[1] === "boards" && argv[2] === "create") {
      if (!this.suppressMutation)
        this.boards.push({
          slug: argv[3],
          name: "deployment-r15",
          description: "fixture",
          db_path: "/isolated/hermes-home/kanban.db",
          archived: false,
          counts: {},
          total: 0,
        });
      return ok("created");
    }
    if (argv.join(" ") === "kanban init") return ok("initialized");
    if (argv.join(" ") === "kanban list --json")
      return ok(JSON.stringify(this.tasks));
    if (argv[0] === "kanban" && argv[1] === "create") {
      const idempotency = argv[argv.indexOf("--idempotency-key") + 1]!,
        existing = this.tasks.find(
          (value) => value.idempotency === idempotency,
        );
      if (existing) return ok(JSON.stringify(existing));
      const task = {
        id: "t_fixture",
        title: argv[2],
        body: argv[argv.indexOf("--body") + 1],
        assignee: argv[argv.indexOf("--assignee") + 1],
        status: "ready",
        tenant: argv[argv.indexOf("--tenant") + 1],
        created_at: 1,
        result: null,
        idempotency,
      };
      if (!this.suppressMutation) this.tasks.push(task);
      return ok(JSON.stringify(task));
    }
    if (argv[0] === "kanban" && argv[1] === "show") {
      const task = this.tasks.find((value) => value.id === argv[2]);
      return task ? ok(JSON.stringify({ task })) : fail("missing task");
    }
    if (argv.join(" ") === "kanban dispatch --json")
      return ok(
        this.dispatchSpawnWithoutMutation
          ? '{"spawned":["ghost"]}'
          : '{"spawned":[]}',
      );
    if (argv.join(" ") === "kanban stats --json")
      return ok(JSON.stringify({ by_status: {}, now: 1 }));
    if (
      argv[0] === "kanban" &&
      argv[1] === "boards" &&
      argv[2] === "rm" &&
      argv[3] === "--delete"
    ) {
      if (!this.suppressMutation)
        this.boards = this.boards.filter((value) => value.slug !== argv[4]);
      return ok("removed");
    }
    return fail(`unsupported fixture command ${argv.join(" ")}`);
  }
}

const ok = (stdout: string): HermesNativeResult => ({
  code: 0,
  stdout,
  stderr: "",
});
const fail = (stderr: string): HermesNativeResult => ({
  code: 1,
  stdout: "",
  stderr,
});
const create = (native = new NativeFixture()) => ({
  native,
  provider: new HermesLiveProvider(
    bundle(),
    native,
    trust,
    new MemoryHermesProviderStateStore(),
    { PATH: "/bin" },
  ),
});

describe("R15 live Hermes provider bundle lifecycle", () => {
  test("discovers a digest/revision-pinned installation and deploys an isolated board idempotently", () => {
    const { native, provider } = create();
    expect(provider.deploy()).toMatchObject({
      deploymentId: "deployment-r15",
      board: "oa-r15-test",
      paused: false,
      version: pin,
    });
    expect(provider.deploy().sequence).toBe(1);
    expect(native.boards).toHaveLength(1);
    expect(
      () =>
        new HermesLiveProvider(
          bundle({ manifest: undefined }),
          native,
          trust,
          new MemoryHermesProviderStateStore(),
        ),
    ).toThrow(/manifest/);
  });

  test("rejects CLI success without an observed deployment mutation", () => {
    const { native, provider } = create();
    native.suppressMutation = true;
    expect(() => provider.deploy()).toThrow(/absent|ambiguous/);
  });

  test("creates idempotent durable work and verifies exact native post-state", () => {
    const { native, provider } = create();
    provider.deploy();
    const request = {
      idempotencyKey: "effect-1",
      title: "Implement the adapter",
      body: "Run the exact conformance suite",
      assignee: "default",
      maxRuntime: "5m",
      maxRetries: 2,
    };
    expect(provider.createWork(request).id).toBe("t_fixture");
    expect(provider.createWork(request).id).toBe("t_fixture");
    expect(native.tasks).toHaveLength(1);
    expect(() =>
      provider.createWork({ ...request, title: "equivocating title" }),
    ).toThrow(/equivocation/);
  });

  test("pause gates the sole dispatcher while Slack-capable gateway dispatch remains disabled", () => {
    const { provider } = create();
    provider.deploy();
    provider.pause();
    expect(() => provider.dispatchOnce()).toThrow(/paused/);
    provider.resume();
    const first = provider.dispatchOnce(),
      second = provider.dispatchOnce();
    expect(first).toMatchObject({ before: [], after: [] });
    expect(second.fence).toBeGreaterThan(first.fence);
    const broken = create();
    broken.provider.deploy();
    broken.native.dispatchSpawnWithoutMutation = true;
    expect(() => broken.provider.dispatchOnce()).toThrow(
      /without observed mutation/,
    );
  });

  test("retries teardown after native success and a lost control-store delete", () => {
    const native = new NativeFixture(),
      inner = new MemoryHermesProviderStateStore();
    let failDelete = true;
    const store = {
        load: (id: string) => inner.load(id),
        compareAndSwap: (id: string, e: number | undefined, n: any) =>
          inner.compareAndSwap(id, e, n),
        delete: (id: string, e: number) =>
          failDelete ? ((failDelete = false), false) : inner.delete(id, e),
      },
      provider = new HermesLiveProvider(bundle(), native, trust, store, {
        PATH: "/bin",
      });
    provider.deploy();
    expect(() => provider.teardown()).toThrow(/concurrent/);
    expect(native.boards).toEqual([]);
    expect(() => provider.teardown()).not.toThrow();
  });

  test("backs up, restores, reports health, and tears down only after observed state agrees", () => {
    const { native, provider } = create();
    provider.deploy();
    expect(provider.backup("/backups/r15.zip").backup?.digest).toBe(sha("d"));
    expect(provider.restore()).toEqual([]);
    expect(provider.health()).toMatchObject({
      healthy: false,
      paused: false,
      residuals: expect.any(Array),
    });
    provider.teardown();
    expect(native.boards).toEqual([]);
    expect(() => provider.health()).toThrow(/absent/);
  });

  test("upgrades to an exact installation pin and rolls version back on failure", () => {
    const successful = create();
    successful.provider.deploy();
    const target: HermesVersionPin = {
      release: "0.19.0",
      upstreamRevision: "bbbbbbbb",
      localRevision: "cccccccc",
      executableDigest: sha("e"),
    };
    expect(
      successful.provider.upgrade(target, "/backups/pre-upgrade.zip").version,
    ).toEqual(target);
    expect(successful.provider.health().version).toEqual(target);

    const failed = create();
    failed.provider.deploy();
    failed.native.failUpgrade = true;
    expect(() =>
      failed.provider.upgrade(target, "/backups/pre-failure.zip"),
    ).toThrow(/update command failed/);
    expect(failed.native.calls).toContainEqual(["rollback", pin.localRevision]);
    expect(failed.provider.health().version).toEqual(pin);
  });

  test("rejects executable substitution before any deployment mutation", () => {
    const native = new NativeFixture();
    native.executableDigest = () => sha("f");
    const provider = new HermesLiveProvider(
      bundle(),
      native,
      trust,
      new MemoryHermesProviderStateStore(),
    );
    expect(() => provider.deploy()).toThrow(/executable digest/);
    expect(native.calls).toEqual([]);
  });
  test("recovers atomic disk state across restart and closes Slack, R11, and authenticated event contracts", () => {
    const root = mkdtempSync(join(tmpdir(), "oa-r15-durable-"));
    try {
      const native = new NativeFixture(),
        manifest = {
          schema: "autonomy.hermes-provider-manifest.v1" as const,
          configuration: { dispatchInGateway: false },
          implementation: [],
          workers: [
            {
              assignee: "default",
              r11Runtime: "portable-worker-v1",
              profileDigest: sha("f"),
            },
          ],
          slack: {
            gatewayProfile: "manager",
            channelAllowlist: ["C1"],
            credentialRef: "secret://slack",
          },
          hiddenState: [
            {
              path: "kanban/boards/oa-r15-test/kanban.db",
              kind: "durable" as const,
              includedInBackup: true,
            },
          ],
        },
        configurationDigest = `sha256:${createHash("sha256").update(JSON.stringify(manifest.configuration)).digest("hex")}`,
        b = bundle({ manifest, configurationDigest }),
        sent: string[] = [],
        slack = {
          verify: (x: any) => x.signature === `signed:${x.eventId}`,
          send: (x: any) => {
            sent.push(x.deliveryId);
            return { externalId: `slack:${x.deliveryId}` };
          },
          health: () => true,
        },
        worker = {
          launch: (x: any) => ({
            executionId: `exec:${x.workId}:${x.fence}`,
            sessionId: "session-1",
          }),
          health: () => true,
        };
      let nativeEvents: any[] = [];
      const events = {
          read: (after: number) => nativeEvents.filter((x) => x.cursor > after),
          verify: (x: any) => x.signature === `signed:${x.id}`,
          health: () => true,
        },
        store = new DiskHermesProviderStateStore(root),
        p = new HermesLiveProvider(
          b,
          native,
          trust,
          store,
          { PATH: "/bin" },
          "owner-a",
          { slack, worker, events },
        );
      p.deploy();
      p.createWork({
        idempotencyKey: "integration-work",
        title: "Fixture work",
        body: "body",
        assignee: "default",
        maxRuntime: "1m",
        maxRetries: 1,
      });
      const restarted = new HermesLiveProvider(
        b,
        native,
        trust,
        new DiskHermesProviderStateStore(root),
        { PATH: "/bin" },
        "owner-b",
        { slack, worker, events },
      );
      expect(restarted.health().components).toMatchObject({
        controlStore: true,
        workers: true,
        slack: true,
        eventLift: true,
      });
      expect(restarted.health().healthy).toBe(true);
      expect(restarted.health().residuals).toEqual([]);
      expect(restarted.health().compatibilityFailures).toEqual([]);
      const inbound = {
        eventId: "e1",
        channel: "C1",
        thread: "T1",
        user: "U1",
        at: "2026-07-15T00:00:00Z",
        text: "approve",
        kind: "decision" as const,
        workId: "t_fixture",
        decision: "approve" as const,
        signature: "signed:e1",
      };
      restarted.handleSlack(inbound);
      restarted.handleSlack(inbound);
      expect(() =>
        restarted.handleSlack({ ...inbound, text: "reject" }),
      ).toThrow(/equivocation/);
      expect(
        restarted.sendSlack({
          deliveryId: "d1",
          channel: "C1",
          thread: "T1",
          text: "ok",
        }).externalId,
      ).toBe("slack:d1");
      expect(
        restarted.sendSlack({
          deliveryId: "d1",
          channel: "C1",
          thread: "T1",
          text: "ok",
        }).externalId,
      ).toBe("slack:d1");
      expect(() =>
        restarted.sendSlack({
          deliveryId: "d1",
          channel: "C1",
          thread: "T1",
          text: "changed",
        }),
      ).toThrow(/equivocation/);
      expect(sent).toEqual(["d1"]);
      const launched = restarted.launchR11("t_fixture", "default");
      expect(launched.sessionId).toBe("session-1");
      expect(restarted.launchR11("t_fixture", "default").executionId).toBe(
        launched.executionId,
      );
      expect(() =>
        restarted.acceptR11Completion({
          workId: "t_fixture",
          executionId: launched.executionId,
          fence: launched.fence - 1,
        }),
      ).toThrow(/stale/);
      expect(
        restarted.acceptR11Completion({
          workId: "t_fixture",
          executionId: launched.executionId,
          fence: launched.fence,
        }).sessionId,
      ).toBe("session-1");
      const eventBase = {
          cursor: 1,
          id: "n1",
          kind: "created",
          taskId: "t_fixture",
          at: "2026-07-15T00:00:00Z",
          actor: "hermes",
          payload: { title: "x" },
        },
        eventDigest = `sha256:${createHash("sha256")
          .update(
            JSON.stringify({
              actor: "hermes",
              at: "2026-07-15T00:00:00Z",
              cursor: 1,
              id: "n1",
              kind: "created",
              payload: { title: "x" },
              taskId: "t_fixture",
            }),
          )
          .digest("hex")}`;
      nativeEvents = [
        { ...eventBase, digest: eventDigest, signature: "signed:n1" },
      ];
      expect(restarted.liftEvents()?.at(-1)).toMatchObject({
        type: "work.created",
        subject: "t_fixture",
      });
      expect(restarted.liftEvents()).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const hermesExecutable = "/home/porta/.local/bin/hermes";
test.skipIf(
  process.env.OA_HERMES_LIVE !== "1" || !existsSync(hermesExecutable),
)(
  "R15 identified local Hermes process interop deploys, observes, and tears down an isolated native board",
  () => {
    const root = mkdtempSync(join(tmpdir(), "oa-r15-live-")),
      work = join(root, "work"),
      versionOutput = execFileSync(hermesExecutable, ["--version"], {
        encoding: "utf8",
      }),
      liveUpstream = /upstream ([a-f0-9]+)/.exec(versionOutput)?.[1];
    if (!liveUpstream)
      throw new Error("live Hermes upstream revision is absent");
    mkdirSync(work);
    const fileDigest = (path: string) =>
        `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`,
      liveBundle = bundle({
        deploymentId: "oa-r15-live-test",
        board: "oa-r15-live-test",
        home: root,
        defaultWorkdir: work,
        pin: {
          release: "0.18.2",
          upstreamRevision: liveUpstream,
          localRevision: "226e8de8",
          executableDigest: fileDigest(hermesExecutable),
        },
      }),
      native = new ProcessHermesNativePort(
        hermesExecutable,
        () => fileDigest(hermesExecutable),
        fileDigest,
      ),
      provider = new HermesLiveProvider(
        liveBundle,
        native,
        trust,
        new MemoryHermesProviderStateStore(),
        { PATH: process.env.PATH ?? "" },
      );
    try {
      provider.deploy();
      const task = provider.createWork({
        idempotencyKey: "live-effect-1",
        title: "R15 live conformance probe",
        body: "No worker is dispatched by this probe.",
        assignee: "default",
        maxRuntime: "1m",
        maxRetries: 1,
      });
      expect(task).toMatchObject({
        title: "R15 live conformance probe",
        tenant: "tenant-r15",
        status: "ready",
      });
      expect(provider.health()).toMatchObject({
        healthy: false,
        board: { slug: "oa-r15-live-test", total: 1 },
      });
      provider.teardown();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  120_000,
);
