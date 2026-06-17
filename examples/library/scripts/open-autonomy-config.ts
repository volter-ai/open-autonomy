import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface AutonomyConfig {
  documents: Record<string, string>;
  standards: Record<string, string>;
  skills: Record<string, string>;
}

export const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = {
  documents: {
    agents: 'AGENTS.md',
    constitution: 'docs/CONSTITUTION.md',
    roadmap: '.open-autonomy/roadmap.yml',
    policy: '.open-autonomy/policy.yml',
    review_rubric: '.open-autonomy/review-rubric.yml',
  },
  standards: {
    code: 'docs/standards/code.md',
    docs: 'docs/standards/docs.md',
    security: 'docs/standards/security.md',
    tests: 'docs/standards/tests.md',
  },
  skills: {
    pm: '.codex/skills/open-autonomy-pm',
    developer: '.codex/skills/open-autonomy-developer',
    reviewer: '.codex/skills/open-autonomy-reviewer',
    planner: '.codex/skills/open-autonomy-planner',
    upgrade: '.codex/skills/open-autonomy-upgrade',
  },
};

export function readAutonomyConfig(root = '.'): AutonomyConfig {
  const path = join(root, '.open-autonomy', 'autonomy.yml');
  if (!existsSync(path)) return DEFAULT_AUTONOMY_CONFIG;
  return parseAutonomyConfig(readFileSync(path, 'utf8'));
}

export function parseAutonomyConfig(text: string): AutonomyConfig {
  return {
    documents: {
      ...DEFAULT_AUTONOMY_CONFIG.documents,
      ...parseSectionMap(text, 'documents'),
    },
    standards: {
      ...DEFAULT_AUTONOMY_CONFIG.standards,
      ...parseNestedMap(text, 'documents', 'standards'),
    },
    skills: {
      ...DEFAULT_AUTONOMY_CONFIG.skills,
      ...parseSectionMap(text, 'skills'),
    },
  };
}

export function referencedAutonomyPaths(config: AutonomyConfig): string[] {
  const paths = new Set<string>();
  for (const value of Object.values(config.documents)) paths.add(value);
  for (const value of Object.values(config.standards)) paths.add(value);
  for (const value of Object.values(config.skills)) paths.add(`${value}/SKILL.md`);
  return Array.from(paths).sort();
}

export function installedRepoSkills(root = '.'): string[] {
  const skillsRoot = join(root, '.codex', 'skills');
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot)
    .filter((name) => existsSync(join(skillsRoot, name, 'SKILL.md')))
    .sort();
}

function parseSectionMap(text: string, section: string): Record<string, string> {
  const out: Record<string, string> = {};
  let active = false;
  for (const line of text.split(/\r?\n/)) {
    if (new RegExp(`^${section}:\\s*$`).test(line)) {
      active = true;
      continue;
    }
    if (active && /^\S/.test(line)) break;
    if (!active) continue;
    const match = /^  ([A-Za-z0-9_-]+):\s*(.+?)\s*$/.exec(line);
    if (match) out[match[1] ?? ''] = unquote(match[2] ?? '');
  }
  return out;
}

function parseNestedMap(text: string, section: string, nested: string): Record<string, string> {
  const out: Record<string, string> = {};
  let inSection = false;
  let inNested = false;
  for (const line of text.split(/\r?\n/)) {
    if (new RegExp(`^${section}:\\s*$`).test(line)) {
      inSection = true;
      inNested = false;
      continue;
    }
    if (inSection && /^\S/.test(line)) break;
    if (!inSection) continue;
    if (new RegExp(`^  ${nested}:\\s*$`).test(line)) {
      inNested = true;
      continue;
    }
    if (inNested && /^  \S/.test(line)) break;
    if (!inNested) continue;
    const match = /^    ([A-Za-z0-9_-]+):\s*(.+?)\s*$/.exec(line);
    if (match) out[match[1] ?? ''] = unquote(match[2] ?? '');
  }
  return out;
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}
