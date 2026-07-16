import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  runR24TwinMatchedEngineering,
  verifyR24TwinMatchedEngineering,
  type R24EngineeringBinding,
  type R24NativeEngineeringPath,
  type R24NativeRequest,
} from "./organization-r24-twin-matched-engineering";
const d = (x: unknown) =>
    `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}` as const,
  binding: R24EngineeringBinding = {
    schema: "autonomy.r24-engineering-binding.v1",
    campaignId: "matched-1",
    organizationDigest: d("organization"),
    workloadDigest: d("workload"),
    assignmentDigest: d("assignment"),
    repositoryDigest: d("repository"),
    harnessDigest: d("harness"),
    modelDigest: d("model"),
    promptDigest: d("prompt"),
    contextDigest: d("context"),
    sessionPolicyDigest: d("session"),
    credentialScopeDigest: d("credentials"),
    serviceTwin: {
      implementationDigest: d("service-twin-v1"),
      scenarioDigest: d("scenario-7"),
    },
  };
class Path implements R24NativeEngineeringPath {
  requests: R24NativeRequest[] = [];
  readonly nativePath;
  readonly pin;
  constructor(readonly substrate: "hermes" | "paperclip") {
    this.nativePath =
      substrate === "hermes"
        ? ("hermes-kanban-worker" as const)
        : ("paperclip-issue-process-adapter" as const);
    this.pin =
      substrate === "hermes"
        ? { version: "0.18.2", revision: "0c1adb48" }
        : {
            version: "0.3.1",
            revision: "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
          };
  }
  async run(r: R24NativeRequest) {
    this.requests.push(r);
    return {
      schema: "autonomy.r24-native-engineering-receipt.v1" as const,
      substrate: this.substrate,
      nativePath: this.nativePath,
      providerVersion: this.pin.version,
      providerRevision: this.pin.revision,
      trialId: r.trialId,
      order: r.order,
      bindingDigest: d(r.binding),
      organizationDigest: r.binding.organizationDigest,
      workloadDigest: r.binding.workloadDigest,
      serviceTwinImplementationDigest:
        r.binding.serviceTwin.implementationDigest,
      serviceTwinScenarioDigest: r.binding.serviceTwin.scenarioDigest,
      nativeRunId: `native-${this.substrate}`,
      processId: this.substrate === "hermes" ? 101 : 202,
      startedAt: "2026-07-16T00:00:00Z",
      completedAt: "2026-07-16T00:00:01Z",
      terminal: "success" as const,
      portableOutcomeDigest: d("same-outcome"),
      rawTraceDigest: d(`trace:${this.substrate}`),
      cleanupDigest: d(`cleanup:${this.substrate}`),
      humanAssistanceMinutes: 0 as const,
      liveProviderClaim: false as const,
    };
  }
}
test("runs one unchanged randomized binding through pinned Hermes and Paperclip native paths", async () => {
  const hermes = new Path("hermes"),
    paperclip = new Path("paperclip"),
    a = await runR24TwinMatchedEngineering(binding, { hermes, paperclip }, 1);
  expect(a.order).toEqual(["paperclip", "hermes"]);
  expect(verifyR24TwinMatchedEngineering(a)).toBe(true);
  expect(hermes.requests[0]!.binding).toEqual(paperclip.requests[0]!.binding);
  expect(a.cells.map((x) => x.nativePath).sort()).toEqual([
    "hermes-kanban-worker",
    "paperclip-issue-process-adapter",
  ]);
  expect(a.claims).toEqual({
    actualNativeSubstrateProcesses: true,
    liveRemoteProvider: false,
    humanParticipants: false,
    humanAssistance: false,
  });
  expect(a.differences).toEqual([]);
});
test("rejects pin drift, provider specialization and inflated human/live claims", async () => {
  const hermes = new Path("hermes"),
    paperclip = new Path("paperclip");
  const drift: any = new Path("paperclip");
  drift.pin.version = "latest";
  await expect(
    runR24TwinMatchedEngineering(binding, { hermes, paperclip: drift }, 0),
  ).rejects.toThrow("pin");
  const specialized = new Path("paperclip");
  specialized.run = async (r: any) => ({
    ...(await Path.prototype.run.call(specialized, r)),
    organizationDigest: d("easier-organization"),
  });
  await expect(
    runR24TwinMatchedEngineering(
      binding,
      { hermes, paperclip: specialized },
      0,
    ),
  ).rejects.toThrow("receipt");
  const inflated: any = new Path("paperclip");
  inflated.run = async (r: any) => ({
    ...(await Path.prototype.run.call(inflated, r)),
    liveProviderClaim: true,
  });
  await expect(
    runR24TwinMatchedEngineering(binding, { hermes, paperclip: inflated }, 0),
  ).rejects.toThrow("receipt");
});
