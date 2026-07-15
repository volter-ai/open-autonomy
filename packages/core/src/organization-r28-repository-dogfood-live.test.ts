import { expect,test } from "bun:test";
import { mkdirSync,writeFileSync } from "node:fs";
import { dirname,join } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";
import { runR28RepositoryDogfood,verifyR28DogfoodArtifact } from "./organization-r28-repository-dogfood-live";

test("R28 real disposable repository campaign performs accepted, rejected, and automatic rollback effects",async()=>{
  const artifact=await runR28RepositoryDogfood(join(import.meta.dir,"../../.."));
  expect(verifyR28DogfoodArtifact(artifact)).toBe(true);
  expect(Object.fromEntries(artifact.proposals.map(p=>[p.id,p.outcome]))).toEqual({accepted:"accepted",rejected:"rejected",rollback:"rolled-back"});
  expect(artifact.proposals.find(p=>p.id==="accepted")!.testReceipts.every(r=>r.exitCode===0)).toBe(true);
  expect(artifact.proposals.find(p=>p.id==="rejected")!.testReceipts[0]!.exitCode).not.toBe(0);
  const rollback=artifact.proposals.find(p=>p.id==="rollback")!;
  expect(rollback.testReceipts[0]!.exitCode).not.toBe(0);
  expect(rollback.testReceipts.at(-1)!.exitCode).toBe(0);
  expect(artifact.attacks).toEqual({forgedApprovalRejected:true,compromisedWorkerRejected:true});
  expect(new Set(artifact.quorum.map(q=>q.identity))).toEqual(new Set(["alice","bob"]));
  expect(artifact.bounds).toMatchObject({proposalLimit:3,proposalsUsed:3,spendLimit:10,spendUsed:3});
  expect(artifact.audit.every((row,i)=>i===0?!row.previousDigest:row.previousDigest===artifact.audit[i-1]!.digest)).toBe(true);
  expect(artifact.soak.classification).toBe("short-local");
  expect(artifact.residuals.map(r=>r.id)).toEqual(expect.arrayContaining(["os-process-restart","effect-crash-boundaries","storage-crash-boundaries","long-running","canonical-repository","external-signing"]));
  const forged=structuredClone(artifact);forged.bounds.spendUsed=99;expect(verifyR28DogfoodArtifact(forged)).toBe(false);
});

const live=process.env.OA_R28_DOGFOOD_LIVE==="1"?test:test.skip;
live("R28 writes a signed public-verifiable disposable-worktree artifact",async()=>{
  const artifact=await runR28RepositoryDogfood(process.cwd()),path=join(process.cwd(),"docs/evidence/R28-REPOSITORY-DOGFOOD.json");
  expect(verifyR28DogfoodArtifact(artifact)).toBe(true);
  mkdirSync(dirname(path),{recursive:true});writeFileSync(path,`${canonicalSemanticJson(artifact)}\n`,{mode:0o644});
});
