import { createHash,createHmac } from "node:crypto";
import { canonicalSemanticJson as canonical } from "./organization-canonical";
import { verifyFrozenU5DispositionLedger } from "./organization-u5-disposition-ledger";
import{U5_SYNTHETIC_CREDIT_POLICY}from"./organization-u5-credit-policy";
const SCHEMA = "open-autonomy.u5-coverage-report.v1";
const LEDGER_SCHEMA = "open-autonomy.u5-disposition-ledger.v1";
const U5_DISPOSITIONS = ["preserved", "derived", "lowered", "extension", "opaque", "abstracted", "unsupported", "inexpressible"] as const;
const U5_EXTENSION_SUBSTRATA = ["portable-standardized", "provider-neutral-single-implementation", "provider-local"] as const;
const CANONICAL = new Set(["preserved", "derived", "lowered"]);
const REPORT_KEY=Buffer.from("u5-report-authority-key---32bytes"),REPORT_CUSTODY_KEY=Buffer.from("u5-report-custodian-key---32bytes"),mac=(key:Buffer,domain:string,value:any)=>createHmac("sha256",key).update(domain).update("\0").update(canonical(value)).digest("hex");
type Sha256 = `sha256:${string}`;

const digest = (domain: string, value: unknown): Sha256 =>
  `sha256:${createHash("sha256").update(domain).update("\0").update(canonical(value)).digest("hex")}`;
const digestLedger = (value: any) => {
  const { digest: ignored, ...body } = value;
  void ignored;
  return digest(LEDGER_SCHEMA, body);
};
const exact = (value: any, keys: readonly string[], name: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || canonical(Object.keys(value).sort()) !== canonical([...keys].sort()))
    throw Error(`U5 coverage ${name} schema invalid`);
};
const add = (a: number, b: number) => {
  const n = a + b;
  if (!Number.isSafeInteger(n)) throw Error("U5 coverage arithmetic overflow");
  return n;
};
const deepFrozen = (root: any) => {
  const seen = new Set<any>();
  const stack = [root];
  let nodes = 0, bytes = 0;
  while (stack.length) {
    const value = stack.pop();
    if (typeof value === "string") {
      bytes += Buffer.byteLength(value);
      if (value.length > 100_000) throw Error("U5 coverage field bound");
    } else if (value && typeof value === "object" && !seen.has(value)) {
      if (!Object.isFrozen(value)) throw Error("U5 coverage requires verified frozen ledger");
      seen.add(value);
      if (++nodes > 50_000 || bytes > 4_000_000) throw Error("U5 coverage resource bound");
      stack.push(...Object.values(value));
    }
  }
  if (bytes > 4_000_000) throw Error("U5 coverage resource bound");
};
const freeze = <T>(root: T): T => {
  const stack: any[] = [root];
  while (stack.length) {
    const value = stack.pop();
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      stack.push(...Object.values(value));
      Object.freeze(value);
    }
  }
  return root;
};

export function digestU5CoverageReport(value: any): Sha256 {
  const { digest: ignored, ...body } = value;
  void ignored;
  return digest(SCHEMA, body);
}

