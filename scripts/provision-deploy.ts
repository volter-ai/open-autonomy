#!/usr/bin/env bun
// provision-deploy — idempotent setup of the deploy boundary's github-side config from policy.box.deploy
// (docs/SPEC.md "the deploy boundary"; docs/CODE_HOST_RESOURCES.md). A MAINTAINER command (needs an admin gh
// token): reconciles the required-reviewer environment + the admin-only deploy-tag ruleset + the tag
// deployment policy + any declared non-secret vars. Safe to re-run — it reconciles to the declared state.
// The SECRET (e.g. CLOUDFLARE_API_TOKEN) is NEVER set here: policy carries the NAME; a human sets the value,
// and the deploy is inert until they do. `--dry-run` prints the plan without touching anything.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

interface DeployConfig {
  environment: string;
  tag: string;
  reviewers_var?: string;
  secret?: string;
  vars?: Record<string, string>;
}

const dryRun = process.argv.includes('--dry-run');
const gh = (args: string[], input?: string): string =>
  execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
const ghJson = <T = unknown>(args: string[]): T => JSON.parse(gh(['api', ...args])) as T;
const tryJson = <T>(args: string[], fallback: T): T => {
  try { return ghJson<T>(args); } catch { return fallback; }
};

// emitAutonomy carries the policy box verbatim as the manifest's `policy` (the box keys become policy's
// direct children), so policy.box.deploy in the profile surfaces here as policy.deploy.
const manifest = parse(readFileSync('.open-autonomy/autonomy.yml', 'utf8')) as
  { policy?: { deploy?: DeployConfig } };
const deploy = manifest.policy?.deploy;
if (!deploy) { console.log('no policy.box.deploy — nothing to provision.'); process.exit(0); }

const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
const { environment: env, tag } = deploy;
const log: string[] = [];
const act = (label: string, fn: () => void): void => {
  if (dryRun) { log.push(`[dry-run] ${label}`); return; }
  fn();
  log.push(`✓ ${label}`);
};

// 1. resolve required reviewers from the maintainers var (logins → user ids)
let reviewerArgs: string[] = [];
if (deploy.reviewers_var) {
  const raw = tryJson<{ value: string }>([`repos/${repo}/actions/variables/${deploy.reviewers_var}`], { value: '' }).value;
  const logins = raw.split(/[\s,]+/).filter(Boolean);
  const ids = logins.map((l) => ghJson<{ id: number }>([`users/${l}`]).id);
  reviewerArgs = ids.flatMap((id) => ['-f', 'reviewers[][type]=User', '-F', `reviewers[][id]=${id}`]);
  log.push(`  reviewers: ${logins.join(', ') || '(none declared — environment will require none)'}`);
}

// 2. the environment: required reviewers + no admin bypass + custom (tag) branch policy
act(`environment "${env}" (required reviewers, can_admins_bypass=false)`, () => {
  gh(['api', '-X', 'PUT', `repos/${repo}/environments/${env}`,
    '-F', 'can_admins_bypass=false',
    '-F', 'deployment_branch_policy[protected_branches]=false',
    '-F', 'deployment_branch_policy[custom_branch_policies]=true',
    ...reviewerArgs]);
});

// 3. the tag deployment policy: only `tag` may deploy to the environment (idempotent)
act(`deployment policy: tag "${tag}" may deploy to ${env}`, () => {
  const existing = ghJson<{ branch_policies: Array<{ name: string; type: string }> }>(
    [`repos/${repo}/environments/${env}/deployment-branch-policies`]).branch_policies ?? [];
  if (!existing.some((p) => p.name === tag && p.type === 'tag')) {
    gh(['api', '-X', 'POST', `repos/${repo}/environments/${env}/deployment-branch-policies`, '-f', `name=${tag}`, '-f', 'type=tag']);
  }
});

// 4. the ruleset: only admins may create the deploy tag (idempotent by name) — the front-line of "no agent deploys"
act(`ruleset "deploy-tags-admin-only" (create/update/delete of ${tag} tags = admins only)`, () => {
  const body = JSON.stringify({
    name: 'deploy-tags-admin-only', target: 'tag', enforcement: 'active',
    bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' }], // RepositoryRole 5 = admin
    conditions: { ref_name: { include: [`refs/tags/${tag}`], exclude: [] } },
    rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }],
  });
  const existing = ghJson<Array<{ id: number; name: string }>>([`repos/${repo}/rulesets`])
    .find((r) => r.name === 'deploy-tags-admin-only');
  if (existing) gh(['api', '-X', 'PUT', `repos/${repo}/rulesets/${existing.id}`, '--input', '-'], body);
  else gh(['api', '-X', 'POST', `repos/${repo}/rulesets`, '--input', '-'], body);
});

// 5. declared non-secret vars (e.g. the deploy account id)
for (const [name, value] of Object.entries(deploy.vars ?? {})) {
  act(`var ${name}`, () => gh(['variable', 'set', name, '-R', repo, '--body', value]));
}

// 6. report + the one MANUAL step (the secret — never set here; the deploy is inert until it exists)
console.log(`deploy provisioning for ${repo}${dryRun ? '  (dry-run — nothing changed)' : ''}:`);
for (const l of log) console.log('  ' + l);
if (deploy.secret) {
  const present = tryJson<{ secrets: Array<{ name: string }> }>(
    [`repos/${repo}/environments/${env}/secrets`], { secrets: [] }).secrets.some((s) => s.name === deploy.secret);
  console.log(present
    ? `  ✓ secret ${deploy.secret} is set on ${env} — the pipeline is armed`
    : `  ⚠ MANUAL: gh secret set ${deploy.secret} --env ${env} -R ${repo}   (deploy is inert until this is set)`);
}
