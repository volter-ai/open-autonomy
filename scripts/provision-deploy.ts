#!/usr/bin/env bun
// provision-deploy — reconcile the github-side deploy boundary to match the deploy WORKFLOW. A maintainer
// command (needs an admin gh token). The deploy workflow is the single source of truth (docs/SPEC.md "the
// deploy boundary"; docs/CODE_HOST_RESOURCES.md): it declares its own gate via `environment:` (the job runs
// in the gated environment) and `on: push: tags:` (only the promotion tag fires). GitHub cannot express the
// environment's required-REVIEWERS or the admin-only tag RULESET in a repo file, so this script provisions
// exactly those — nothing the workflow already says — to match. Idempotent; safe to re-run. The reviewers
// come from the org's maintainers policy; the SECRET + non-secret VARS the workflow references are reported
// as human-set, never set here. `--dry-run` prints the plan without touching anything.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const WORKFLOW = '.github/workflows/deploy.yml';
const RULESET = 'deploy-tags-admin-only';

const dryRun = process.argv.includes('--dry-run');
const gh = (args: string[], input?: string): string =>
  execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
const ghJson = <T = unknown>(args: string[]): T => JSON.parse(gh(['api', ...args])) as T;
const tryJson = <T>(args: string[], fallback: T): T => { try { return ghJson<T>(args); } catch { return fallback; } };

// The deployment and its gate ARE the workflow. Read it; no deploy workflow → nothing to provision.
let wfText: string;
try { wfText = readFileSync(WORKFLOW, 'utf8'); }
catch { console.log(`no ${WORKFLOW} — this install has no deploy to provision.`); process.exit(0); }
const wf = parse(wfText) as Record<string, any>;

// The gate the workflow declares: the gated environment + the promotion tag. (YAML parses `on` as the string
// key in the 1.2 core schema, but guard the 1.1 boolean-key quirk just in case.)
const on = (wf.on ?? wf[true as unknown as string]) ?? {};
const tag: string | undefined = Array.isArray(on.push?.tags) ? on.push.tags[0] : undefined;
const env: string | undefined = (() => {
  for (const job of Object.values(wf.jobs ?? {}) as Array<{ environment?: string | { name?: string } }>) {
    const e = job?.environment;
    if (e) return typeof e === 'string' ? e : e.name;
  }
  return undefined;
})();

// The boundary check lives HERE — the layer that interprets the deploy resource (the core stays blind to
// deploy). The gate IS the workflow declaring an environment + a promotion tag. Missing either = ungated.
if (!env) throw new Error(`${WORKFLOW}: the deploy job declares no \`environment:\` — that is the gate. No agent deploys: refusing to provision an ungated deploy.`);
if (!tag) throw new Error(`${WORKFLOW}: no \`on: push: tags:\` promotion tag — a deploy must be tag-gated.`);

// Reviewers = the org's maintainers var (governance policy — this the manifest legitimately carries),
// resolved to user ids. The manifest flattens policy.box → policy.
const manifest = (() => { try { return parse(readFileSync('.open-autonomy/autonomy.yml', 'utf8')) as Record<string, any>; } catch { return {}; } })();
const reviewersVar: string = manifest?.policy?.human?.maintainers_var ?? 'PUBLIC_AGENT_MAINTAINERS';

const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
const log: string[] = [];
const act = (label: string, fn: () => void): void => { if (dryRun) { log.push(`[dry-run] ${label}`); return; } fn(); log.push(`✓ ${label}`); };

// resolve the required reviewers (logins → user ids)
const raw = tryJson<{ value: string }>([`repos/${repo}/actions/variables/${reviewersVar}`], { value: '' }).value;
const logins = raw.split(/[\s,]+/).filter(Boolean);
const reviewerArgs = logins.map((l) => ghJson<{ id: number }>([`users/${l}`]).id)
  .flatMap((id) => ['-f', 'reviewers[][type]=User', '-F', `reviewers[][id]=${id}`]);
log.push(`  reviewers (${reviewersVar}): ${logins.join(', ') || '(none set — environment will require none)'}`);

// 1. the environment: required reviewers + no admin bypass + custom (tag) branch policy
act(`environment "${env}" (required reviewers, can_admins_bypass=false)`, () => {
  gh(['api', '-X', 'PUT', `repos/${repo}/environments/${env}`,
    '-F', 'can_admins_bypass=false',
    '-F', 'deployment_branch_policy[protected_branches]=false',
    '-F', 'deployment_branch_policy[custom_branch_policies]=true',
    ...reviewerArgs]);
});

// 2. the tag deployment policy: only `tag` may deploy to the environment (idempotent)
act(`deployment policy: tag "${tag}" may deploy to ${env}`, () => {
  const existing = ghJson<{ branch_policies: Array<{ name: string; type: string }> }>(
    [`repos/${repo}/environments/${env}/deployment-branch-policies`]).branch_policies ?? [];
  if (!existing.some((p) => p.name === tag && p.type === 'tag')) {
    gh(['api', '-X', 'POST', `repos/${repo}/environments/${env}/deployment-branch-policies`, '-f', `name=${tag}`, '-f', 'type=tag']);
  }
});

// 3. the ruleset: only admins may create the deploy tag (idempotent by name) — the front-line of "no agent deploys"
act(`ruleset "${RULESET}" (create/update/delete of ${tag} tags = admins only)`, () => {
  const body = JSON.stringify({
    name: RULESET, target: 'tag', enforcement: 'active',
    bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' }], // RepositoryRole 5 = admin
    conditions: { ref_name: { include: [`refs/tags/${tag}`], exclude: [] } },
    rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }],
  });
  const existing = ghJson<Array<{ id: number; name: string }>>([`repos/${repo}/rulesets`]).find((r) => r.name === RULESET);
  if (existing) gh(['api', '-X', 'PUT', `repos/${repo}/rulesets/${existing.id}`, '--input', '-'], body);
  else gh(['api', '-X', 'POST', `repos/${repo}/rulesets`, '--input', '-'], body);
});

// 4. report + the human-set inputs the workflow references (secrets + non-secret vars) — never set here.
console.log(`deploy provisioning for ${repo}${dryRun ? '  (dry-run — nothing changed)' : ''}:`);
for (const l of log) console.log('  ' + l);
const refs = (kind: 'secrets' | 'vars'): string[] =>
  [...new Set([...wfText.matchAll(new RegExp(`${kind}\\.([A-Z_][A-Z0-9_]*)`, 'g'))].map((m) => m[1]))].filter((n) => n !== 'GITHUB_TOKEN');
const envSecrets = tryJson<{ secrets: Array<{ name: string }> }>([`repos/${repo}/environments/${env}/secrets`], { secrets: [] }).secrets.map((s) => s.name);
for (const s of refs('secrets')) {
  console.log(envSecrets.includes(s) ? `  ✓ secret ${s} set on ${env}`
    : `  ⚠ MANUAL: gh secret set ${s} --env ${env} -R ${repo}   (deploy is inert until set)`);
}
const repoVars = tryJson<{ variables: Array<{ name: string }> }>([`repos/${repo}/actions/variables`], { variables: [] }).variables.map((v) => v.name);
for (const v of refs('vars').filter((n) => n !== reviewersVar)) {
  console.log(repoVars.includes(v) ? `  ✓ var ${v} set` : `  ⚠ MANUAL: gh variable set ${v} -R ${repo} --body <value>`);
}