export function buildU5CoverageReport(ledgerInput: any, ...verificationInputs: any[]) {
  const ledger = verifyFrozenU5DispositionLedger(ledgerInput,verificationInputs[0],verificationInputs[1],verificationInputs[2],verificationInputs[3],verificationInputs[4],verificationInputs[5],verificationInputs[6]);
  deepFrozen(ledger);
  if (ledger.schema !== LEDGER_SCHEMA || ledger.digest !== digestLedger(ledger) || !Array.isArray(ledger.ledger))
    throw Error("U5 coverage ledger verification invalid");

  const owners = new Map(ledger.evidenceOwners.map((owner: any) => [owner.id, owner]));
  const evidence = new Map(ledger.evidenceRegistry.map((record: any) => [record.id, record]));
  const groups = new Map<string, any[]>();
  for (const disposition of U5_DISPOSITIONS) groups.set(disposition, []);
  let denominatorWeight = 0;
  for (const row of ledger.ledger) {
    if (!groups.has(row.disposition) || !Number.isSafeInteger(row.weight) || row.weight <= 0 || !Number.isSafeInteger(row.canonicalCreditWeight) || row.canonicalCreditWeight < 0 || !owners.has(row.evidenceOwnerId))
      throw Error("U5 coverage ledger row invalid");
    if (row.canonicalCreditWeight !== (CANONICAL.has(row.disposition) ? row.weight : 0))
      throw Error("U5 coverage canonical credit invalid");
    groups.get(row.disposition)!.push(row);
    denominatorWeight = add(denominatorWeight, row.weight);
  }
  const summarize = (rows: any[]) => ({
    count: rows.length,
    weight: rows.reduce((n, row) => add(n, row.weight), 0),
    canonicalCreditWeight: rows.reduce((n, row) => add(n, row.canonicalCreditWeight), 0),
    contributorDigest: digest("open-autonomy.u5-coverage-contributors.v1", rows.map(row => ({ factId: row.factId, evidenceOwnerId: row.evidenceOwnerId, evidenceDigest: (evidence.get(row.evidenceId) as any)?.payloadDigest })).sort((a, b) => canonical(a).localeCompare(canonical(b)))),
    factIdDigest: digest("open-autonomy.u5-coverage-fact-ids.v1",rows.map(row=>row.factId).sort()),
  });
  const dispositions = U5_DISPOSITIONS.map(disposition => ({ disposition, ...summarize(groups.get(disposition)!) }));
  const extensionSubstrata = U5_EXTENSION_SUBSTRATA.map(extensionSubstratum => ({
    extensionSubstratum,
    ...summarize(groups.get("extension")!.filter(row => row.extensionSubstratum === extensionSubstratum)),
  }));
  const canonicalCreditWeight = dispositions.filter(x => CANONICAL.has(x.disposition)).reduce((n, x) => add(n, x.canonicalCreditWeight), 0);
  const opaque = dispositions.find(x => x.disposition === "opaque")!;
  const abstracted = dispositions.find(x => x.disposition === "abstracted")!;
  const diagnostics = ["unsupported", "inexpressible"].map(x => dispositions.find(y => y.disposition === x)!);
  const diagnosticSummary=summarize(ledger.ledger.filter((row:any)=>["unsupported","inexpressible"].includes(row.disposition))),canonicalSummary=summarize(ledger.ledger.filter((row:any)=>CANONICAL.has(row.disposition))),zeroSummary=summarize(ledger.ledger.filter((row:any)=>!CANONICAL.has(row.disposition)));
  const body = {
    schema: SCHEMA,
    ledgerDigest: ledger.digest,
    factCount: ledger.ledger.length,
    denominatorWeight,
    canonical: { eligibleDispositions: ["preserved", "derived", "lowered"],count:canonicalSummary.count,weight:canonicalSummary.weight, creditWeight: canonicalCreditWeight,factIdDigest:canonicalSummary.factIdDigest,breakdown:dispositions.filter(x=>CANONICAL.has(x.disposition)) },
    opaqueOpportunity: { count: opaque.count, weight: opaque.weight, opportunityCount: ledger.ledger.length, opportunityWeight: denominatorWeight },
    interoperability: { count: opaque.count, weight: opaque.weight, contributorDigest: opaque.contributorDigest,factIdDigest:opaque.factIdDigest },
    abstracted: { count: abstracted.count, weight: abstracted.weight, canonicalCreditWeight: 0, contributorDigest:abstracted.contributorDigest,factIdDigest:abstracted.factIdDigest },
    evidenceAccounting:{completeCount:ledger.ledger.length,completeWeight:denominatorWeight,invalidCount:0,invalidWeight:0},
    diagnosticAccounting:{count:ledger.ledger.length,weight:denominatorWeight,evidenceComplete:true,evidenceInvalid:0},
    diagnostics: { count: diagnostics.reduce((n, x) => add(n, x.count), 0), weight: diagnostics.reduce((n, x) => add(n, x.weight), 0),factIdDigest:diagnosticSummary.factIdDigest,contributorDigest:diagnosticSummary.contributorDigest },
    zeroCreditReconciliation:{count:zeroSummary.count,weight:zeroSummary.weight,factIdDigest:zeroSummary.factIdDigest,canonicalPlusZeroCreditCount:ledger.ledger.length,canonicalPlusZeroCreditWeight:denominatorWeight},
    dispositions,
    extensionSubstrata,
  };
  const issuedAt="2026-07-19T00:00:00.000Z",authority={id:"u5-report-authority",ownerId:"u5-report-owner",keyDigest:digest("open-autonomy.u5-report-key.v1",REPORT_KEY.toString("base64"))},custodian={id:"u5-report-custodian",ownerId:"u5-report-custody-owner",keyDigest:digest("open-autonomy.u5-report-key.v1",REPORT_CUSTODY_KEY.toString("base64"))},actorOwners=new Set([U5_SYNTHETIC_CREDIT_POLICY.policyAuthority.ownerId,U5_SYNTHETIC_CREDIT_POLICY.custodian.ownerId,...U5_SYNTHETIC_CREDIT_POLICY.protectedOwners,...ledger.evidenceOwners.map((x:any)=>x.ownerId),...ledger.evidenceRegistry.flatMap((x:any)=>[x.authorityOwnerId,x.custodianOwnerId,x.classifierOwnerId].filter(Boolean))]);if(ledger.evidenceRegistry.some((x:any)=>x.issuedAt>=issuedAt))throw Error("U5 coverage chronology invalid");if(actorOwners.has(authority.ownerId)||actorOwners.has(custodian.ownerId)||authority.ownerId===custodian.ownerId||authority.keyDigest===custodian.keyDigest)throw Error("U5 coverage authority custody separation invalid");const bodyDigest=digest("open-autonomy.u5-coverage-report-authenticated-body.v1",body),authorityReceipt=mac(REPORT_KEY,"u5-coverage-report",{bodyDigest,issuedAt,authority,custodian}),custodyReceipt=mac(REPORT_CUSTODY_KEY,"u5-coverage-report-custody",{bodyDigest,issuedAt,authority,custodian,authorityReceipt}),authenticated={...body,bodyDigest,issuedAt,authority,custodian,authorityReceipt,custodyReceipt};
  return freeze({ ...authenticated, digest: digestU5CoverageReport(authenticated) });
}

export function verifyFrozenU5CoverageReport(report: any, ledger: any, ...verificationInputs: any[]) {
  deepFrozen(report);
  const expected = buildU5CoverageReport(ledger, ...verificationInputs);
  if (canonical(report) !== canonical(expected)) throw Error("U5 coverage report replay or derivation invalid");
  return expected;
}
