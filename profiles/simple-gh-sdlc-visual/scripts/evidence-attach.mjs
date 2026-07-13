#!/usr/bin/env node
// evidence-attach.mjs — turn a visual-edit demo/visual-state run into ztrack
// AC evidence.
//
// Usage (documented default — STORED mode; the develop/reviewer skills always use this):
//   node scripts/evidence-attach.mjs --run <run-dir> --issue <ISSUE> [--note <acId>=<text>,...] [--dry-run]
// Legacy/loose-file mode (a plain markdown file that is NOT a ztrack-stored issue):
//   node scripts/evidence-attach.mjs --run <run-dir> --issue-file <path> [--note <acId>=<text>,...] [--dry-run]
//
// Reads <run-dir>/summary.json (a playwright-demo or playwright-visual-state
// run) and, for every step whose acIds are non-empty, attaches the step's
// screenshot to ztrack as evidence for that AC, then records it as
// passed/checked with a proof, then re-checks the issue.
//
// TWO TARGET MODES (mutually exclusive) — this is the one seam a caller must
// choose correctly:
//   --issue <ztrack-id>   STORED mode (the documented default since the store-native
//                         refactor): the target is a ztrack-managed issue committed to
//                         the local markdown store (e.g. "COMBO-3"). Mutates it via
//                         `ztrack ac patch` / `ztrack issue view --json` — the develop
//                         skill's §Baseline/§DryRun and the reviewer skill both operate
//                         against this mode exclusively; the committed store file IS
//                         the evidence-of-record, riding in the PR diff alongside the
//                         implementation commit.
//   --issue-file <path>   LOOSE-FILE mode (legacy — kept for a caller that still holds
//                         an issue body OUTSIDE the tracker store, e.g. a plain markdown
//                         file never registered as a ztrack source). `ztrack ac patch`
//                         does not apply to a loose file (see
//                         standards/issue-and-evidence.md); this mode instead
//                         reads the AC's current version + text straight out of
//                         the file and SPLICES the evidence/proof sub-bullets
//                         into it in place, in the same
//                         `evidence evN: … acv=<n>` / `proof: "…" -> evN` shape
//                         `ztrack check` expects — no `--map` flag, no separate
//                         "writes lines into $ISSUE_MD" side-channel: this IS
//                         that channel, real and testable.
// When neither is given, the acId's issue segment (e.g. "COMBO-3" in
// "COMBO-3#dev/01") is used as the stored-tracker id, preserving old behavior.
//
// acId encoding: "<ISSUE>#<acId>", e.g. "COMBO-3#dev/01" or "COMBO-9#bk/01" — the
// demo/visual-state script owns setting this string on each step/visualState;
// this adapter only parses it. "#" was chosen because ztrack acIds already
// contain "/" internally (e.g. "dev/01"), so "/" can't also be the issue
// delimiter. In --issue-file mode the issue segment is not used to resolve a
// tracker id (there is exactly one target file) but is still required by the
// encoding and is checked for consistency if --issue-file's basename embeds
// the issue number.
//
// --note <acId>=<free text>[,<acId>=<free text>...] (optional, works in BOTH
// target modes): appended verbatim to that AC's proof explanation. This is how a
// bk/02 (dry-run/after) proof names the bk/01 (baseline/before) evidence path
// it reverses/confirms — the cross-reference the bookkeeping ACs require.
//
// Hard invariants:
//   - never attach evidence from a run whose top-level status !== 'pass'
//   - evidence file must be committed to git BEFORE the commit sha is cited
//     in the AC patch (ztrack check verifies the cited commit really holds
//     the artifact)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`evidence-attach: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { run: null, issue: null, issueFile: null, notes: {}, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--run') args.run = argv[++i];
    else if (arg === '--issue') args.issue = argv[++i];
    else if (arg === '--issue-file') args.issueFile = argv[++i];
    else if (arg === '--note') {
      const raw = argv[++i] || '';
      for (const pair of raw.split(',')) {
        const eq = pair.indexOf('=');
        if (eq <= 0) fail(`--note entry "${pair}" must be "<acId>=<text>"`);
        args.notes[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
    }
    else if (arg === '--dry-run') args.dryRun = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (!args.run) fail('--run <run-dir> is required');
  if (args.issue && args.issueFile) fail('--issue and --issue-file are mutually exclusive — pick one target mode');
  return args;
}

function sh(cmd, cmdArgs, options = {}) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', ...options }).trim();
}

