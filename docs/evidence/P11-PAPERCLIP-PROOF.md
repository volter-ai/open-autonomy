# P11 Paperclip dissimilar-substrate evidence

Evidence date: 2026-07-14. Source: local pinned checkout
`/mnt/c/users/porta/research/repos/paperclip` at
`90f85a7d11c517b1d09db90dbec97f4de7d96b83`.

## Boundary and composition

Paperclip is used only as a control/work component. Interaction and worker execution remain separate component
instances. Its issue, heartbeat, recovery, approval, and budget vocabulary is mapped below Organization IR; none of
those product names becomes a canonical organization state or command.

The pinned source contains independently inspectable issue checkout/wakeup, heartbeat cost-accounting, and stale-lock
recovery fixtures under `server/src/__tests__`. Dependencies were not present in the research checkout, so those
upstream tests were source-inspected rather than represented as locally executed. The Open Autonomy differential
corpus is executable and does not claim that source inspection is live observation.

## Checkable conclusion

`organization-substrate-proof.test.ts` instantiates two structurally different compositions, feeds both the same
canonical semantic bytes and digest, independently accepts authenticated causal histories, checks conformance, and
compares portable state and atomic obligation identities. It also falsifies the conclusion for specialization,
product vocabulary, divergent state, nonconformance, and unknown conformance.

Every admitted difference is emitted as a typed residual: accepted assumptions, declared losses, matched failure
scenarios, unit-bearing economics, implementation revision, or trace assurance. Unknown semantic impact prevents an
independence conclusion. This is evidence of the representational claim for the tested bounded organization, not a
claim that Paperclip and Hermes are universally equivalent.
