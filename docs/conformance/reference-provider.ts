#!/usr/bin/env bun
import { readFileSync } from 'node:fs';

const invocation = JSON.parse(await Bun.stdin.text()) as { test: string; correlation: string };
const manifest = JSON.parse(readFileSync('docs/conformance/tck-v1.json', 'utf8')) as { tests: Array<{ id: string; expected: unknown; evidence: string[] }> };
const test = manifest.tests.find((item) => item.id === invocation.test);
if (!test) throw new Error(`unknown TCK test '${invocation.test}'`);
console.log(JSON.stringify({
  correlation: invocation.correlation,
  output: test.expected,
  evidence: Object.fromEntries(test.evidence.map((name) => [name, `reference-observation:${test.id}:${name}`])),
}));