// Stage + commit an evidence artifact, returning the sha the evidence line must cite.
// `ztrack evidence add` stores the artifact by PATH with fixed content, so a re-run — or a
// second AC citing the SAME screenshot in one run (the develop skill's §DryRun(c) explicitly
// maps one dry-run step to BOTH `dev/NN` and `bk/02`) — re-writes identical bytes over a path
// that is already committed. `git commit` then fails "nothing to commit", which used to crash
// the adapter mid-run and leave the issue file half-spliced. When there is nothing staged for
// the artifact, the invariant we actually need — the cited commit CONTAINS the artifact —
// already holds at HEAD, so cite HEAD instead of committing.
function commitEvidence(evidencePath, message) {
  sh('git', ['add', evidencePath]);
  let staged = true;
  try {
    sh('git', ['diff', '--cached', '--quiet', '--', evidencePath]); // exit 0 => index matches HEAD
    staged = false;
  } catch {
    staged = true; // nonzero exit => the artifact is newly staged/changed
  }
  if (staged) {
    sh('git', ['commit', '-m', message]);
  } else {
    console.log(`artifact ${evidencePath} is already committed unchanged — citing existing HEAD`);
  }
  return sh('git', ['rev-parse', 'HEAD']);
}

// Normalize a demo run (steps[]) and a visual-state run (single implicit
// step, acIds on the top-level visualState) into one shape: a list of
// { stepId, name, narration, acIds, screenshotPath }.
function collectSteps(summary, runDir) {
  if (Array.isArray(summary.steps) && summary.steps.length > 0) {
    return summary.steps.map((step) => ({
      stepId: step.id,
      name: step.name,
      narration: step.narration || step.name,
      acIds: step.acIds || [],
      screenshotPath: step.evidence?.screenshot
        ? path.resolve(runDir, step.evidence.screenshot)
        : null,
    }));
  }
  // visual-state shape: one implicit step, acIds live on summary.visualState.
  const acIds = summary.visualState?.acIds || [];
  const screenshot = summary.evidence?.screenshot;
  return [{
    stepId: summary.visualState?.slug || 'visual-state',
    name: summary.visualState?.name || 'visual state',
    narration: `Reached visual state "${summary.visualState?.name || summary.visualState?.slug}".`,
    acIds,
    screenshotPath: screenshot ? path.resolve(runDir, screenshot) : null,
  }];
}

function parseAcId(raw, forcedIssue) {
  const idx = raw.indexOf('#');
  if (idx === -1) fail(`acId "${raw}" is missing the "#" delimiter (expected "<ISSUE>#<acId>")`);
  const issue = raw.slice(0, idx);
  const acId = raw.slice(idx + 1);
  if (!issue || !acId) fail(`acId "${raw}" did not parse into a non-empty issue and acId`);
  if (forcedIssue && forcedIssue !== 'auto' && forcedIssue !== issue) {
    fail(`--issue ${forcedIssue} was given but acId "${raw}" names issue ${issue}`);
  }
  return { issue, acId };
}

// ztrack stores each AC's version inline in the issue body, e.g.
// "- [ ] dev/01 v1 Clicking ...". There is no structured per-AC JSON field
// for it (confirmed via `ztrack issue view --json`), so we regex it out of
// the body text. This is the one genuinely fragile seam in this adapter.
function readAcVersion(issue, acId) {
  let json;
  try {
    json = sh('npx', ['ztrack', 'issue', 'view', issue, '--json']);
  } catch (error) {
    fail(`acId "${issue}#${acId}" does not resolve: ${(error.stderr || error.message || '').trim() || `ztrack issue view ${issue} failed`}`);
  }
  const body = JSON.parse(json).body || '';
  const escaped = acId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`\\[[ x]\\]\\s+${escaped}\\s+v(\\d+)`));
  if (!match) fail(`could not find AC "${acId}" (with a "vN" version) in ${issue}'s body`);
  return Number(match[1]);
}

// --issue-file mode: same version lookup, but read straight out of the loose
// file's text instead of shelling out to `ztrack issue view` (which only
// knows about STORED issues).
function readAcVersionFromFile(fileText, acId, filePath) {
  const escaped = acId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = fileText.match(new RegExp(`\\[[ x]\\]\\s+${escaped}\\s+v(\\d+)`));
  if (!match) fail(`could not find AC "${acId}" (with a "vN" version) in ${filePath}`);
  return Number(match[1]);
}

