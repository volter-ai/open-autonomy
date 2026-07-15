import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";
import { LocalPinnedR21Probe, R21_LIVE_PINS, runR21LiveCampaign, verifyR21LiveArtifact } from "./organization-runtime-reliability-live";
import { RUNTIME_SERVICES } from "./organization-runtime-reliability";

test("R21 campaign is signed, complete, and never promotes model drills to live evidence", async () => {
  const artifact=await runR21LiveCampaign({
    hermesVersion:async()=>({ok:true,output:`Hermes Agent v${R21_LIVE_PINS.hermes.release} upstream ${R21_LIVE_PINS.hermes.upstreamRevision} local ${R21_LIVE_PINS.hermes.localRevision}`,latencyMs:2}),
    paperclip:async()=>({ok:true,latencyMs:3}),
  },"test-evidence-key","2026-07-15T12:00:00Z");
  expect(verifyR21LiveArtifact(artifact,"test-evidence-key")).toBe(true);
  expect(Object.keys(artifact.services).sort()).toEqual([...RUNTIME_SERVICES].sort());
  expect(artifact.services.api.evidenceClass).toBe("observed-local-substrate");
  expect(artifact.services.compiler.evidenceClass).toBe("model-only");
  expect(artifact.faults.filter(x=>x.evidenceClass==="owned-fixture").map(x=>x.domain).sort()).toEqual(["process","storage"]);
  expect(artifact.recovery).toMatchObject({revokedPreserved:true,effectPreserved:true,freshController:true});
  expect(artifact.lifecycle.evidenceClass).toBe("model-only");
  const residualIds=artifact.residuals.map(x=>x.id);
  for(const id of ["external-kms","region","unfamiliar-human"]) expect(residualIds).toContain(id);
  expect(artifact.load.fairness.report.starved).toEqual([]);
  expect(artifact.load.deployedEightServiceSoak).toBe(false);
  for (const service of RUNTIME_SERVICES) expect(artifact.services[service].cost.value).toBeNull();
  const required=[
    ...RUNTIME_SERVICES.filter(s=>artifact.services[s].evidenceClass==="model-only").map(s=>`services.${s}`),
    ...RUNTIME_SERVICES.map(s=>`services.${s}.cost`),
    "load.queue","load.fairness","load.deployedEightServiceSoak","lifecycle",
    ...artifact.faults.filter(f=>f.evidenceClass==="model-only").map(f=>`faults.${f.domain}`),
  ], covered=new Set(artifact.residuals.flatMap(r=>r.covers));
  expect(required.filter(path=>!covered.has(path))).toEqual([]);
  const forged={...artifact,services:{...artifact.services,api:{...artifact.services.api,errors:99}}};
  expect(verifyR21LiveArtifact(forged,"test-evidence-key")).toBe(false);
});

const live=process.env.OA_R21_LIVE === "1"?test:test.skip;
live("R21 bounded read-only campaign against pinned local Hermes and Paperclip",async()=>{
  const key=process.env.OA_R21_EVIDENCE_KEY??"local-development-r21-key",
    artifact=await runR21LiveCampaign(new LocalPinnedR21Probe(),key),
    path=join(process.cwd(),"docs/evidence/R21-LIVE-CAMPAIGN.json");
  expect(artifact.services.interaction.errors).toBe(0);
  expect(artifact.services.api.errors).toBe(0);
  expect(verifyR21LiveArtifact(artifact,key)).toBe(true);
  mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,`${canonicalSemanticJson(artifact)}\n`,{mode:0o600});
});
