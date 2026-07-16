#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import {
  acceptR28Append, acceptR28Completion, acceptR28Registration, acceptR28Seal, acceptR28Validation, acceptR28ValidatorIntent,
  assembleR28AcquisitionCampaign, createR28AcquisitionState, issueR28Append, issueR28Completion, issueR28Registration,
  issueR28Seal, issueR28Validation, issueR28ValidatorIntent, loadR28AcquisitionState, saveR28AcquisitionJson,
  saveR28AcquisitionState, type R28AcquisitionResponse, type R28AcquisitionRole, type R28Stream,
} from "./r28-acquisition";

const COMMANDS = ["init", "status", "issue-registration", "accept-registration", "issue-append", "accept-append", "issue-seal", "accept-seal",
  "issue-completion", "accept-completion", "issue-validator-intent", "accept-validator-intent", "issue-validation", "accept-validation", "assemble"] as const;
type Command = typeof COMMANDS[number];
function parse(argv: string[]) {
  const command = argv.shift() as Command, flags = new Map<string, string>();
  if (!(COMMANDS as readonly string[]).includes(command)) throw Error(`usage: r28-acquire <${COMMANDS.join("|")}> [options]`);
  while (argv.length) { const key = argv.shift()!, value = argv.shift(); if (!key.startsWith("--") || value === undefined || flags.has(key)) throw Error("R28 acquisition arguments invalid"); flags.set(key, value); }
  const required = (key: string) => { const value = flags.get(key); if (!value) throw Error(`R28 acquisition ${key} required`); return value; };
  return { command, required };
}
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
export async function runR28AcquisitionCli(argv: string[]) {
  const { command, required } = parse([...argv]), statePath = required("--state");
  if (command === "init") {
    if (existsSync(statePath)) throw Error("R28 acquisition state already exists");
    const registry = json(required("--registry")) as { campaignId: string; createdAt: string; roleKeys: Record<R28AcquisitionRole, string>; publicKeys: Record<string, string> };
    const state = createR28AcquisitionState(registry); saveR28AcquisitionState(statePath, state);
    return { campaignId: state.campaignId, manifestDigest: state.manifestDigest };
  }
  const state = loadR28AcquisitionState(statePath);
  if (command === "status") return { campaignId: state.campaignId, registration: !!state.registration?.response,
    streams: Object.fromEntries(Object.entries(state.streams).map(([name, stream]) => [name, { entries: stream.entries.length, pending: !!stream.entries.at(-1) && !stream.entries.at(-1)!.response, sealed: !!stream.seal?.response }])),
    completion: !!state.completion?.response, validatorIntent: !!state.validatorIntent?.response, validation: !!state.validation?.response, assembledBundleDigest: state.assembledBundleDigest };
  const response = () => json(required("--response")) as R28AcquisitionResponse,
    output = (value: unknown) => saveR28AcquisitionJson(required("--out"), value),
    durableOutput = (value: unknown) => { saveR28AcquisitionState(statePath, state); output(value); },
    stream = () => required("--stream") as R28Stream;
  let result: unknown;
  if (command === "issue-registration") { const value = issueR28Registration(state); durableOutput(value); result = { action: value.action }; }
  else if (command === "accept-registration") result = { responseDigest: acceptR28Registration(state, response()) };
  else if (command === "issue-append") { const value = issueR28Append(state, stream()); durableOutput(value); result = { stream: value.subject, ordinal: value.ordinal }; }
  else if (command === "accept-append") { const subject = stream(), ordinal = Number(required("--ordinal")); result = { responseDigest: acceptR28Append(state, subject, ordinal, response()) }; }
  else if (command === "issue-seal") { const value = issueR28Seal(state, stream()); durableOutput(value); result = { stream: value.subject, count: value.ordinal }; }
  else if (command === "accept-seal") result = { responseDigest: acceptR28Seal(state, stream(), response()) };
  else if (command === "issue-completion") { const value = issueR28Completion(state); durableOutput(value); result = { action: value.action }; }
  else if (command === "accept-completion") result = { responseDigest: acceptR28Completion(state, response()) };
  else if (command === "issue-validator-intent") { const value = issueR28ValidatorIntent(state); durableOutput(value); result = { action: value.action }; }
  else if (command === "accept-validator-intent") result = { responseDigest: acceptR28ValidatorIntent(state, response()) };
  else if (command === "issue-validation") { const value = issueR28Validation(state); durableOutput(value); result = { candidateDigest: value.candidateDigest }; }
  else if (command === "accept-validation") result = { responseDigest: acceptR28Validation(state, response()) };
  else { const campaign = assembleR28AcquisitionCampaign(state); durableOutput(campaign); result = { campaignDigest: state.assembledBundleDigest }; }
  saveR28AcquisitionState(statePath, state); return result;
}
if (import.meta.main) runR28AcquisitionCli(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