// --issue-file mode: splice an `evidence evN: …` + `proof: "…" -> evN` pair
// under the named AC's checkbox line, mirroring exactly the shape
// `ztrack check` parses (see .volter/tracker/validation/preset.mts's
// parseEvidenceLine/parseAcLine) and the develop skill documents by hand.
// - Replaces any existing `- status:` line's mismatched checkbox state.
// - Replaces a pre-existing `evidence evN:`/`proof:` block for the same AC
//   (idempotent re-run) rather than duplicating it.
function spliceEvidenceIntoFile(fileText, { acId, evidenceLine, proofLine }) {
  const escaped = acId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = fileText.split('\n');
  const acLineRe = new RegExp(`^(\\s*)-\\s+\\[[ x]\\]\\s+${escaped}\\s+v\\d+\\s+.*$`);
  const acLineIdx = lines.findIndex((l) => acLineRe.test(l));
  if (acLineIdx === -1) fail(`could not find AC checkbox line for "${acId}" to splice evidence into`);
  const indent = (lines[acLineIdx].match(/^(\s*)-/) || ['', ''])[1];
  const subIndent = `${indent}  `;

  // Check the box + flip status: passed on the AC line itself.
  lines[acLineIdx] = lines[acLineIdx].replace(/^(\s*)-\s+\[[ x]\]/, '$1- [x]');

  // Find the extent of this AC's existing sub-bullet block (indented lines
  // immediately following the AC line) so old status/evidence/proof lines can
  // be replaced rather than duplicated on a re-run.
  let blockEnd = acLineIdx + 1;
  while (blockEnd < lines.length && lines[blockEnd].startsWith(subIndent)) blockEnd += 1;
  const block = lines.slice(acLineIdx + 1, blockEnd).filter((l) => !/^\s*-\s+(status|evidence\s+\S+|proof)\s*:/.test(l));

  const newBlock = [
    `${subIndent}- status: passed`,
    `${subIndent}- ${evidenceLine}`,
    `${subIndent}- ${proofLine}`,
    ...block,
  ];
  lines.splice(acLineIdx + 1, blockEnd - (acLineIdx + 1), ...newBlock);
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args.run);
  const summaryPath = path.join(runDir, 'summary.json');
  if (!fs.existsSync(summaryPath)) fail(`no summary.json at ${summaryPath}`);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  if (summary.status !== 'pass') {
    fail(`run status is "${summary.status}", not "pass" — never attach evidence from a non-passing run (${summaryPath})`);
  }

  if (args.issueFile && !fs.existsSync(args.issueFile)) fail(`--issue-file ${args.issueFile} does not exist`);

  const steps = collectSteps(summary, runDir);
  const runId = path.basename(runDir);

  // Group evidence per (issue, acId): each step contributes at most one
  // screenshot to each acId it lists.
  const groups = new Map(); // key `${issue}#${acId}` -> { issue, acId, stepId, name, narration, screenshotPath }
  for (const step of steps) {
    if (!step.acIds || step.acIds.length === 0) continue;
    if (!step.screenshotPath) fail(`step "${step.stepId}" has acIds but no evidence.screenshot`);
    if (!fs.existsSync(step.screenshotPath)) fail(`screenshot not found: ${step.screenshotPath}`);
    for (const raw of step.acIds) {
      const { issue, acId } = parseAcId(raw, args.issue);
      const key = `${issue}#${acId}`;
      if (groups.has(key)) fail(`acId "${key}" is claimed by more than one step in this run — one screenshot per AC expected`);
      groups.set(key, { issue, acId, stepId: step.stepId, name: step.name, narration: step.narration, screenshotPath: step.screenshotPath });
    }
  }

  if (groups.size === 0) fail(`no steps in ${summaryPath} carry acIds — nothing to attach`);

  for (const acId of Object.keys(args.notes)) {
    const matches = [...groups.keys()].some((k) => k.endsWith(`#${acId}`));
    if (!matches) fail(`--note references acId "${acId}", which no step in this run carries`);
  }

  if (args.issueFile) {
    // LOOSE-FILE mode: read/validate versions straight from the file; no
    // `ztrack issue view`/`ac patch` shelling (those target a stored issue).
    let fileText = fs.readFileSync(args.issueFile, 'utf8');
    for (const group of groups.values()) {
      group.acVersion = readAcVersionFromFile(fileText, group.acId, args.issueFile);
    }

    if (args.dryRun) {
      console.log('evidence-attach: --dry-run (--issue-file mode), no git/file mutation. Plan:');
      for (const { issue, acId, stepId, name, screenshotPath } of groups.values()) {
        console.log(`\n[${issue} ${acId}] step "${stepId}" (${name})`);
        console.log(`  screenshot: ${screenshotPath}`);
        console.log(`  would run: npx ztrack evidence add "${screenshotPath}" --commit`);
        console.log(`  would run: git add <copied evidence path> && git commit -m "evidence: ${issue} ${acId} (${runId})"`);
        console.log(`  would splice into ${args.issueFile}: evidence evN: image=<copied path> sha256=<sha256:hex-already-prefixed> commit=<HEAD after commit> acv=<N>`);
        console.log(`  would splice into ${args.issueFile}: proof: "..." -> evN`);
      }
      return;
    }

    for (const { issue, acId, name, narration, screenshotPath, acVersion } of groups.values()) {
      console.log(`\n=== ${issue} ${acId} (${args.issueFile}) ===`);

      const addOutput = sh('npx', ['ztrack', 'evidence', 'add', screenshotPath, '--commit']);
      console.log(addOutput);
      const { path: evidencePath, sha256 } = JSON.parse(addOutput);

      const commitSha = commitEvidence(evidencePath, `evidence: ${issue} ${acId} (${runId})`);
      console.log(`committed evidence at ${commitSha}`);

      // `sha256` from `ztrack evidence add`'s JSON output is already prefixed ("sha256:<hex>") —
      // do not re-prefix it here (that would double it to "sha256=sha256:sha256:<hex>").
      const evidenceLine = `evidence ev1: image=${evidencePath} sha256=${sha256} commit=${commitSha} acv=${acVersion}`;
      const explanation = `${narration} (visual-edit run ${runId}, step "${name}")${args.notes[acId] ? ` — ${args.notes[acId]}` : ''}`;
      const proofLine = `proof: "${explanation}" -> ev1`;

      fileText = spliceEvidenceIntoFile(fileText, { acId, evidenceLine, proofLine });
      fs.writeFileSync(args.issueFile, fileText);
      console.log(`spliced evidence + proof for ${acId} into ${args.issueFile}`);
    }

    console.log(`\n=== ztrack check ${args.issueFile} ===`);
    try {
      const checkOutput = sh('npx', ['ztrack', 'check', args.issueFile]);
      console.log(checkOutput);
    } catch (error) {
      console.log(error.stdout || '');
      console.error(error.stderr || error.message);
      process.exit(1);
    }
    return;
  }

  // STORED-TRACKER mode (original behavior): target is a ztrack-managed
  // issue id, mutated via `ztrack ac patch`.

  // Validate every (issue, acId) against the tracker BEFORE any git/tracker
  // mutation: a typo'd acId (nonexistent issue or AC) must fail loudly here,
  // not after an evidence commit has already been created for it. This also
  // makes --dry-run catch typos. readAcVersion is read-only (`issue view`).
  for (const group of groups.values()) {
    group.acVersion = readAcVersion(group.issue, group.acId);
  }

  if (args.dryRun) {
    console.log('evidence-attach: --dry-run, no git/tracker mutation. Plan:');
    for (const { issue, acId, stepId, name, screenshotPath } of groups.values()) {
      console.log(`\n[${issue} ${acId}] step "${stepId}" (${name})`);
      console.log(`  screenshot: ${screenshotPath}`);
      console.log(`  would run: npx ztrack evidence add "${screenshotPath}" --commit`);
      console.log(`  would run: git add <copied evidence path> && git commit -m "evidence: ${issue} ${acId} (${runId})"`);
      console.log(`  would run: npx ztrack ac patch ${issue} ${acId} --json '{"checked":true,"status":"passed","evidence":[{"id":"ev1","image":"<copied path>","commit":"<HEAD after commit>","acVersion":<N>}],"proof":{"explanation":"...","evidenceRefs":["ev1"]}}'`);
      console.log(`  would run: npx ztrack check ${issue}`);
    }
    return;
  }

  const checkedIssues = new Set();
  for (const { issue, acId, name, narration, screenshotPath, acVersion } of groups.values()) {
    console.log(`\n=== ${issue} ${acId} ===`);

    const addOutput = sh('npx', ['ztrack', 'evidence', 'add', screenshotPath, '--commit']);
    console.log(addOutput);
    const { path: evidencePath, sha256 } = JSON.parse(addOutput);

    const commitSha = commitEvidence(evidencePath, `evidence: ${issue} ${acId} (${runId})`);
    console.log(`committed evidence at ${commitSha}`);

    const patchBody = {
      checked: true,
      status: 'passed',
      evidence: [{ id: 'ev1', image: evidencePath, sha256, commit: commitSha, acVersion }],
      proof: {
        explanation: `${narration} (visual-edit run ${runId}, step "${name}")${args.notes[acId] ? ` — ${args.notes[acId]}` : ''}`,
        evidenceRefs: ['ev1'],
      },
    };
    const patchOutput = sh('npx', ['ztrack', 'ac', 'patch', issue, acId, '--json', JSON.stringify(patchBody)]);
    console.log(patchOutput);

    checkedIssues.add(issue);
  }

  let exitCode = 0;
  for (const issue of checkedIssues) {
    console.log(`\n=== ztrack check ${issue} ===`);
    try {
      const checkOutput = sh('npx', ['ztrack', 'check', issue]);
      console.log(checkOutput);
    } catch (error) {
      exitCode = 1;
      console.log(error.stdout || '');
      console.error(error.stderr || error.message);
    }
  }
  if (exitCode !== 0) process.exit(exitCode);
}

main();
