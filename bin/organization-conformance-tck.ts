#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import {
  runConformanceTck,
  type BlackBoxConformanceProvider,
  type ConformanceInvocation,
  type ConformanceObservation,
  type ConformanceTestManifest,
} from '@open-autonomy/core';

const separator = process.argv.indexOf('--');
if (separator < 4 || separator === process.argv.length - 1) {
  console.error('usage: bun bin/organization-conformance-tck.ts <manifest.json> <advertisement.json> -- <provider-executable> [args...]');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as ConformanceTestManifest;
const advertisement = JSON.parse(readFileSync(process.argv[3]!, 'utf8')) as Omit<BlackBoxConformanceProvider, 'invoke'>;
const command = process.argv.slice(separator + 1);
const provider: BlackBoxConformanceProvider = {
  ...advertisement,
  async invoke(invocation: ConformanceInvocation): Promise<ConformanceObservation> {
    const child = Bun.spawn(command, { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    child.stdin.write(`${JSON.stringify(invocation)}\n`); child.stdin.end();
    const timer = setTimeout(() => child.kill(), manifest.maximumTestMs);
    let stdout: string, stderr: string, exitCode: number;
    try {
      [stdout, stderr, exitCode] = await Promise.all([
        readBounded(child.stdout, manifest.maximumResponseBytes, child, 'stdout'),
        readBounded(child.stderr, 4096, child, 'stderr'), child.exited,
      ]);
    } finally { clearTimeout(timer); }
    if (exitCode !== 0) throw new Error(`provider exited ${exitCode}: ${stderr.slice(0, 4096)}`);
    const lines = stdout.trim().split(/\r?\n/);
    if (lines.length !== 1) throw new Error('provider must emit exactly one JSON observation line');
    return JSON.parse(lines[0]!) as ConformanceObservation;
  },
};
const bundle = await runConformanceTck(manifest, provider);
console.log(JSON.stringify(bundle, null, 2));
process.exit(bundle.summary.failed || bundle.results.some((result) => result.status === 'unobserved' && result.requirement !== 'unobserved') ? 1 : 0);

async function readBounded(stream: ReadableStream<Uint8Array>, maximum: number, child: ReturnType<typeof Bun.spawn>, label: string): Promise<string> {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > maximum) { child.kill(); throw new Error(`provider ${label} exceeds ${maximum} bytes`); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
