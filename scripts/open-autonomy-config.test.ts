import { describe, expect, test } from 'bun:test';
import { parseAutonomyConfig } from './open-autonomy-config';

// U2 (supercode study §II.9.1) — wiring ONE consumer as proof: a declared `documents.roles` entry in the
// manifest wins over GOVERNANCE_DOCS's hardcoded path guess for the same key; with no roles declared, the
// guesses alone apply exactly as before (additive, back-compat).
describe('parseAutonomyConfig — documents.roles override GOVERNANCE_DOCS guesses', () => {
  test('no manifest documents.roles → today\'s hardcoded guesses, unchanged', () => {
    const config = parseAutonomyConfig('skills: {}\n');
    expect(config.documents.constitution).toBe('docs/CONSTITUTION.md');
    expect(config.documents.roadmap).toBe('.open-autonomy/roadmap.yml');
    expect(config.documents.vision).toBeUndefined(); // no hardcoded guess exists for vision
  });

  test('a declared constitution/roadmap role overrides the guessed path for that key', () => {
    const config = parseAutonomyConfig(
      ['documents:', '  roles:', '    constitution: profiles/acme/docs/OUR_CONSTITUTION.md', '    roadmap: plans/roadmap.yml', ''].join('\n'),
    );
    expect(config.documents.constitution).toBe('profiles/acme/docs/OUR_CONSTITUTION.md');
    expect(config.documents.roadmap).toBe('plans/roadmap.yml');
  });

  test('a declared vision role adds a NEW key (there is no hardcoded guess to override)', () => {
    const config = parseAutonomyConfig(['documents:', '  roles:', '    vision: docs/VISION.md', ''].join('\n'));
    expect(config.documents.vision).toBe('docs/VISION.md');
  });

  test('every other GOVERNANCE_DOCS/STANDARDS key is untouched by a role declaration', () => {
    const config = parseAutonomyConfig(['documents:', '  roles:', '    vision: docs/VISION.md', ''].join('\n'));
    expect(config.documents.autonomy).toBe('.open-autonomy/autonomy.yml');
    expect(config.documents.agents).toBe('AGENTS.md');
    expect(config.standards.code).toBe('docs/standards/code.md');
  });

  test('skills still come from the manifest, unaffected by the roles overlay', () => {
    const config = parseAutonomyConfig(
      ['skills:', '  pm: .codex/skills/pm', 'documents:', '  roles:', '    vision: docs/VISION.md', ''].join('\n'),
    );
    expect(config.skills.pm).toBe('.codex/skills/pm');
  });
});

// TA.1 — `documentRoles` is the content gate's input: the RAW declared role map, never the
// GOVERNANCE_DOCS-defaulted `documents` (which always carries a `constitution` guess even when nothing
// was declared) — and limited to the two altitudes the content gate cares about (`roadmap` excluded).
describe('parseAutonomyConfig — documentRoles (TA.1 content-gate input)', () => {
  test('no manifest documents.roles → documentRoles is empty (no default guesses leak in)', () => {
    const config = parseAutonomyConfig('skills: {}\n');
    expect(config.documentRoles).toEqual({});
  });

  test('a declared vision role appears in documentRoles', () => {
    const config = parseAutonomyConfig(['documents:', '  roles:', '    vision: docs/VISION.md', ''].join('\n'));
    expect(config.documentRoles).toEqual({ vision: 'docs/VISION.md' });
  });

  test('a declared constitution role appears in documentRoles', () => {
    const config = parseAutonomyConfig(
      ['documents:', '  roles:', '    constitution: profiles/acme/docs/OUR_CONSTITUTION.md', ''].join('\n'),
    );
    expect(config.documentRoles).toEqual({ constitution: 'profiles/acme/docs/OUR_CONSTITUTION.md' });
  });

  test('a declared roadmap role is EXCLUDED from documentRoles (machine-groomed, never content-gated)', () => {
    const config = parseAutonomyConfig(
      ['documents:', '  roles:', '    vision: docs/VISION.md', '    roadmap: plans/roadmap.yml', ''].join('\n'),
    );
    expect(config.documentRoles).toEqual({ vision: 'docs/VISION.md' });
    expect(config.documentRoles).not.toHaveProperty('roadmap');
  });

  test('all three roles declared → documentRoles carries vision+constitution only', () => {
    const config = parseAutonomyConfig(
      [
        'documents:', '  roles:',
        '    vision: docs/VISION.md',
        '    constitution: docs/CONSTITUTION.md',
        '    roadmap: .open-autonomy/roadmap.yml',
        '',
      ].join('\n'),
    );
    expect(config.documentRoles).toEqual({ vision: 'docs/VISION.md', constitution: 'docs/CONSTITUTION.md' });
  });
});
