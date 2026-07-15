import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

interface ManifestItem { id: string; dependsOn: string[]; gate: string; }
interface ManifestGate { id: string; items: string[]; }
interface PunchlistManifest { schema: string; items: ManifestItem[]; gates: ManifestGate[]; }

const acceptance = readFileSync('docs/ORGANIZATION-RUNTIME-AC.md', 'utf8');
const audit = readFileSync('docs/ORGANIZATION-RUNTIME-LENS-AUDIT.md', 'utf8');
const manifest = JSON.parse(readFileSync('docs/organization-runtime-punchlist.json', 'utf8')) as PunchlistManifest;
const expected = Array.from({ length: 29 }, (_, index) => `R${index}`);

function sections(document: string): Map<string, string> {
  const matches = [...document.matchAll(/^## (R\d+)(?:\.| —) .*$/gm)];
  return new Map(matches.map((match, index) => [match[1], document.slice(match.index!, matches[index + 1]?.index ?? document.length)]));
}

function expandRange(text: string): string[] {
  const match = text.match(/^R(\d+)(?:–R(\d+))?$/);
  if (!match) throw new Error(`invalid milestone range '${text}'`);
  const start = Number(match[1]); const end = Number(match[2] ?? match[1]);
  return Array.from({ length: end - start + 1 }, (_, index) => `R${start + index}`);
}

describe('Autonomous Organization Runtime punch-list integrity', () => {
  test('contains exactly one checkpoint R0 through R28 in acceptance, audit, and manifest', () => {
    expect([...sections(acceptance).keys()]).toEqual(expected);
    expect([...sections(audit).keys()]).toEqual(expected);
    expect(manifest.schema).toBe('open-autonomy.runtime-punchlist.v1');
    expect(manifest.items.map((item) => item.id)).toEqual(expected);
  });

  test('gives every checkpoint engineering ACs, evidence, and a minimal falsifier', () => {
    for (const checkpoint of expected) {
      const section = sections(acceptance).get(checkpoint)!;
      expect(section).toContain('**Engineering ACs.**');
      expect(section).toContain('**Evidence.**');
      expect(section).toContain('**Falsifier.**');
    }
  });

  test('matches every prose dependency exactly to the authoritative acyclic DAG', () => {
    const byId = new Map(manifest.items.map((item) => [item.id, item]));
    for (const item of manifest.items) {
      expect(new Set(item.dependsOn).size).toBe(item.dependsOn.length);
      for (const dependency of item.dependsOn) {
        expect(byId.has(dependency)).toBe(true);
        expect(Number(dependency.slice(1))).toBeLessThan(Number(item.id.slice(1)));
      }
      const section = sections(acceptance).get(item.id)!;
      const documented = section.match(/^\*\*Depends on:\*\* (.+)\.$/m)?.[1];
      const expectedText = item.id === 'R0' ? 'Organization IR B0–P13 closure'
        : item.id === 'R28' ? 'every prior checkpoint' : item.dependsOn.join(', ');
      expect(documented).toBe(expectedText);
    }
  });

  test('requires the exact stable formal-obligation inventory with at least three rows per checkpoint', () => {
    const ids = [...audit.matchAll(/^\| (R(\d+)-[A-Z]+-\d+) /gm)].map((match) => ({ id: match[1], item: `R${match[2]}` }));
    expect(new Set(ids.map((item) => item.id)).size).toBe(ids.length);
    expect(ids).toHaveLength(120);
    for (const checkpoint of expected) expect(ids.filter((item) => item.item === checkpoint).length).toBeGreaterThanOrEqual(3);
  });

  test('partitions every checkpoint into eight checked cumulative milestone gates', () => {
    expect(manifest.gates.map((gate) => gate.id)).toEqual(Array.from({ length: 8 }, (_, index) => `G${index + 1}`));
    const assigned = manifest.gates.flatMap((gate) => gate.items);
    expect(assigned).toEqual(expected);
    expect(new Set(assigned).size).toBe(expected.length);
    for (const gate of manifest.gates) for (const item of gate.items) expect(manifest.items.find((value) => value.id === item)?.gate).toBe(gate.id);
    const headings = [...acceptance.matchAll(/^### (G\d+) .+ \((R\d+(?:–R\d+)?)\)$/gm)];
    expect(headings).toHaveLength(8);
    for (const [index, heading] of headings.entries()) {
      expect(heading[1]).toBe(manifest.gates[index]!.id);
      expect(expandRange(heading[2]!)).toEqual(manifest.gates[index]!.items);
    }
    const gateRank = new Map(manifest.gates.map((gate, index) => [gate.id, index]));
    const items = new Map(manifest.items.map((item) => [item.id, item]));
    for (const item of manifest.items) for (const dependency of item.dependsOn) {
      expect(gateRank.get(items.get(dependency)!.gate)!).toBeLessThanOrEqual(gateRank.get(item.gate)!);
    }
  });

  test('keeps zero-residual closure, adversarial review, and canonical roadmap relationships explicit', () => {
    const roadmap = readFileSync('docs/ROADMAP.md', 'utf8');
    expect(acceptance).toContain('leaving zero parking-lot residuals');
    expect(acceptance).toContain('fresh adversarial review pair');
    expect(acceptance).toContain('not a second roadmap');
    expect(roadmap).toContain('ORGANIZATION-RUNTIME-AC.md');
  });
});
