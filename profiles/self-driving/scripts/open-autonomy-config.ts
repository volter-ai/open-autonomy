import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The autonomy manifest (.open-autonomy/autonomy.yml) is the single source of truth — it is generated
// by compile from the profile. There is NO hardcoded fallback: a missing manifest is a hard error (so
// staleness surfaces instead of being papered over by a frozen default), and the skill/doc/standard
// references come from the manifest itself, never from a baked-in list that can drift.
export interface AutonomyConfig {
  documents: Record<string, string>;
  standards: Record<string, string>;
  skills: Record<string, string>;
}

// OA's governance LAYOUT — the fixed paths of the docs/standards the agents reference. This is part of
// OA's structure (like preflight's REQUIRED_FILES), applied to every install; it is NOT a fallback that
// substitutes for missing data. Consumers load whichever of these actually exist. The part that varies
// per install and previously went STALE — which agents have skills — is NOT here; it comes from the
// manifest, the single source of truth.
const GOVERNANCE_DOCS: Record<string, string> = {
  autonomy: '.open-autonomy/autonomy.yml',
  agents: 'AGENTS.md',
  constitution: 'docs/CONSTITUTION.md',
  roadmap: '.open-autonomy/roadmap.yml',
  review_rubric: '.open-autonomy/review-rubric.yml',
};
const STANDARDS: Record<string, string> = {
  code: 'docs/standards/code.md',
  docs: 'docs/standards/docs.md',
  security: 'docs/standards/security.md',
  tests: 'docs/standards/tests.md',
};

export function readAutonomyConfig(root = '.'): AutonomyConfig {
  const path = join(root, '.open-autonomy', 'autonomy.yml');
  // A missing manifest yields EMPTY skills — nothing invented. (Validators like preflight then report
  // the missing manifest honestly instead of crashing.) The opposite of a stale baked-in default: it
  // declares no skills rather than fabricating a frozen set.
  if (!existsSync(path)) return { documents: { ...GOVERNANCE_DOCS }, standards: { ...STANDARDS }, skills: {} };
  return parseAutonomyConfig(readFileSync(path, 'utf8'));
}

export function parseAutonomyConfig(text: string): AutonomyConfig {
  const manifest = (Bun.YAML.parse(text) ?? {}) as {
    skills?: Record<string, string>;
    documents?: { roles?: Partial<Record<string, string>> };
  };
  // U2 (supercode study §II.9.1) — a role the profile DECLARED wins over GOVERNANCE_DOCS's hardcoded path
  // guess for the same key (`constitution`/`roadmap` already have a guess here; `vision` has none — OA's
  // fixed layout never guessed a vision path, so it appears only when a role declares it). No roles
  // declared (or no manifest) → this is byte-identical to pre-U2 behavior, the guesses alone.
  const declaredRoles: Record<string, string> = {};
  for (const [role, path] of Object.entries(manifest.documents?.roles ?? {}))
    if (typeof path === 'string' && path.length > 0) declaredRoles[role] = path;
  // Skills come from the manifest (the source of truth — no hardcoded list that can drift); the
  // governance doc/standard layout is OA's fixed structure, overridden per-key by a declared role.
  return { documents: { ...GOVERNANCE_DOCS, ...declaredRoles }, standards: { ...STANDARDS }, skills: manifest.skills ?? {} };
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
