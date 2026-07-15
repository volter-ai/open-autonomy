# Open Autonomy conformance and TCK v1

Status: normative experimental standard.

The conformance suite version is independent of the Organization IR language version. A manifest pins both its
`suiteVersion` and compatible `languageRange`; a result is meaningful only for that pair.

## Levels

The eight independently reportable levels are language parsing and static validity, compiler transformation,
component contracts, directional adapters, substrate lifecycle behavior, native-event lifting, causal replay, and
live-runtime behavior. Passing one level makes no claim about another.

Every test is classified as mandatory, optional, conditional, unsupported, or unobserved. An unclaimed level is
unsupported; within a claimed level, mandatory and applicable conditional operations fail when omitted. An absent optional operation is unsupported, not passed. A conditional
test whose advertised precondition is absent is not applicable. An explicitly unsupported surface fails if it is
advertised. An unobserved property remains unobserved and cannot contribute a pass.

## Black-box execution and oracle authority

A provider advertises levels and operations, then receives only an invocation ID, operation, nonce, and input. Each
invocation has a manifest-defined timeout and response-byte bound. It
returns an observation, never a verdict. The reference runner computes equality against the manifest oracle and
records request, response, suite, test, and oracle evidence. A missing operation, wrong nonce, exception, oversized
response, or oracle mismatch cannot pass. This permits CLI, HTTP, MCP, process, or in-memory providers without giving
the implementation control of the oracle.

The reference command accepts an advertisement and a shell-free executable/argument vector, sends exactly one JSON
invocation on standard input per fresh process, requires exactly one JSON observation line, bounds stderr, kills the
child at the manifest deadline, and exits nonzero for any failed or unobserved test:

`bun bin/organization-conformance-tck.ts docs/conformance/tck-v1.json <advertisement.json> -- <provider> [args...]`

## Result bundles and certification

`autonomy.conformance-result.v1` bundles carry the tested advertisement, every case result, and exact summary. A
validator reconstructs classifications, request/oracle digests, correlations, response digests, evidence inventory,
and test inventory from the pinned manifest. Ed25519 signatures cover the canonical payload, and trusted roles are
assigned externally rather than accepted from signature text. Implementation signatures establish authorship only;
passing cases additionally require a trusted runner signature. `independently-observed` additionally
requires a cryptographically valid observer key distinct from every implementation-signing key. Relabeling a bundle,
aliasing the same key, deleting failures from the summary, or adding a fabricated provider verdict invalidates
certification.

Each case separately records `test-observed` or `live-observed`; bundle authorship remains self-attested until valid
observer certification. The implementation matrix accepts only validated result wrappers and reports each level as pass, fail, unsupported,
unobserved, or not applicable while retaining suite, implementation, and derived certification identity. Mutation
score is the fraction of an exact, nonempty, suite-versioned required-mutant inventory that produces a failure or
unobserved result. Every mandatory rule requires a named mutant; missing, duplicate, or surviving mutants block TCK
closure.
