# R2 skeptical package and registry review

Date: 2026-07-15  
Reviewer: independent adversarial subagent, read-only  
Final verdict: PASS

## Scope

The reviewer attempted to falsify every R2 acceptance criterion and the specific claim that identical lockfiles cannot
resolve to semantically different module graphs without detection. The audit covered the package protocol, generated
artifact schema corpus, resolver, YAML boundary, provenance API, fixtures, and proof-accounting changes.

## Counterexamples found and closed

The review was iterative and initially rejected closure. It found: projected-out unknown manifest members; locale-
dependent sorting; unreachable lock entries; an incomplete artifact-family index; corrupt-primary mirror starvation;
incomplete metadata bounds; provenance detached from package bytes; Organization-IR-only root interpretation;
mutable verified-byte aliases; manifest/lock/snapshot/signature mutation across verifier awaits; and caller mutation of
offline/signature policy across cache awaits.

Each counterexample received a direct regression. Resolution now validates closed structures before digest projection,
uses exact and locale-independent ordering, requires a closed reachable lock graph, dispatches every indexed artifact
family, tries only ordered approved sources, enforces all declared bounds, snapshots all untrusted inputs before async
boundaries, exposes immutable resolved state and copy-returning file access, and precomputes declaration provenance from
verified artifact bytes. Policy is snapshotted before its first read.

## Final independent result

The reviewer reran the offline-policy exploit and observed zero fetches after a cache attempted to change
`allowNetwork` from false to true. The final review reported all 13 package tests passing and no material counterexample
to R2-SEM-1, R2-SEC-1, R2-ALG-1, R2-PROV-1, or the checkpoint falsifier.

The review did not edit repository files.
