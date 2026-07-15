import { expect, test } from "bun:test";
import {
  V5_NEGATIVE_CONTROLS,
  V5_REQUIRED_LOCKS,
  r24V5ArtifactDigest,
  verifyR24V5LiveArtifact,
  type V5LiveArtifact,
} from "./organization-r24-v5-live-acceptance-contract";
const d = "sha256:" + "a".repeat(64);
const replay = (id: any, input: string) =>
  input === `mutation:${id}` ? `rejected:${id}` : "not-rejected";
const derive = (c: any) => ({
  runId: c.native.runId,
  workId: c.native.workId,
  pid: c.native.pid,
  bindingDigest: c.bindingDigest,
  challengeDigest: c.challengeDigest,
  launcherDigest: d,
  receiptAuthenticated: true,
});
function artifact() {
  const cells: any[] = [];
  const assignments = [
    {
      unitId: "u",
      replication: 0,
      pairId: "p0",
      trialId: "t0",
      first: "hermes",
    },
    {
      unitId: "u",
      replication: 1,
      pairId: "p1",
      trialId: "t1",
      first: "paperclip",
    },
  ];
  for (let r = 0; r < 2; r++) {
    const order: any[] = r
      ? [
          ["paperclip", 0],
          ["hermes", 1],
        ]
      : [
          ["hermes", 0],
          ["paperclip", 1],
        ];
    for (const [s, o] of order) {
      const raw = {
          revision: "revision",
          configurationReadback: `config ${d}`,
          dispatch: "dispatch",
          command: `command ${d}`,
          log: "log",
          receipt: `receipt ${d} ${d}`,
          terminal: "terminal",
        },
        ev = (x: string) => r24V5ArtifactDigest(x as any);
      cells.push({
        pairId: `p${r}`,
        trialId: `t${r}`,
        replication: r,
        unitId: "u",
        substrate: s,
        order: o,
        bindingDigest: d,
        challengeDigest: d,
        isolationId: `iso-${r}-${s}`,
        manualAssistance: "none",
        native: {
          provider: s === "hermes" ? "hermes-kanban" : "paperclip-heartbeat",
          derivation:
            s === "hermes"
              ? "verified-hermes-native-v1"
              : "verified-paperclip-native-v1",
          revisionDigest: ev(raw.revision),
          configurationReadbackDigest: ev(raw.configurationReadback),
          dispatchDigest: ev(raw.dispatch),
          runId: `run-${r}-${s}`,
          workId: `work-${r}`,
          pid: 10 + r,
          processGroup: 10 + r,
          commandDigest: ev(raw.command),
          logDigest: ev(raw.log),
          receiptDigest: ev(raw.receipt),
          receiptBindingDigest: d,
          configurationChallengeDigest: d,
          receiptChallengeDigest: d,
          commandLauncherDigest: d,
          terminalDigest: ev(raw.terminal),
          rawEvidence: raw,
          concurrentCandidateRunIds: [],
        },
        attempts: [
          {
            id: "a",
            nativeRunId: `run-${r}-${s}`,
            startReceiptDigest: d,
            resultReceiptDigest: d,
            startedAt: "2026-07-15T00:00:01Z",
            finishedAt: "2026-07-15T00:00:02Z",
          },
        ],
        terminal: {
          status: "success",
          exitCode: 0,
          signal: null,
          termAt: null,
          killAt: null,
          descendantsObserved: [10 + r],
          aliveAfterTerminal: [],
          reaped: true,
          startedAt: "2026-07-15T00:00:00Z",
          finishedAt: "2026-07-15T00:00:03Z",
        },
        meters: {
          wall: { value: 1, method: "clock", evidenceDigest: d },
          cpu: { value: 1, method: "rusage", evidenceDigest: d },
          maxRss: { value: 1, method: "rusage", evidenceDigest: d },
        },
        locks: V5_REQUIRED_LOCKS.map((path) => ({
          path,
          digest: d,
          application: "enforced",
          evidenceDigest: d,
        })),
        preservation: V5_REQUIRED_LOCKS.map((path) => ({
          path,
          disposition: "preserved",
          rationale: "exact",
          evidenceDigest: d,
        })),
        cleanup: {
          status: "deleted",
          evidenceDigest: d,
          unownedStateDigestBefore: d,
          unownedStateDigestAfter: d,
        },
      });
    }
  }
  const body: any = {
    schema: "autonomy.r24-v5-live-acceptance.v1",
    plan: {
      seed: "73",
      units: ["u"],
      replications: 2,
      assignments,
      launcherDigest: d,
      assignmentDigest: r24V5ArtifactDigest({ seed: "73", assignments } as any),
    },
    cells,
    negativeControls: V5_NEGATIVE_CONTROLS.map((id) => ({
      id,
      mutationInput: `mutation:${id}`,
      mutationDigest: r24V5ArtifactDigest(`mutation:${id}` as any),
      observedRejection: `rejected:${id}`,
      evidenceRaw: `evidence:${id}`,
      evidenceDigest: r24V5ArtifactDigest(`evidence:${id}` as any),
    })),
    generatedAt: "2026-07-15T00:00:00Z",
  };
  return { ...body, digest: r24V5ArtifactDigest(body) } as V5LiveArtifact;
}
test("accepts only a complete matched native V5 artifact", () =>
  expect(verifyR24V5LiveArtifact(artifact(), replay, derive)).toBe(true));
