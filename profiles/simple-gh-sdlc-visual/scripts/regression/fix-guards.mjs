#!/usr/bin/env node
// fix-guards.mjs — PROFILE-LEVEL regression guards for two previously-landed fixes in the
// `simple-gh-sdlc-visual` profile, so they cannot silently regress.
//
//   Guard 1 — vendor-scan shape-completeness (scripts/world-smoke.mjs stage-4 pass-1, landed
//     in PR #192 / commit 5ad2139 "fix(profile): close vendor-scan false-greens"). Pre-fix, a
//     vendor reached ONLY via a dynamic-import call (`import('<pkg>/sub')`) or ONLY via a
//     static SUBPATH specifier (`from '<pkg>/deep'`) was invisible to the stage-4 pass-1
//     coverage scan — real, untwinned egress could slide through a green `smoke:coverage`
//     gate. Proven here the same way the landing fix itself was proven (see PR #192's
//     description): a VENDOR_REGISTRY-named vendor with no twin and no declared opening is a
//     hard stage-4 FAIL in every mode `world-smoke.mjs --coverage-only` runs, so it gives a
//     clean, isolated RED/GREEN signal per import shape.
//
//     `--coverage-only` reads `world.config.json` from the PROFILE ROOT
//     (`path.dirname(world-smoke.mjs)/..`) with no env/cwd override — and this profile is a
//     TEMPLATE, so no `world.config.json` exists in the tree at all (confirmed: a bare
//     `--coverage-only` run against this profile throws ENOENT). This guard therefore
//     provisions a MINIMAL FIXTURE `world.config.json` (empty `services`, empty `openings` —
//     nothing twinned, nothing opened, so the probe vendor is genuinely uncovered) directly at
//     the profile root for the duration of the check, and restores the tree to exactly its
//     prior state (removes the file if it didn't exist before; restores it byte-identical if it
//     somehow did) in a finally block.
//
//     Two VENDOR_REGISTRY entries that are not imported anywhere in this profile's real
//     `apps`/`scripts` source (verified below as a precondition) are used as probes, one per
//     blind-spot shape — matching the technique proven in the sibling Ponder-repo harness
//     (scripts/regression/local-3-fix-guards.mjs Guard 1): vendor A reached ONLY via a
//     dynamic-import-shaped call, and vendor B reached ONLY via a static-import SUBPATH
//     specifier. Neither probe package is installed — the scan is a pure text/regex read of
//     source files; the package is never resolved/imported for real.
//
//   Guard 2 — provenance stamping (apps/web/.visual-edit/lib/demo-runner.mjs, landed in PR #192
//     / commit e25f8b9 "feat(profile): stamp git sha + dirty-flag into demo-runner
//     summary.json"). `runDemo()`'s emitted `summary.json` must carry `gitSha`/`gitBranch`/
//     `gitDirty`, captured once at run start via the (previously un-exported) helper
//     `captureGitProvenance(cwd)`.
//
//     LIGHT BY DESIGN — NO BROWSER IN CI: `demo-runner.mjs` does `import { chromium } from
//     'playwright'` at module scope, and this profile ships no `playwright` dependency of its
//     own (it's a template — the adopting app supplies it). A plain `import()` of the real file
//     throws `Cannot find package 'playwright'` in any environment (like this repo, and like
//     this guard's own CI job) that hasn't separately installed Playwright — confirmed by hand
//     before writing this guard. So this guard does NOT import demo-runner.mjs as a module.
//     Instead:
//       (a) STATIC assertions on the real source text: `captureGitProvenance` is exported, and
//           the `summary.json` object literal actually stamps `gitSha`, `gitBranch`, `gitDirty`
//           (keys present, sourced from the destructured `captureGitProvenance(...)` call, not
//           from some other unrelated identifier).
//       (b) A LIGHT DYNAMIC check of the real logic, without the playwright import: the
//           `captureGitProvenance` function body is a small, self-contained pure-ish function
//           (its only dependency is `node:child_process`'s `execFileSync`, no closure over
//           anything playwright-related — verified by reading the file). This guard extracts
//           the EXACT function source text (by slicing between its `function
//           captureGitProvenance(cwd) {` header and its matching closing brace) straight out of
//           the real file, wraps it in a tiny ESM module, and dynamically imports THAT — so the
//           function body under test is byte-identical to what ships, never a hand-copied
//           reimplementation, and no browser/Playwright is ever touched. It is then called
//           against this repo's own working tree and asserted to return `gitSha === \`git
//           rev-parse HEAD\`` and a non-empty `gitBranch`.
//     LOAD-BEARING PROOF: a SCRATCH COPY of the real file (never the tracked file itself) has
//     the three summary fields temporarily deleted from the object literal; the static
//     assertion is re-run against that mutated copy and shown to fail; the scratch copy is then
//     discarded (the tracked file was never touched).
//
// OUT OF SCOPE: twin-scenario strict load-time validation (an unknown scenario predicate key,
// e.g. a "hasTools" typo, must be rejected at load rather than silently dropped) is NOT guarded
// here. That fix lives in the TWIN package (@volter/twin-anthropic), not in this profile's own
// source — it is already covered by 57 tests in the twin repo's own PR #34. Guarding it from
// this profile would either (a) require vendoring/installing the twin package here, which this
// profile template does not do, or (b) fake a check against logic this profile doesn't own.
// Neither is honest, so it is deliberately left out. Do not add a fake third guard for it.
//
// Exit 0 iff both guards pass; exit 1 otherwise. Idempotent and crash-safe: every fixture file
// this script creates is removed, and every file it mutates is restored byte-identical, in a
// finally block — even on a thrown error or an assertion failure.
//
// Usage: node profiles/simple-gh-sdlc-visual/scripts/regression/fix-guards.mjs   (Node 22)

