import { describe, expect, test } from "bun:test";
import { externalProgramStatus, initializeReadyCampaigns, type ExternalProgram } from "./external-validation-program";

const program: ExternalProgram = { schema: "open-autonomy.external-validation-program.v1", programId: "external-1", campaigns: {
  R20: { registry: "r20-registry.json", state: "r20-state.json", dependencies: [], requirements: [
    { kind: "environment", name: "SLACK_BOT_TOKEN" },
    { kind: "attestation", path: "human.json", subject: "r20-authorized-participant" },
  ] },
  R21: { registry: "r21-registry.json", state: "r21-state.json", dependencies: [{ checkpoint: "R20", receipt: "r20-receipt.json" }], requirements: [] },
} };

const attestation = JSON.stringify({ schema: "open-autonomy.external-authority-attestation.v1", subject: "r20-authorized-participant",
  authorityId: "human-1", publicKeyId: "key-1", consent: true, independent: true, signedAt: "2026-07-16T00:00:00Z", signature: "external-signature" });

function deps(files: Record<string, string>, env: Record<string, string | undefined> = {}, initialized: string[] = []) {
  return { env, exists: (path: string) => path in files, read: (path: string) => files[path]!,
    init: (checkpoint: string, state: string, registry: string) => initialized.push(`${checkpoint}:${state}:${registry}`) } as any;
}

describe("external validation program", () => {
  test("reports exact blockers without exposing environment values", () => {
    const statuses = externalProgramStatus("/campaign/program.json", program, deps({}));
    expect(statuses[0]).toEqual(expect.objectContaining({ checkpoint: "R20", phase: "blocked", blockers: [
      "registry missing: r20-registry.json", "environment unset: SLACK_BOT_TOKEN", "attestation missing: human.json",
    ] }));
    expect(JSON.stringify(statuses)).not.toContain("secret");
    expect(statuses[1]!.blockers).toContain("R20 external receipt missing: r20-receipt.json");
  });

  test("rejects self-attested, nonconsenting, or subject-substituted humans", () => {
    for (const patch of [{ independent: false }, { consent: false }, { subject: "some-other-role" }]) {
      const value = JSON.stringify({ ...JSON.parse(attestation), ...patch });
      const status = externalProgramStatus("/campaign/program.json", program, deps({
        "/campaign/r20-registry.json": "{}", "/campaign/human.json": value,
      }, { SLACK_BOT_TOKEN: "secret-never-returned" }))[0]!;
      expect(status.phase).toBe("blocked"); expect(status.blockers).toEqual(["attestation invalid: human.json"]);
    }
  });

  test("initializes only ready campaigns and never skips an external dependency receipt", () => {
    const initialized: string[] = [], files = {
      "/campaign/r20-registry.json": "{}", "/campaign/human.json": attestation, "/campaign/r21-registry.json": "{}",
    };
    expect(initializeReadyCampaigns("/campaign/program.json", program, deps(files, { SLACK_BOT_TOKEN: "secret" }, initialized))).toEqual(["R20"]);
    expect(initialized).toEqual(["R20:/campaign/r20-state.json:/campaign/r20-registry.json"]);
  });

  test("recognizes collecting and assembled durable acquisition states", () => {
    const files = { "/campaign/r20-state.json": JSON.stringify({ assembledBundleDigest: null }),
      "/campaign/r21-state.json": JSON.stringify({ assembledBundleDigest: "sha256:abc" }) };
    const statuses = externalProgramStatus("/campaign/program.json", program, deps(files));
    expect(statuses[0]!.phase).toBe("collecting"); expect(statuses[1]!.phase).toBe("assembled");
  });
});
