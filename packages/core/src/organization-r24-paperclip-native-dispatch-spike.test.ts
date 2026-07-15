import { expect, test } from "bun:test";
import { runPaperclipNativeDispatchSpike } from "./organization-r24-paperclip-native-dispatch-spike";
const live = process.env.OA_R24_PAPERCLIP_NATIVE_DISPATCH === "1" ? test : test.skip;
live("pinned Paperclip native assignment dispatches the process adapter and exposes issue/run evidence", async()=>{
  const proof=await runPaperclipNativeDispatchSpike(process.env.PAPERCLIP_BASE_URL);
  expect(proof.observation).toEqual(expect.objectContaining({status:"succeeded",exitCode:0,invocationSource:"assignment"}));
  expect(proof.observation.linkedIssueIds).toContain(proof.ids.issue);
  expect(proof.cleanup.status).toBeGreaterThanOrEqual(200);
},30_000);