import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_ROOT = path.resolve(HERE, '..', '..'); // profiles/simple-gh-sdlc-visual
const REPO_ROOT = path.resolve(PROFILE_ROOT, '..', '..'); // repo root (for `git rev-parse HEAD` etc)
const WORLD_SMOKE = path.join(PROFILE_ROOT, 'scripts/world-smoke.mjs');
const WORLD_CONFIG = path.join(PROFILE_ROOT, 'world.config.json');
const DEMO_RUNNER = path.join(PROFILE_ROOT, 'apps/web/.visual-edit/lib/demo-runner.mjs');
const REGRESSION_DIR = path.join(PROFILE_ROOT, 'scripts/regression');

// Probe vendor names for Guard 1, kept as plain identifiers (not concatenated) since this file
// is under scripts/regression/ and is NOT part of world-smoke.mjs's own repo-wide vendor scan
// input set in the sense that matters here — it legitimately mentions these names because they
// are the guard's declared probes, exactly like world-smoke.mjs's own VENDOR_REGISTRY table
// mentions them. (Unlike the Ponder harness, this file does not need string-concatenation
// obfuscation: the precondition check below excludes this file itself from the "clean probe"
// scan, and the probe import SHAPES only ever appear inside generated fixture files, never in
// this file's own text.)
const PROBE_VENDOR_A = 'plaid'; // dynamic-import shape probe (VENDOR_REGISTRY: plaid -> ['plaid'])
const PROBE_VENDOR_B_PKG = '@sendgrid/mail'; // static-subpath shape probe (VENDOR_REGISTRY: sendgrid)
const PROBE_VENDOR_B_NAME = 'sendgrid';

const results = []; // { name, pass, detail }

function log(line) {
  process.stdout.write(`${line}\n`);
}

