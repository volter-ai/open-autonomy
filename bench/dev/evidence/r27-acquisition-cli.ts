#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import {
  acceptR27AcquisitionResponse, assembleR27AcquisitionBundle, createR27AcquisitionState,
  issueR27AcquisitionRequest, loadR27AcquisitionState, saveR27AcquisitionJson,
  saveR27AcquisitionState, type R27AcquisitionResponse, type R27AcquisitionRole,
  type R27Stage,
} from "./r27-acquisition";

type Command = "init" | "issue" | "accept" | "assemble" | "status";
function args(values: string[]) {
  const command = values.shift() as Command, flags = new Map<string, string>();
  if (!(["init", "issue", "accept", "assemble", "status"] as string[]).includes(command)) throw Error("usage: r27-acquire <init|issue|accept|assemble|status> [options]");
  while (values.length) {
    const key = values.shift()!, value = values.shift();
    if (!key.startsWith("--") || value === undefined || flags.has(key)) throw Error("R27 acquisition arguments invalid");
    flags.set(key, value);
  }
  const required = (key: string) => { const value = flags.get(key); if (!value) throw Error(`R27 acquisition ${key} required`); return value; };
  return { command, flags, required };
}
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

export async function runR27AcquisitionCli(argv: string[]) {
  const { command, flags, required } = args([...argv]), statePath = required("--state");
  if (command === "init") {
    if (existsSync(statePath)) throw Error("R27 acquisition state already exists");
    const registry = json(required("--registry")) as { campaignId: string; createdAt: string; roleKeys: Record<R27AcquisitionRole, string>; publicKeys: Record<string, string> };
    const state = createR27AcquisitionState(registry);
    saveR27AcquisitionState(statePath, state);
    return { campaignId: state.campaignId, manifestDigest: state.manifestDigest };
  }
  const state = loadR27AcquisitionState(statePath);
  if (command === "status") return { campaignId: state.campaignId, accepted: Object.keys(state.responses).sort(), issued: Object.keys(state.requests).sort(), assembledBundleDigest: state.assembledBundleDigest };
  if (command === "issue") {
    const request = issueR27AcquisitionRequest(state, required("--stage") as R27Stage);
    saveR27AcquisitionState(statePath, state);
    saveR27AcquisitionJson(required("--out"), request);
    return { stage: request.stage, manifestDigest: request.manifestDigest };
  }
  if (command === "accept") {
    const stage = required("--stage") as R27Stage, response = json(required("--response")) as R27AcquisitionResponse;
    const responseDigest = acceptR27AcquisitionResponse(state, stage, response);
    saveR27AcquisitionState(statePath, state);
    return { stage, responseDigest };
  }
  const bundle = assembleR27AcquisitionBundle(state);
  saveR27AcquisitionState(statePath, state);
  saveR27AcquisitionJson(required("--out"), bundle);
  return { bundleDigest: state.assembledBundleDigest };
}

if (import.meta.main) runR27AcquisitionCli(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
