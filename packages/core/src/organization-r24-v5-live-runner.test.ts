import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  validateV5Attempt,
  V5ProcessTreeMeter,
  type V5PaperclipOuter,
  type V5SetupFailedAttempt,
} from "./organization-r24-v5-live-runner";
import { createV5Binding } from "./organization-r24-v5-protocol";
const d = "sha256:" + "a".repeat(64),
  binding = createV5Binding(
    {
      pairId: "pair",
      trialId: "trial",
      replication: 0,
      substrate: "paperclip",
      unitDigest: d,
      organizationDigest: d,
      behaviorDigest: d,
      controlDigest: d,
      workloadDigest: d,
      assignmentDigest: d,
      lockDigest: d,
      launcherSpecDigest: d,
    },
    "b".repeat(64),
  ),
  challenge = `sha256:${createHash("sha256").update(binding.nonce).digest("hex")}`;
function outer(): V5PaperclipOuter {
  return {
    provider: "paperclip",
    requestAt: "2026-07-15T00:00:00Z",
    configReadbackAt: "2026-07-15T00:00:01Z",
    configReadback: {
      agentId: "agent",
      command: "launcher",
      args: ["--oa-paperclip-dispatch"],
      challengeDigest: challenge,
    },
    issue: {
      id: "issue",
      assigneeAgentId: "agent",
      createdAt: "2026-07-15T00:00:01Z",
    },
    candidateRuns: [
      {
        id: "run",
        agentId: "agent",
        issueId: "issue",
        createdAt: "2026-07-15T00:00:02Z",
        processPid: null,
        status: "failed",
      },
    ],
    selectedRunId: "run",
    adapterInvoke: null,
    linkedIssueIds: ["issue"],
    logChallengeDigest: null,
  };
}
function setup(): V5SetupFailedAttempt {
  return {
    kind: "setup-failed",
    attemptId: "attempt-1",
    substrate: "paperclip",
    binding,
    startedAt: "2026-07-15T00:00:00Z",
    completedAt: "2026-07-15T00:00:03Z",
    providerRunId: "run",
    rawError: { code: "setup_failed" },
    configurationReadback: { command: "launcher" },
    spawnObserved: false,
    receiptLines: [],
    meter: {
      wallMs: 3000,
      cpuMs: null,
      maxRssKiB: null,
      provenance: "provider timestamps; no process spawned",
    },
    outer: outer(),
  };
}
describe("R24 V5 evidence-backed runner primitives", () => {
  test("retains a pre-spawn setup failure without inventing receipts or resource usage", () => {
    expect(validateV5Attempt(setup(), "unused")).toBeNull();
  });
  test("rejects ambiguous, stale, swapped, or falsely spawned setup attempts", () => {
    for (const mutate of [
      (x: V5SetupFailedAttempt) =>
        x.outer.provider === "paperclip" &&
        x.outer.candidateRuns.push({
          ...x.outer.candidateRuns[0]!,
          id: "run2",
        }),
      (x: V5SetupFailedAttempt) =>
        (x.outer.configReadbackAt = "2026-07-14T00:00:00Z"),
      (x: V5SetupFailedAttempt) => (x.providerRunId = "swapped"),
      (x: V5SetupFailedAttempt) => ((x as any).spawnObserved = true),
      (x: V5SetupFailedAttempt) => x.receiptLines.push("forged" as never),
    ]) {
      const x = setup();
      mutate(x);
      expect(() => validateV5Attempt(x, "unused")).toThrow();
    }
  });
  test("samples an external Linux process tree with nonnegative, provenance-labelled measures", async () => {
    const p = Bun.spawn(
        [
          process.execPath,
          "-e",
          "let x=0;for(let i=0;i<2e7;i++)x+=i;setTimeout(()=>{},250)",
        ],
        { stdout: "ignore", stderr: "ignore" },
      ),
      m = new V5ProcessTreeMeter(p.pid);
    await new Promise((r) => setTimeout(r, 50));
    m.sample();
    await p.exited;
    m.sample();
    const r = m.result();
    expect(r.wallMs).toBeGreaterThan(0);
    expect(r.cpuMs).toBeGreaterThanOrEqual(0);
    expect(r.maxRssKiB).toBeGreaterThanOrEqual(0);
    expect(r.provenance).toContain("/proc");
  });
});
