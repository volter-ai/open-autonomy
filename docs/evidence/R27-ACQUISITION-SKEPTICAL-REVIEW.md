# R27 External Acquisition Skeptical Review

Scope: `bench/dev/evidence/r27-acquisition.ts`, its CLI, and its tests. This review concerns
evidence custody only. It does not upgrade R27, any dependency, or any external experiment to
closure.

## Claims that survive review

- A stage request is a deterministic function of the campaign identity, fixed protocol manifest,
  assigned role, and exact accepted prerequisite-response digests.
- An accepted response is Ed25519-authenticated by the one registered key for that stage's role and
  binds the request digest, fragment digest, signer identity, and signing time.
- Distinct role labels, key IDs, and cryptographic public-key fingerprints are required. A renamed
  duplicate key is rejected.
- Later stages cannot be requested before their declared prerequisites are accepted. A second
  response for a stage is either byte-semantically identical or rejected as equivocation.
- Persisted state is fully revalidated, including signatures and assembly digest, on every load.
  Successful writes atomically replace the state after file `fsync` and then `fsync` the parent
  directory.
- Assembly requires all sixteen top-level fragments and deterministically produces the input shape
  consumed by the separate R27 closure verifier.

## Attacks exercised

The executable tests reject premature issuance, fragment substitution, wrong-role substitution,
forged signatures, pre-campaign signatures, duplicate cryptographic identities, response
equivocation, persisted-fragment tampering, false assembly claims, and request drift across a
restart. The CLI test covers durable initialization, issuance, reload, status, and refusal to
replace an existing campaign state.

## Findings and dispositions

1. **A valid acquisition response is not valid experiment evidence by itself.** Accepted. The
   collector deliberately performs custody validation, while `r27-external-closure.ts` performs
   semantic, causal, chronological, dependency, and embedded-signature validation.
2. **The acquisition key registry is not an external trust root.** Accepted. Final acceptance still
   requires the separately supplied trust module and an Ed25519 attestation over its exact digest
   and checkpoint. An acquisition registry cannot authorize that module.
3. **A local operator can choose when to issue a causally ready request.** Accepted. They cannot
   alter an accepted response or bypass its external signer; preregistration and chronology are
   checked again by the final verifier.
4. **The file protocol assumes one CLI writer per state path.** Open operational constraint. The
   external campaign must serialize CLI mutations; concurrently dispatched authority work occurs
   through immutable request/response files. Multi-writer database coordination is not claimed.
5. **Crash safety is local-filesystem durability, not remote replication.** Accepted limitation.
   Campaign operators must place the state and immutable responses on externally backed storage;
   R27 closure depends on the final external artifacts, not this local cache.

## Bottom line

The acquisition layer closes the orchestration/custody gap between independently operated roles
and the existing strict bundle verifier. It is ready to collect real evidence, but no external
role has yet populated this protocol and R27 remains open.
