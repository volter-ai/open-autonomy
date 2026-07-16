#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import {
  acceptR20Collection, acceptR20CollectorIntent, acceptR20Observation, acceptR20Registration, assembleR20AcquisitionBundle,
  createR20AcquisitionState, issueR20Collection, issueR20CollectorIntent, issueR20Observation, issueR20Registration,
  loadR20AcquisitionState, saveR20AcquisitionJson, saveR20AcquisitionState, type R20AcquisitionResponse,
} from "./r20-acquisition";

const COMMANDS = ["init", "status", "issue-registration", "accept-registration", "issue-observation", "accept-observation",
  "issue-collector-intent", "accept-collector-intent", "issue-collection", "accept-collection", "assemble"] as const;
type Command = typeof COMMANDS[number];
function parse(argv: string[]) {
  const command = argv.shift() as Command, flags = new Map<string, string>();
  if (!(COMMANDS as readonly string[]).includes(command)) throw Error(`usage: r20-acquire <${COMMANDS.join("|")}> [options]`);
  while (argv.length) { const key = argv.shift()!, value = argv.shift(); if (!key.startsWith("--") || value === undefined || flags.has(key)) throw Error("R20 acquisition arguments invalid"); flags.set(key, value); }
  const required = (key: string) => { const value = flags.get(key); if (!value) throw Error(`R20 acquisition ${key} required`); return value; };
  return { command, required };
}
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
export async function runR20AcquisitionCli(argv: string[]) {
  const { command, required } = parse([...argv]), statePath = required("--state");
  if (command === "init") {
    if (existsSync(statePath)) throw Error("R20 acquisition state already exists"); const state = createR20AcquisitionState(json(required("--registry")));
    saveR20AcquisitionState(statePath, state); return { campaignId: state.campaignId, manifestDigest: state.manifestDigest };
  }
  const state = loadR20AcquisitionState(statePath);
  if (command === "status") {
    const registration: any = state.registration?.response?.fragment;
    return { campaignId: state.campaignId, registration: !!registration, trials: { required: registration?.trials?.length ?? null,
      issued: Object.keys(state.trials).length, accepted: Object.values(state.trials).filter((x) => x.response).length },
      collectorIntent: !!state.collectorIntent?.response, collection: !!state.collection?.response, assembledBundleDigest: state.assembledBundleDigest };
  }
  const response = () => json(required("--response")) as R20AcquisitionResponse,
    durableOutput = (value: unknown) => { saveR20AcquisitionState(statePath, state); saveR20AcquisitionJson(required("--out"), value); };
  let result: unknown;
  if (command === "issue-registration") { const value = issueR20Registration(state); durableOutput(value); result = { action: value.action }; }
  else if (command === "accept-registration") result = { responseDigest: acceptR20Registration(state, response()) };
  else if (command === "issue-observation") { const value = issueR20Observation(state, required("--trial")); durableOutput(value); result = { trial: value.subject, ordinal: value.ordinal }; }
  else if (command === "accept-observation") { const trial = required("--trial"); result = { trial, responseDigest: acceptR20Observation(state, trial, response()) }; }
  else if (command === "issue-collector-intent") { const value = issueR20CollectorIntent(state); durableOutput(value); result = { action: value.action }; }
  else if (command === "accept-collector-intent") result = { responseDigest: acceptR20CollectorIntent(state, response()) };
  else if (command === "issue-collection") { const value = issueR20Collection(state); durableOutput(value); result = { candidateDigest: value.candidateDigest }; }
  else if (command === "accept-collection") result = { responseDigest: acceptR20Collection(state, response()) };
  else { const bundle = assembleR20AcquisitionBundle(state); durableOutput(bundle); result = { bundleDigest: state.assembledBundleDigest }; }
  saveR20AcquisitionState(statePath, state); return result;
}
if (import.meta.main) runR20AcquisitionCli(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
