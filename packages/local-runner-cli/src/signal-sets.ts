// TB.3 — per-profile IMM signal-set SELECTION (declarative; SELECTION ONLY — no stage composition, that
// is TB.2's `oa maturity` verb, not this file).
//
// Declares which of TB.1's IMM signals (imm-signals.ts's `IMM_SIGNALS`) apply to a given profile+target,
// as DATA read off the profile's SetupPack (packages/core/src/setup-pack.ts's `getSetupPack`, itself a
// view over the compiled `ir.yml`/`autonomy.yml` + the hand-authored `setup-pack.yml`). Per the task rule,
// this file NEVER branches on a literal profile name — every decision below keys off a PACK FIELD
// (`codeHost`, `targets`, `direction_spec.mode`, `maturity_signals.m3_tool`, `extra_rungs`) or the
// SUBSTRATE SEMANTICS of the `target` value itself (`gh-actions` vs `local`), never
// `if (profile === 'self-driving')`.
//
// DEPENDENCY-FREE PER PACKAGE RULE (mirrors board-readiness.ts's + imm-signals.ts's headers): this
// package (`@volter/oa`) is designed to ship independently of `@open-autonomy/core` (a private,
// unpublished monorepo workspace package). `SignalSetPack` below is therefore a small STRUCTURAL subset
// of core's `SetupPack` interface, not an import of it — a caller that already holds a real `SetupPack`
// (TB.2's composer, or `bin/check-setup-pack.ts`, both of which DO depend on core) can pass one straight
// through; TypeScript's structural typing accepts it without either side importing the other, exactly the
// way `board-readiness.ts`'s `resolveBoardKind` takes a plain `{ profileDir?, actor? }` rather than a
// core-typed object.
import { IMM_SIGNALS } from './imm-signals.ts';

/** The literal ids TB.1 ships — `keyof typeof IMM_SIGNALS`, i.e. 'A1' | 'A2' | ... | 'A14'. */
export type ImmSignalId = keyof typeof IMM_SIGNALS;
export const IMM_SIGNAL_IDS = Object.keys(IMM_SIGNALS) as ImmSignalId[];

/** A signal-set entry can also be an EXTRA RUNG string the profile's own pack declares (DESIGN §Q1's
 *  per-profile ladder deltas, e.g. self-driving's 'proxy-ready' / 'direction-present' / 'human-seam-wired')
 *  — those are not one of TB.1's numbered ids, so this widens to a plain string while `IMM_SIGNAL_IDS`
 *  above stays the precise, closed set for anything that needs to iterate ONLY the numbered signals. */
export type SignalId = ImmSignalId | string;

/** OA currently ships exactly two target values, drawn straight from each profile's own `ir.yml` `targets:`
 *  line (e.g. `targets: [gh-actions, local]`): `gh-actions` (hosted — GitHub Actions fires the workflow on
 *  its own schedule, no persistent local process) and `local` (a local termfleet scheduler loop). Gating
 *  on the LITERAL VALUE of `target` is substrate semantics, not a profile-name branch — every profile that
 *  ships a `gh-actions` target means the exact same thing by it. */
export type InstallTarget = 'gh-actions' | 'local';

/** The structural subset of `@open-autonomy/core`'s `SetupPack` this selection actually reads. See the
 *  file header for why this is not an import of the real interface. */
export interface SignalSetPack {
  codeHost: 'github' | 'local-git';
  targets: string[];
  direction_spec: { mode: 'none' | 'operator' | 'documents.roles' };
  maturity_signals: { m3_tool: 'doctor' | 'gh-preflight' };
  extra_rungs: string[];
}

export interface SkippedSignal {
  /** the signal/rung id that was skipped (an `ImmSignalId` or an extra-rung string). */
  id: string;
  /** a CITED reason — always names the pack field(s)/fact that drove the skip; never a bare restatement. */
  reason: string;
}

export interface SignalSet {
  applicable: SignalId[];
  skipped: SkippedSignal[];
}

/** Signals that apply to EVERY compiled install regardless of codeHost or target: the compile-artifact
 *  facts (A1/A2/A3), the pause lifecycle markers (A4/A5 — both are always structurally "applicable"; which
 *  one is relevant at a given moment is TB.2's stage-composition job, not this selection's), the harness-
 *  committed guard (A6), the local on-disk preflight (A11 — a filesystem sanity check that has nothing to
 *  do with which code host the repo eventually pushes to), and the board-dispatchable-work predicate (A14
 *  — every profile has SOME board, ztrack or gh-issues, that TA.2's `hasDispatchableWork` already reads
 *  transparently via the pack's own `maturity_signals.m4_predicate`).
 */
const UNIVERSAL_SIGNAL_IDS: ImmSignalId[] = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A11', 'A14'];

