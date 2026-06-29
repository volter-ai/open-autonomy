# compliance/ — the SOC 2 program tree (install-owned)

This tree is **seeded once** by the `simple-soc2` profile and then **owned by you** — upgrades never overwrite
it (it is install-owned; see `docs/SIMPLE-SOC2-PROFILE.md` G2). The profile gives you working **templates and
automated evidence collection**; you tailor the policies to your organization and operate the program.

## What's here

- `control-matrix.md` — the authoritative control → TSC → enforcement → evidence map. **Start here.**
- `policies/` — a full, OA-tailored SOC 2 policy set (fill in `[ORG]`/`[OWNER]`/`[DATE]` placeholders).
- `risk-register.md` — the risk assessment template + cadence.
- `subprocessors.md` — the vendor/subprocessor inventory, **pre-filled** with this stack's dependencies.

Automated evidence (not in this tree) accrues on the **`compliance-evidence`** branch via
`.github/workflows/evidence-collect.yml`, and as `sbom-<sha>` build artifacts via `sbom.yml`.

## The honest ceiling — read this

SOC 2 certifies an **organization over a time window**, not a repository. This profile makes your repo's
**technical controls present, deterministic, and auditable on day one** — i.e. **Type-I-ready by design** —
and gives you fill-in-the-blank policies + automated evidence so the org program is far less work.

It **cannot**, by construction:
1. **Operate your org program** — someone must approve these policies, run the quarterly access reviews, sign
   DPAs, enforce org-wide MFA, pick a CPA auditor, and (recommended) adopt a compliance platform
   (Vanta/Drata) that the `compliance-evidence` branch feeds.
2. **Provide the Type II observation window** — Type II attests controls *operated effectively* for ~3–12
   months. That is time + operation; no profile compresses it.
3. **Make the subprocessors compliant** — the Open Autonomy model proxy, GitHub, and Cloudflare are
   subprocessors (`subprocessors.md`); rely on *their* SOC 2 reports.

So: **Type-I-ready by design → run the program for the window → Type II.** Anyone claiming a repo template
"makes you SOC 2 compliant" is wrong; this makes you *default-ready*.

## Operating cadence (minimum)

| Cadence | Action | Control |
|---|---|---|
| Per PR | merge boundary + required checks + human gate operate automatically | C2/C4/C5 |
| Weekly | review SBOM + security/CodeQL/dependency findings | C7–C10 |
| Monthly | retention sweep runs; review the deletion PR | C14 |
| Quarterly | access review using the `compliance-evidence` collaborators snapshot | O3 |
| Annually | re-approve policies; run risk assessment; IR tabletop | O1/O2/O5 |
