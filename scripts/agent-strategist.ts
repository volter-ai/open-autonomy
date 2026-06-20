#!/usr/bin/env bun
// Deterministic strategist agent (autonomy.ir.v1 behavior). Gathers research signals (networked but
// powerless — only the read-only gh token, no proxy admin secret in the gather step; fetched content
// is captured as untrusted data, never executed), synthesizes a roadmap proposal via the model, and
// opens a proposal PR handed off to the independent strategy reviewer. The strategist proposes; it
// does not merge. A faithful port of the former open-autonomy-strategist.yml.
import { $ } from 'bun';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { launch } from './runner.js';

const env = (k: string, d = '') => process.env[k] || d;
// Schedule and manual dispatch both apply (you run the strategist to propose); set the AGENT_APPLY
// repo var to "false" for a dry run that writes the proposal artifact without opening a PR.
const apply = process.env.AGENT_APPLY !== 'false';
const model = env('PUBLIC_AGENT_STRATEGIST_MODEL', env('PUBLIC_AGENT_PM_MODEL', 'gpt-4o-mini'));
const provider = env('PUBLIC_AGENT_STRATEGIST_PROVIDER', 'openai');
mkdirSync('.agent-run/strategist', { recursive: true });

// 1. Gather research signals from the configured sources.
const sources = '.open-autonomy/strategist-sources.json';
type Signal = { id: string; title: string; direction: string; source: string };
const signals: Signal[] = [];
if (existsSync(sources)) {
  const cfg = JSON.parse(readFileSync(sources, 'utf8')) as Record<string, { repos?: string[] }>;
  const dirLabel: Record<string, string> = {
    customer_demand: 'customer-demand',
    competitor_gaps: 'competitor-gap',
    analogous_fields: 'analogous-field',
  };
  for (const direction of ['customer_demand', 'competitor_gaps', 'analogous_fields'] as const) {
    for (const repo of cfg[direction]?.repos ?? []) {
      const raw = await $`gh issue list --repo ${repo} --state open --limit 20 --json number,title,url`.nothrow().text();
      let items: Array<{ number: number; title: string; url: string }> = [];
      try {
        items = JSON.parse(raw || '[]');
      } catch {
        items = [];
      }
      for (const it of items) {
        signals.push({ id: `${repo}#${it.number}`, title: it.title, direction: dirLabel[direction], source: it.url });
      }
    }
  }
}
await Bun.write(
  '.agent-run/strategist/signals.json',
  JSON.stringify({ schema: 'open-autonomy.strategist-signals.v1', signals }, null, 2),
);
console.log(`gathered ${signals.length} signals`);

// 2. Fetch prior strategist proposals (so the model does not re-propose them).
const prior = await $`gh pr list --state all --label origin:strategist --limit 50 --json title,body --jq '[.[] | .title + " " + (.body // "")] | join("\n")'`.nothrow().text();
await Bun.write('.agent-run/strategist/prior.txt', prior);

// 3. Synthesize the roadmap proposal (writes roadmap.yml + archive in place). The box's model endpoint is
// provisioned by the runner's setup step; the strategist just makes the transparent call.
if (!existsSync('.open-autonomy/strategist-archive.json')) await Bun.write('.open-autonomy/strategist-archive.json', '');
await $`bun scripts/public-agent-strategist.ts --roadmap .open-autonomy/roadmap.yml --constitution docs/CONSTITUTION.md --signals .agent-run/strategist/signals.json --prior-proposals .agent-run/strategist/prior.txt --archive .open-autonomy/strategist-archive.json --provider ${provider} --model ${model} --max-items ${env('PUBLIC_AGENT_STRATEGIST_MAX_ITEMS', '3')} --out .agent-run/strategist/proposal.json --roadmap-out .open-autonomy/roadmap.yml --archive-out .open-autonomy/strategist-archive.json`;

if (!apply) {
  console.log('strategist: dry run (manual dispatch); proposal written, no PR opened');
  process.exit(0);
}

// 6. Open the proposal PR (only if the roadmap actually changed) and hand off to strategy review.
if ((await $`git diff --quiet -- .open-autonomy/roadmap.yml`.nothrow()).exitCode === 0) {
  console.log('Strategist proposed no new roadmap items.');
  process.exit(0);
}
await $`gh label create origin:strategist --description "Roadmap proposal authored by the Open Autonomy strategist" --color 5319E7`.nothrow().quiet();
await $`git config user.name "open-autonomy-strategist"`;
await $`git config user.email "open-autonomy-strategist@users.noreply.github.com"`;
const branch = `strategist/roadmap-${env('GITHUB_RUN_ID')}`;
await $`git checkout -B ${branch}`;
await $`git add .open-autonomy/roadmap.yml .open-autonomy/strategist-archive.json`;
await $`git commit -m "strategist: propose roadmap items from research"`;
await $`git push --force-with-lease origin ${branch}`;

const proposal = JSON.parse(readFileSync('.agent-run/strategist/proposal.json', 'utf8')) as {
  summary: string;
  items: Array<{ title: string; direction: string; rationale: string; falsified_if: string; sources: string[] }>;
};
const body =
  `## Strategist roadmap proposal\n\n${proposal.summary}\n\n` +
  proposal.items
    .map(
      (i) =>
        `### ${i.title}\n- **Direction:** ${i.direction}\n- **Rationale:** ${i.rationale}\n- **Falsified if:** ${i.falsified_if}\n- **Sources:** ${i.sources.join(', ')}`,
    )
    .join('\n\n') +
  `\n\nProposed for strategy review. The strategist proposes; it does not merge.`;
await Bun.write('.agent-run/strategist/body.md', body);
const prUrl = (
  await $`gh pr create --base main --head ${branch} --title ${`Strategist: roadmap proposal (${proposal.summary.slice(0, 60)})`} --body-file .agent-run/strategist/body.md --label origin:strategist`.nothrow().text()
).trim();
const prNumber = prUrl.match(/(\d+)$/)?.[1];
// Hand off to the independent strategy reviewer through the runner (agent:launch) — the author states
// intent ("review this proposal"); how the substrate starts the reviewer is the runner's concern.
if (prNumber) {
  await launch('strategy_reviewer', { issue_number: prNumber });
}
