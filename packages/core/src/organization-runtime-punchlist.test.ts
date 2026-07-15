import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const acceptance = readFileSync('docs/ORGANIZATION-RUNTIME-AC.md', 'utf8');
const audit = readFileSync('docs/ORGANIZATION-RUNTIME-LENS-AUDIT.md', 'utf8');
const expected = Array.from({ length: 25 }, (_, index) => `R${index}`);

describe('Autonomous Organization Runtime punch-list integrity', () => {
  test('contains exactly one dependency-ordered checkpoint R0 through R24', () => {
    const checkpoints = [...acceptance.matchAll(/^## (R\d+)\. /gm)].map((match) => match[1]);
    expect(checkpoints).toEqual(expected);
  });

  test('gives every checkpoint engineering ACs, evidence, and a minimal falsifier', () => {
    const sections = acceptance.split(/^## R\d+\. /m).slice(1);
    expect(sections).toHaveLength(25);
    for (const section of sections) {
      expect(section).toContain('**Engineering ACs.**');
      expect(section).toContain('**Evidence.**');
      expect(section).toContain('**Falsifier.**');
    }
  });

  test('assigns at least three unique stable formal-lens obligations to every checkpoint', () => {
    const ids = [...audit.matchAll(/^\| (R(\d+)-[A-Z]+-\d+) /gm)].map((match) => ({ id: match[1], item: `R${match[2]}` }));
    expect(new Set(ids.map((item) => item.id)).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(90);
    for (const checkpoint of expected) expect(ids.filter((item) => item.item === checkpoint).length).toBeGreaterThanOrEqual(3);
  });

  test('defines eight cumulative milestone gates and an explicit zero-residual final gate', () => {
    expect([...acceptance.matchAll(/^### G\d+ /gm)]).toHaveLength(8);
    expect(acceptance).toContain('leaving zero parking-lot residuals');
    expect(acceptance).toContain('fresh adversarial review pair');
  });

  test('keeps the canonical roadmap relationship explicit in both documents', () => {
    const roadmap = readFileSync('docs/ROADMAP.md', 'utf8');
    expect(acceptance).toContain('not a second roadmap');
    expect(roadmap).toContain('ORGANIZATION-RUNTIME-AC.md');
  });
});
