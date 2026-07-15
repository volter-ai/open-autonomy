import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";
const launcher = join(import.meta.dir, "organization-r24-v5-launcher.cjs"),
  worker = join(import.meta.dir, "organization-r24-v5-outcome-worker.cjs"),
  roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((x) => rmSync(x, { recursive: true, force: true })),
);
const sha = (b: string | Buffer) =>
    `sha256:${createHash("sha256").update(b).digest("hex")}`,
  file = (p: string) => sha(readFileSync(p));
function fixture(substrate: "hermes" | "paperclip" = "paperclip") {
  const root = mkdtempSync(join(tmpdir(), "oa-r24-v5-launcher-"));
  roots.push(root);
  const fake = join(root, "real-hermes.cjs"),
    hermesHome = join(root, "hermes"),
    profileHome = join(hermesHome, "profiles", "worker"),
    toolRoot = join(root, "tools"),
    config = join(hermesHome, "config.yaml"),
    profile = join(profileHome, "profile.yaml"),
    skill = join(hermesHome, "skills", "r24-outcome.md"),
    tool = join(toolRoot, "terminal.json"),
    key = join(root, "key");
  mkdirSync(profileHome, { recursive: true });
  mkdirSync(join(hermesHome, "skills"), { recursive: true });
  mkdirSync(toolRoot, { recursive: true });
  writeFileSync(
    fake,
    '#!/usr/bin/env node\nconst argv=process.argv.slice(2),token=process.env.OPENROUTER_API_KEY;process.stdout.write(JSON.stringify({argv,hermesBin:process.env.HERMES_BIN??null,ambient:process.env.SHOULD_NOT_PROPAGATE??null,home:process.env.HOME,hermesHome:process.env.HERMES_HOME,envKeys:Object.keys(process.env).sort(),tokenPresent:Boolean(token)})+"\\n");if(argv.includes("leak-secret"))process.stdout.write(token+"\\n")\n',
  );
  chmodSync(fake, 0o700);
  writeFileSync(config, "version: 1\n");
  writeFileSync(profile, "model: pinned/model\ntoolsets: [terminal]\n");
  writeFileSync(skill, "# r24 outcome\n");
  writeFileSync(tool, '{"name":"terminal"}\n');
  writeFileSync(key, "k".repeat(64), { mode: 0o600 });
  const binding = {
      schema: "autonomy.r24-cell-binding.v5",
      pairId: "pair",
      trialId: "trial",
      replication: 0,
      substrate,
      unitDigest: "sha256:" + "1".repeat(64),
      organizationDigest: "sha256:" + "2".repeat(64),
      behaviorDigest: "sha256:" + "3".repeat(64),
      controlDigest: "sha256:" + "4".repeat(64),
      workloadDigest: "sha256:" + "5".repeat(64),
      assignmentDigest: "sha256:" + "6".repeat(64),
      lockDigest: "sha256:" + "7".repeat(64),
      launcherSpecDigest: "sha256:" + "0".repeat(64),
      nonce: "8".repeat(64),
    },
    query = "execute the authenticated R24 cell",
    toolsets = ["terminal"],
    skills = ["r24-outcome"],
    spec: any = {
      schema: "autonomy.r24-launcher-spec.v5",
      realHermes: fake,
      interpreter: Bun.which("node")!,
      profile: "worker",
      model: "pinned/model",
      toolsets,
      skills,
      query,
      allowedEnvKeys: ["HOME", "HERMES_HOME"],
      canonicalEnv: {
        HOME: root,
        HERMES_HOME: hermesHome,
      },
      secretCommitments: {},
      stack: {
        cellRoot: root,
        hermesHome,
        profileHome,
        toolRoot,
        configFile: { path: config, digest: file(config) },
        profileFiles: [{ path: profile, digest: file(profile) }],
        skillFiles: [{ path: skill, digest: file(skill) }],
        toolFiles: [{ path: tool, digest: file(tool) }],
      },
      digests: {
        launcher: file(launcher),
        runtime: file(Bun.which("node")!),
        realHermes: file(fake),
        interpreter: file(Bun.which("node")!),
        profile: sha(
          canonicalSemanticJson([{ path: profile, digest: file(profile) }]),
        ),
        model: sha("pinned/model"),
        tools: sha(canonicalSemanticJson([{ path: tool, digest: file(tool) }])),
        skills: sha(
          canonicalSemanticJson([{ path: skill, digest: file(skill) }]),
        ),
        query: sha(query),
      },
    };
  binding.launcherSpecDigest = sha(canonicalSemanticJson(spec));
  const env = {
    ...process.env,
    OA_R24_BINDING: JSON.stringify(binding),
    OA_R24_LAUNCHER_SPEC: JSON.stringify(spec),
    OA_R24_SUBSTRATE: substrate,
    OA_R24_RECEIPT_KEY_FILE: key,
    HERMES_BIN: "must-not-propagate",
    SHOULD_NOT_PROPAGATE: "ambient",
  };
  return { root, fake, profile, key, binding, spec, env };
}
describe("R24 V5 transparent locked launcher", () => {
  test("records Paperclip native input, consumes one-use key, unsets HERMES_BIN, and runs exact pinned canonical argv", () => {
    const f = fixture(),
      r = Bun.spawnSync([launcher, "--oa-paperclip-dispatch"], { env: f.env });
    expect(r.exitCode).toBe(0);
    expect(existsSync(f.key)).toBe(false);
    const lines = r.stdout.toString().trim().split("\n"),
      receipts = lines
        .filter((x) => x.startsWith("OA_R24_RECEIPT "))
        .map((x) => JSON.parse(x.slice(15))),
      child = JSON.parse(lines.find((x) => x.startsWith("{"))!);
    expect(receipts.map((x) => x.phase)).toEqual(["start", "result"]);
    expect(receipts[0].originalInput.originalArgv).toEqual([
      "--oa-paperclip-dispatch",
    ]);
    expect(receipts[0].originalInput.normalization.grammar).toBe(
      "paperclip-process-v5",
    );
    expect(child.hermesBin).toBeNull();
    expect(child.ambient).toBeNull();
    expect(child.home).toBe(f.spec.canonicalEnv.HOME);
    expect(child.hermesHome).toBe(f.spec.stack.hermesHome);
    expect(child.envKeys).toEqual(["HERMES_HOME", "HOME"]);
    expect(child.argv).toEqual([
      "-p",
      "worker",
      "--cli",
      "--accept-hooks",
      "--skills",
      "r24-outcome",
      "-m",
      "pinned/model",
      "--toolsets",
      "terminal",
      "chat",
      "-q",
      f.spec.query,
    ]);
  });
  test("passes only committed secrets and never records their bytes", () => {
    const f = fixture(),
      secret = "provider-secret-value";
    f.spec.allowedEnvKeys.push("OPENROUTER_API_KEY");
    f.spec.secretCommitments.OPENROUTER_API_KEY = sha(secret);
    f.binding.launcherSpecDigest = sha(canonicalSemanticJson(f.spec));
    f.env.OA_R24_BINDING = JSON.stringify(f.binding);
    (f.env as Record<string, string | undefined>).OPENROUTER_API_KEY = secret;
    f.env.OA_R24_LAUNCHER_SPEC = JSON.stringify(f.spec);
    const r = Bun.spawnSync([launcher, "--oa-paperclip-dispatch"], {
      env: f.env,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).not.toContain(secret);
    const start = JSON.parse(
      r.stdout
        .toString()
        .split("\n")
        .find((x) => x.startsWith("OA_R24_RECEIPT "))!
        .slice(15),
    );
    expect(start.originalInput.secretCommitments.OPENROUTER_API_KEY).toBe(
      sha(secret),
    );
    const leaking = fixture();
    leaking.spec.query = "leak-secret";
    leaking.spec.digests.query = sha("leak-secret");
    leaking.spec.allowedEnvKeys.push("OPENROUTER_API_KEY");
    leaking.spec.secretCommitments.OPENROUTER_API_KEY = sha(secret);
    leaking.binding.launcherSpecDigest = sha(canonicalSemanticJson(leaking.spec));
    leaking.env.OA_R24_BINDING = JSON.stringify(leaking.binding);
    (leaking.env as Record<string, string | undefined>).OPENROUTER_API_KEY =
      secret;
    leaking.env.OA_R24_LAUNCHER_SPEC = JSON.stringify(leaking.spec);
    const rejected = Bun.spawnSync([launcher, "--oa-paperclip-dispatch"], {
      env: leaking.env,
    });
    expect(rejected.exitCode).toBe(65);
    expect(rejected.stdout.toString()).not.toContain(secret);
  });
  test("rejects ambient-env ambiguity and disconnected or mutated stack pins", () => {
    const cases: Array<(f: ReturnType<typeof fixture>) => void> = [
      (f) => f.spec.allowedEnvKeys.push("HOME"),
      (f) => {
        f.spec.canonicalEnv.EXTRA = "undeclared";
      },
      (f) => {
        delete f.spec.canonicalEnv.HERMES_HOME;
      },
      (f) => {
        f.spec.canonicalEnv.HERMES_HOME = "/tmp/global-hermes";
      },
      (f) => {
        f.spec.stack.profileHome = f.root;
      },
      (f) => {
        f.spec.stack.skillFiles = [];
      },
      (f) => {
        f.spec.stack.toolFiles.push(f.spec.stack.toolFiles[0]);
      },
      (f) => {
        writeFileSync(f.spec.stack.configFile.path, "mutated: true\n");
      },
      (f) => {
        writeFileSync(f.spec.stack.skillFiles[0].path, "mutated skill\n");
      },
      (f) => {
        writeFileSync(f.spec.stack.toolFiles[0].path, "mutated tool\n");
      },
    ];
    for (const mutate of cases) {
      const f = fixture();
      mutate(f);
      f.env.OA_R24_LAUNCHER_SPEC = JSON.stringify(f.spec);
      expect(
        Bun.spawnSync([launcher, "--oa-paperclip-dispatch"], { env: f.env })
          .exitCode,
      ).toBe(64);
    }
  });
  test("accepts only exact documented Hermes grammar and rejects altered profile/model/toolsets/task query", () => {
    const mutations = [
      (x: string[]) => x,
      (x: string[]) => {
        x[1] = "evil";
        return x;
      },
      (x: string[]) => {
        x[7] = "other/model";
        return x;
      },
      (x: string[]) => {
        x[9] = "terminal,web";
        return x;
      },
      (x: string[]) => {
        x[13] = "freeform";
        return x;
      },
    ];
    for (let i = 0; i < mutations.length; i++) {
      const f = fixture("hermes"),
        base = [
          "-p",
          "worker",
          "--cli",
          "--accept-hooks",
          "--skills",
          "r24-outcome",
          "-m",
          "pinned/model",
          "--toolsets",
          "terminal",
          "chat",
          "-q",
          "work kanban task t_123",
        ],
        r = Bun.spawnSync([launcher, ...mutations[i]!([...base])], {
          env: f.env,
        });
      expect(r.exitCode).toBe(i === 0 ? 0 : 64);
    }
  });
  test("rejects tampered byte pins and unsafe/reused receipt keys", () => {
    let f = fixture();
    f.spec.digests.profile = "sha256:" + "0".repeat(64);
    let r = Bun.spawnSync([launcher, "--oa-paperclip-dispatch"], {
      env: { ...f.env, OA_R24_LAUNCHER_SPEC: JSON.stringify(f.spec) },
    });
    expect(r.exitCode).toBe(64);
    f = fixture();
    chmodSync(f.key, 0o644);
    r = Bun.spawnSync([launcher, "--oa-paperclip-dispatch"], { env: f.env });
    expect(r.exitCode).toBe(64);
    f = fixture();
    r = Bun.spawnSync([launcher, "--oa-paperclip-dispatch"], { env: f.env });
    expect(r.exitCode).toBe(0);
    expect(
      Bun.spawnSync([launcher, "--oa-paperclip-dispatch"], { env: f.env })
        .exitCode,
    ).toBe(64);
  });
});
describe("R24 V5 deterministic idempotent outcome worker", () => {
  test("replays identical result and rejects nonce equivocation", () => {
    const root = mkdtempSync(join(tmpdir(), "oa-r24-v5-worker-"));
    roots.push(root);
    const b = { nonce: "a".repeat(64), x: 1 },
      env = { ...process.env, OA_R24_IDEMPOTENCY_ROOT: root },
      run = (m: string) =>
        Bun.spawnSync([worker, "--mode", m, "--binding", JSON.stringify(b)], {
          env,
        });
    const a = run("success"),
      again = run("success"),
      bad = run("failure");
    expect(a.exitCode).toBe(0);
    expect(again.stdout.toString()).toBe(a.stdout.toString());
    expect(bad.exitCode).not.toBe(17);
    expect(bad.stderr.toString()).toContain("idempotency equivocation");
  });
  test("timeout worker remains live until its process group is killed, then has no live group", async () => {
    const root = mkdtempSync(join(tmpdir(), "oa-r24-v5-worker-"));
    roots.push(root);
    const b = { nonce: "b".repeat(64) },
      p = Bun.spawn(
        [worker, "--mode", "timeout", "--binding", JSON.stringify(b)],
        {
          env: { ...process.env, OA_R24_IDEMPOTENCY_ROOT: root },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
    await new Promise((r) => setTimeout(r, 80));
    expect(p.exitCode).toBeNull();
    process.kill(p.pid, "SIGTERM");
    await p.exited;
    expect(() => process.kill(p.pid, 0)).toThrow();
  });
});