test("fails closed across plan, provenance, attempts, timeout, meters, locks, preservation, cleanup, assistance, controls and digest", () => {
  const muts = [
    (a: any) => a.plan.units.push("u"),
    (a: any) => (a.plan.replications = 2.5),
    (a: any) => (a.plan.assignments[0].trialId = "duplicate"),
    (a: any) => (a.plan.assignmentDigest = d),
    (a: any) => (a.cells[1].native.workId = "other-work"),
    (a: any) => (a.cells[1].challengeDigest = "sha256:" + "b".repeat(64)),
    (a: any) =>
      (a.cells[0].native.receiptBindingDigest = "sha256:" + "b".repeat(64)),
    (a: any) =>
      (a.cells[0].native.commandLauncherDigest = "sha256:" + "b".repeat(64)),
    (a: any) => (a.cells[0].attempts[0].finishedAt = "not-a-date"),
    (a: any) => (a.cells[0].terminal.exitCode = 3),
    (a: any) => a.cells[0].locks.push(a.cells[0].locks[0]),
    (a: any) => a.cells[0].preservation.push(a.cells[0].preservation[0]),
    (a: any) => a.cells.pop(),
    (a: any) => (a.cells[2].order = 1),
    (a: any) => (a.cells[0].native.logDigest = "x"),
    (a: any) => (a.cells[0].native.rawEvidence.log = "tampered raw log"),
    (a: any) => a.cells[0].attempts.push(a.cells[0].attempts[0]),
    (a: any) => {
      a.cells[0].terminal.status = "timeout";
      a.cells[0].terminal.signal = null;
      a.cells[0].attempts[0].resultReceiptDigest = null;
    },
    (a: any) => (a.cells[0].terminal.aliveAfterTerminal = [99]),
    (a: any) => (a.cells[0].meters.cpu.value = -1),
    (a: any) => a.cells[0].locks.pop(),
    (a: any) => (a.cells[0].preservation = []),
    (a: any) =>
      (a.cells[0].cleanup.unownedStateDigestAfter = "sha256:" + "b".repeat(64)),
    (a: any) => (a.cells[0].manualAssistance = "one-minute"),
    (a: any) => a.negativeControls.pop(),
    (a: any) => (a.negativeControls[0].mutationInput = "different mutation"),
    (a: any) => (a.negativeControls[0].observedRejection = "accepted"),
    (a: any) => (a.digest = "sha256:" + "b".repeat(64)),
  ];
  for (const [i, m] of muts.entries()) {
    const a: any = artifact();
    m(a);
    if (i < muts.length - 1)
      a.digest = r24V5ArtifactDigest((({ digest, ...x }: any) => x)(a));
    expect(() => verifyR24V5LiveArtifact(a, replay, derive)).toThrow();
  }
  expect(() =>
    verifyR24V5LiveArtifact(artifact(), replay, (c: any) => ({
      ...derive(c),
      receiptAuthenticated: false,
    })),
  ).toThrow("derivation replay");
});