function section(title) {
  log('');
  log(`=== ${title} ===`);
}

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: PROFILE_ROOT,
    encoding: 'utf8',
    ...opts,
  });
  return {
    status: res.status === null ? (res.signal ? 1 : 0) : res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

// ---------------------------------------------------------------------------------------
// Guard 1 — vendor-scan shape-completeness (world-smoke.mjs stage-4 pass-1)
// ---------------------------------------------------------------------------------------
async function guard1VendorScan() {
  section('Guard 1: vendor-scan shape-completeness (world-smoke.mjs stage-4 pass-1)');

  const dynFixture = path.join(REGRESSION_DIR, '_g1-dynamic-only.tmp.mjs');
  const subpathFixture = path.join(REGRESSION_DIR, '_g1-subpath-only.tmp.mjs');
  const worldConfigPreexisted = fs.existsSync(WORLD_CONFIG);
  const originalWorldConfig = worldConfigPreexisted ? fs.readFileSync(WORLD_CONFIG, 'utf8') : null;

  const cleanups = [];
  const cleanupAll = () => {
    for (const fn of cleanups.splice(0)) {
      try { fn(); } catch { /* best-effort */ }
    }
    // Restore world.config.json to exactly its prior state no matter what happened above.
    if (worldConfigPreexisted) {
      if (fs.readFileSync(WORLD_CONFIG, 'utf8') !== originalWorldConfig) {
        fs.writeFileSync(WORLD_CONFIG, originalWorldConfig);
      }
    } else if (fs.existsSync(WORLD_CONFIG)) {
      fs.rmSync(WORLD_CONFIG, { force: true });
    }
  };

  try {
    // Precondition: neither probe vendor is actually imported anywhere in this profile's real
    // apps/scripts source, so any FAIL naming them below is caused ONLY by our fixture, not
    // pre-existing usage. world-smoke.mjs (the VENDOR_REGISTRY table) and this harness file
    // itself are excluded — they legitimately mention both vendor names as registry/probe
    // identifiers but never actually import either package.
    const pattern = [
      `from ['"]${PROBE_VENDOR_A}`,
      `require\\(['"]${PROBE_VENDOR_A}`,
      `import\\(['"]${PROBE_VENDOR_A}`,
      PROBE_VENDOR_B_PKG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ].join('|');
    const grep = run('git', ['grep', '-l', '-E', pattern, '--', 'apps', 'scripts'], { cwd: PROFILE_ROOT });
    const excluded = new Set(['scripts/world-smoke.mjs', 'scripts/regression/fix-guards.mjs']);
    const hits = grep.stdout.split('\n').map((f) => f.trim()).filter((f) => f && !excluded.has(f));
    assert(hits.length === 0, `precondition failed: probe vendors already referenced in real profile source: ${hits.join(', ')}`);
    record('Guard1.precondition', true, 'both probe vendors (plaid, @sendgrid/mail) are not imported anywhere in real profile apps/scripts source (clean probes)');

    // --- Provision the fixture world.config.json: nothing twinned, nothing opened ----------
    fs.writeFileSync(WORLD_CONFIG, `${JSON.stringify({ services: [], openings: [] }, null, 2)}\n`);
    if (!worldConfigPreexisted) cleanups.push(() => { if (fs.existsSync(WORLD_CONFIG)) fs.rmSync(WORLD_CONFIG, { force: true }); });

    // --- Baseline: coverage-only must PASS with no fixture, confirming a later FAIL is
    // fixture-caused (not pre-existing real source already tripping the rule). -------------
    const baseline = run(process.execPath, [WORLD_SMOKE, '--coverage-only']);
    assert(baseline.status === 0, `baseline coverage-only expected exit 0, got ${baseline.status}. stdout tail: ${baseline.stdout.slice(-2000)}`);
    assert(/SMOKE-COVERAGE: PASS/.test(baseline.stdout), 'baseline coverage-only did not print SMOKE-COVERAGE: PASS');
    record('Guard1.baseline', true, `coverage-only PASS with empty fixture world.config.json + no probe fixture (exit ${baseline.status})`);

    // --- Shape (a): dynamic-import-only fixture, vendor A (plaid) --------------------------
    fs.writeFileSync(dynFixture, `export async function loadVendorA() {\n  return import('${PROBE_VENDOR_A}/sub');\n}\n`);
    cleanups.push(() => fs.rmSync(dynFixture, { force: true }));

    const dynRed = run(process.execPath, [WORLD_SMOKE, '--coverage-only'], {
      env: { ...process.env, SMOKE_SOURCE_FILES: 'scripts/regression/_g1-dynamic-only.tmp.mjs' },
    });
    const dynRedNamesVendor = new RegExp(`DEFAULT-SEALED VIOLATION.*\\b${PROBE_VENDOR_A}\\b`).test(dynRed.stdout);
    assert(dynRed.status === 1, `dynamic-import-only fixture expected exit 1 (RED), got ${dynRed.status}. stdout tail: ${dynRed.stdout.slice(-1500)}`);
    assert(dynRedNamesVendor, `FAIL message did not name vendor A ("${PROBE_VENDOR_A}"). stdout tail: ${dynRed.stdout.slice(-1500)}`);
    record('Guard1.shapeA-dynamic-import.RED', true, `dynamic-import-only fixture (import('${PROBE_VENDOR_A}/sub')): exit ${dynRed.status}, FAIL names "${PROBE_VENDOR_A}" — the exact pre-fix blind spot (dynamic-import shape)`);

    fs.rmSync(dynFixture, { force: true });
    cleanups.pop();
    const dynGreen = run(process.execPath, [WORLD_SMOKE, '--coverage-only']);
    assert(dynGreen.status === 0 && /SMOKE-COVERAGE: PASS/.test(dynGreen.stdout), `after removing dynamic fixture, expected coverage-only PASS, got exit ${dynGreen.status}`);
    record('Guard1.shapeA-dynamic-import.GREEN', true, `fixture removed -> coverage-only PASS again (exit ${dynGreen.status})`);

    // --- Shape (b): static subpath specifier only, vendor B (@sendgrid/mail -> sendgrid) ---
    fs.writeFileSync(subpathFixture, `import { Client } from '${PROBE_VENDOR_B_PKG}/src/mail';\nexport const client = Client;\n`);
    cleanups.push(() => fs.rmSync(subpathFixture, { force: true }));

    const subRed = run(process.execPath, [WORLD_SMOKE, '--coverage-only'], {
      env: { ...process.env, SMOKE_SOURCE_FILES: 'scripts/regression/_g1-subpath-only.tmp.mjs' },
    });
    // world-smoke.mjs derives the vendor NAME from the VENDOR_REGISTRY entry key ("sendgrid"),
    // not the package specifier string, so assert on that key directly.
    const subRedNamesVendor = new RegExp(`DEFAULT-SEALED VIOLATION.*\\b${PROBE_VENDOR_B_NAME}\\b`).test(subRed.stdout);
    assert(subRed.status === 1, `subpath-only fixture expected exit 1 (RED), got ${subRed.status}. stdout tail: ${subRed.stdout.slice(-1500)}`);
    assert(subRedNamesVendor, `FAIL message did not name vendor B ("${PROBE_VENDOR_B_NAME}"). stdout tail: ${subRed.stdout.slice(-1500)}`);
    record('Guard1.shapeB-subpath.RED', true, `static-subpath-only fixture (from '${PROBE_VENDOR_B_PKG}/src/mail'): exit ${subRed.status}, FAIL names "${PROBE_VENDOR_B_NAME}" — the exact pre-fix blind spot (static-subpath shape)`);

    fs.rmSync(subpathFixture, { force: true });
    cleanups.pop();
    const subGreen = run(process.execPath, [WORLD_SMOKE, '--coverage-only']);
    assert(subGreen.status === 0 && /SMOKE-COVERAGE: PASS/.test(subGreen.stdout), `after removing subpath fixture, expected coverage-only PASS, got exit ${subGreen.status}`);
    record('Guard1.shapeB-subpath.GREEN', true, `fixture removed -> coverage-only PASS again (exit ${subGreen.status})`);

    return true;
  } catch (err) {
    record('Guard1', false, err instanceof Error ? err.message : String(err));
    return false;
  } finally {
    cleanupAll();
  }
}

// ---------------------------------------------------------------------------------------
// Guard 2 — provenance stamping (demo-runner.mjs summary.json gitSha/gitBranch/gitDirty)
// ---------------------------------------------------------------------------------------

// Extract the exact `function captureGitProvenance(cwd) { ... }` source text out of the real
// file by brace-matching from its header line — never a hand-copied reimplementation. Returns
// the source text (including the `function` keyword) or throws if the function/export is not
// found in the shape this guard expects.
function extractCaptureGitProvenanceSource(fileText) {
  const headerRe = /export\s+function\s+captureGitProvenance\s*\(\s*cwd\s*\)\s*\{|function\s+captureGitProvenance\s*\(\s*cwd\s*\)\s*\{/;
  const m = headerRe.exec(fileText);
  if (!m) throw new Error('captureGitProvenance(cwd) function header not found in demo-runner.mjs (expected shape: "function captureGitProvenance(cwd) {" or exported)');
  const isExported = m[0].startsWith('export');
  const startOfBraceBody = m.index + m[0].length - 1; // index of the opening '{'
  let depth = 0;
  let endIdx = -1;
  for (let i = startOfBraceBody; i < fileText.length; i += 1) {
    const ch = fileText[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx === -1) throw new Error('could not find matching closing brace for captureGitProvenance(cwd)');
  const src = fileText.slice(m.index, endIdx + 1);
  return { src: isExported ? src : `export ${src}`, isExported };
}

async function guard2Provenance() {
  section('Guard 2: provenance stamping (demo-runner.mjs summary.json gitSha/gitBranch/gitDirty)');

  try {
    assert(fs.existsSync(DEMO_RUNNER), `demo-runner.mjs not found at ${DEMO_RUNNER}`);
    const source = fs.readFileSync(DEMO_RUNNER, 'utf8');

    // --- Static assertion (a): captureGitProvenance is exported --------------------------
    assert(/export\s+function\s+captureGitProvenance\s*\(/.test(source), 'captureGitProvenance is not exported from demo-runner.mjs — Guard 2 needs it exported to dynamically exercise the real logic without importing the (playwright-dependent) module; see this file\'s own header comment for why a plain module import is not viable in this CI');
    record('Guard2.exported', true, 'captureGitProvenance(cwd) is exported from demo-runner.mjs');

    // --- Static assertion (b): the summary.json object literal actually stamps the three
    // provenance fields, sourced from the captureGitProvenance destructure. ----------------
    assert(/const\s*\{\s*gitSha\s*,\s*gitDirty\s*,\s*gitBranch\s*\}\s*=\s*captureGitProvenance\(/.test(source), 'demo-runner.mjs no longer destructures { gitSha, gitDirty, gitBranch } = captureGitProvenance(...) at run start');
    // The summary object literal is `writeJson(path.join(outDir, 'summary.json'), { ... })` —
    // slice from that call to its matching closing paren and check the three keys are present
    // as bare (shorthand) properties inside it, not merely mentioned elsewhere in the file.
    const summaryCallIdx = source.indexOf("writeJson(path.join(outDir, 'summary.json')");
    assert(summaryCallIdx !== -1, 'could not locate the writeJson(...summary.json...) call in demo-runner.mjs');
    const objStart = source.indexOf('{', summaryCallIdx);
    assert(objStart !== -1, 'could not locate the summary object literal opening brace');
    let depth = 0;
    let objEnd = -1;
    for (let i = objStart; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') { depth -= 1; if (depth === 0) { objEnd = i; break; } }
    }
    assert(objEnd !== -1, 'could not locate the summary object literal closing brace');
    const summaryLiteral = source.slice(objStart, objEnd + 1);
    for (const field of ['gitSha', 'gitDirty', 'gitBranch']) {
      const fieldRe = new RegExp(`(^|[,{\\s])${field}(\\s*[,}]|\\s*:)`);
      assert(fieldRe.test(summaryLiteral), `summary.json object literal in demo-runner.mjs no longer stamps "${field}"`);
    }
    record('Guard2.summary-literal-stamps-fields', true, 'summary.json object literal in demo-runner.mjs stamps gitSha, gitDirty, and gitBranch');

    // --- Light dynamic check: exercise the REAL captureGitProvenance source text (extracted
    // byte-for-byte from the file, not reimplemented), with NO playwright import in the loop. -
    const { src: extractedSrc } = extractCaptureGitProvenanceSource(source);
    const moduleSrc = `import { execFileSync } from 'node:child_process';\n${extractedSrc}\n`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-guards-g2-'));
    const tmpModulePath = path.join(tmpDir, 'extracted-capture-git-provenance.mjs');
    try {
      fs.writeFileSync(tmpModulePath, moduleSrc);
      const mod = await import(`${pathToFileUrl(tmpModulePath)}`);
      assert(typeof mod.captureGitProvenance === 'function', 'extracted captureGitProvenance did not import as a function — extraction shape may have drifted from demo-runner.mjs');

      const expectedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
      const provenance = mod.captureGitProvenance(REPO_ROOT);
      assert(provenance.gitSha === expectedSha, `extracted captureGitProvenance(REPO_ROOT).gitSha "${provenance.gitSha}" !== \`git rev-parse HEAD\` "${expectedSha}"`);
      assert(typeof provenance.gitBranch === 'string' && provenance.gitBranch.length > 0, `extracted captureGitProvenance(REPO_ROOT).gitBranch missing/empty (got ${JSON.stringify(provenance.gitBranch)})`);
      assert(typeof provenance.gitDirty === 'boolean', `extracted captureGitProvenance(REPO_ROOT).gitDirty is not a boolean (got ${JSON.stringify(provenance.gitDirty)})`);
      record('Guard2.dynamic-real-logic', true, `captureGitProvenance(REPO_ROOT) [extracted verbatim from demo-runner.mjs, no playwright import] -> gitSha="${provenance.gitSha}" === HEAD, gitBranch="${provenance.gitBranch}", gitDirty=${provenance.gitDirty}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // --- Load-bearing proof: neutralize the stamp in a SCRATCH COPY (never the tracked file)
    // and show the static assertion goes RED. -------------------------------------------------
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-guards-g2-scratch-'));
    try {
      const neutralized = source.replace(
        /\n\s*gitSha,\s*\n\s*gitDirty,\s*\n\s*gitBranch,\s*\n/,
        '\n',
      );
      // Sanity: the replace must actually have removed something, or this proof is vacuous.
      assert(neutralized !== source, 'scratch-neutralize regex did not match demo-runner.mjs — the summary object literal shape may have drifted; update the neutralize regex in this guard');
      const scratchPath = path.join(scratchDir, 'demo-runner.scratch.mjs');
      fs.writeFileSync(scratchPath, neutralized);

      let staticGuardRedOnScratch = false;
      let redReason = null;
      try {
        const scratchSummaryCallIdx = neutralized.indexOf("writeJson(path.join(outDir, 'summary.json')");
        const scratchObjStart = neutralized.indexOf('{', scratchSummaryCallIdx);
        let d = 0; let scratchObjEnd = -1;
        for (let i = scratchObjStart; i < neutralized.length; i += 1) {
          if (neutralized[i] === '{') d += 1;
          else if (neutralized[i] === '}') { d -= 1; if (d === 0) { scratchObjEnd = i; break; } }
        }
        const scratchLiteral = neutralized.slice(scratchObjStart, scratchObjEnd + 1);
        for (const field of ['gitSha', 'gitDirty', 'gitBranch']) {
          const fieldRe = new RegExp(`(^|[,{\\s])${field}(\\s*[,}]|\\s*:)`);
          if (!fieldRe.test(scratchLiteral)) { redReason = `"${field}" no longer present in the (neutralized) summary object literal`; break; }
        }
      } catch (e) {
        redReason = e instanceof Error ? e.message : String(e);
      }
      staticGuardRedOnScratch = redReason !== null;
      assert(staticGuardRedOnScratch, 'load-bearing proof FAILED: after neutralizing gitSha/gitDirty/gitBranch out of a scratch copy, the static field-presence assertion still (wrongly) passed — the guard is not load-bearing');
      record('Guard2.load-bearing-proof', true, `scratch copy with gitSha/gitDirty/gitBranch stripped from the summary object literal -> static guard correctly goes RED (${redReason}); real tracked demo-runner.mjs was never touched`);
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }

    // Confirm the real tracked file is untouched (defense in depth beyond "we only ever wrote
    // to scratchDir/tmpDir").
    const afterAll = fs.readFileSync(DEMO_RUNNER, 'utf8');
    assert(afterAll === source, 'demo-runner.mjs content changed during Guard 2 — this must never happen (guard only reads it and works on scratch copies)');

    return true;
  } catch (err) {
    record('Guard2', false, err instanceof Error ? err.message : String(err));
    return false;
  }
}

function pathToFileUrl(p) {
  return new URL(`file://${p}`).href;
}

// ---------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------
async function main() {
  log('fix-guards: profile-level regression guards for 2 previously-fixed defects in simple-gh-sdlc-visual');
  log(`profile root: ${PROFILE_ROOT}`);
  log(`node: ${process.version}`);
  log('SCOPE NOTE: twin-scenario strict load-time validation is OUT OF SCOPE here — it is owned');
  log('by the twin package, not this profile, and is already covered by 57 tests in the twin');
  log('repo\'s own PR #34. Only the two profile-owned fixes below are guarded.');

  const g1 = await guard1VendorScan();
  const g2 = await guard2Provenance();

  section('SUMMARY');
  for (const r of results) {
    log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  }
  const allPass = g1 && g2;
  log('');
  log(`Guard 1 (vendor-scan shape-completeness): ${g1 ? 'PASS' : 'FAIL'}`);
  log(`Guard 2 (provenance stamping):            ${g2 ? 'PASS' : 'FAIL'}`);
  log('');
  log(allPass ? 'FIX-GUARDS: ALL GUARDS PASS' : 'FIX-GUARDS: FAIL — see above');
  process.exit(allPass ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.on('uncaughtException', (err) => {
    log('');
    log(`FIX-GUARDS: FAIL — uncaught exception: ${err?.stack || err}`);
    process.exit(1);
  });

  main();
}