/** Does an extra rung's OWN name mark it as a direction/vision-content rung? A tiny, generic naming
 *  convention (not a profile check) — the only shipped rung that currently matches is self-driving's
 *  'direction-present' (profiles/self-driving/setup-pack.yml's `extra_rungs`, DESIGN §Q1's M4.d). Kept as
 *  a substring match against the rung's own id (not an enum of known profiles) so a future profile can add
 *  its own '*direction*'-named rung without this file needing an update — the GATE below
 *  (`direction_spec.mode`) is the data-driven part; this is only "which rungs the gate applies to". */
function isDirectionRung(rungId: string): boolean {
  return /direction/i.test(rungId);
}

/** TB.3 — `signalSetFor(pack, target) -> {applicable, skipped}`. Pure, synchronous, no I/O: every fact it
 *  reasons over is already sitting on `pack`/`target`. Throws if `target` is not one of this pack's own
 *  declared `targets` (a caller error — e.g. asking for simple-sdlc's 'gh-actions' set, which does not
 *  exist, per `profiles/simple-sdlc/ir.yml`'s `targets: [local]`). */
export function signalSetFor(pack: SignalSetPack, target: InstallTarget): SignalSet {
  if (!pack.targets.includes(target)) {
    throw new Error(`signalSetFor: target '${target}' is not one of this pack's declared targets [${pack.targets.join(', ')}]`);
  }

  const applicable: SignalId[] = [...UNIVERSAL_SIGNAL_IDS];
  const skipped: SkippedSignal[] = [];

  // --- A8/A10 doctor pass: only where a LOCAL process exists to probe. `oa doctor` wraps a local `oa`
  //     CLI invocation (+ a provider /healthz GET) — there is nothing local to run it against on a pure
  //     `gh-actions` target, which fires as a GitHub-hosted workflow on its own schedule with no
  //     persistent process (DESIGN §Q1: "hosted target has NO doctor ... M3 proven by gh-preflight + a
  //     first workflow run instead"). This is `target`'s own substrate semantics, never a profile check —
  //     the SAME rule applies to every profile that ships a `gh-actions` target (self-driving,
  //     simple-gh-sdlc alike; simple-sdlc/simple-gh never offer this target at all, so it never arises).
  if (target === 'local') {
    applicable.push('A8', 'A10');
  } else {
    const reason =
      `target='gh-actions' has no persistent local process for 'oa doctor' to probe ` +
      `(pack.maturity_signals.m3_tool='${pack.maturity_signals.m3_tool}', pack.targets=[${pack.targets.join(', ')}]) — ` +
      `M3 is proven by gh-preflight (A12) + the first workflow run instead`;
    skipped.push({ id: 'A8', reason });
    skipped.push({ id: 'A10', reason });
  }

  // --- A12/A13: github-REPO-LEVEL facts (gh-preflight readiness; live branch protection vs provision.json)
  //     — apply whenever this PROFILE is `codeHost='github'`, regardless of which target is currently being
  //     evaluated: the repo is still hosted on GitHub (and still carries real branch protection) even when
  //     the scheduler dispatching its agents happens to run on the operator's own machine (the `local`
  //     target of a github-codeHost profile). A `local-git` profile (simple-sdlc) has no GitHub relationship
  //     at all, so neither ever applies.
  if (pack.codeHost === 'github') {
    applicable.push('A12', 'A13');
  } else {
    skipped.push({ id: 'A12', reason: `codeHost='${pack.codeHost}' → not-applicable (gh-preflight only evaluates a github-substrate install)` });
    skipped.push({ id: 'A13', reason: `codeHost='${pack.codeHost}' → not-applicable (no branch protection exists to verify outside GitHub)` });
  }

  // --- extra_rungs passthrough (DESIGN §Q1's per-profile ladder deltas — `proxy-ready` / `direction-present`
  //     / `human-seam-wired` for self-driving; `[]` for the other three). A direction/vision-content rung
  //     is only meaningful where the profile actually captures direction via filled `documents.roles` docs
  //     — an `operator`-mode profile (or `none`) has no REPLACE-THIS-seeded template for that rung to check
  //     at all, so it is skipped (cited) rather than silently included. A rung whose name does not mark it
  //     as direction-related passes straight through — its own precondition (e.g. proxy funding) is a
  //     RUNTIME fact TB.2/TE.5 check live, not something this static selection can gate on.
  for (const rung of pack.extra_rungs) {
    if (isDirectionRung(rung) && pack.direction_spec.mode !== 'documents.roles') {
      skipped.push({
        id: rung,
        reason: `direction_spec.mode='${pack.direction_spec.mode}' (not 'documents.roles') → '${rung}' has no filled-template direction doc to check`,
      });
    } else {
      applicable.push(rung);
    }
  }

  return { applicable, skipped };
}
