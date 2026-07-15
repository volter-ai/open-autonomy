# Open Autonomy package and registry protocol v1

Status: normative experimental standard. Requirement words have the RFC 2119/8174 meanings used by the Organization
IR v2 specification.

## Identity and package layout

A package identity is the four-tuple `(logical name, semantic version, package content digest, retrieval location)`.
These components MUST remain distinct. A directory package contains one `package.yml` manifest and every file named
by `files`; `root` names the Organization IR, profile, or other authored artifact entry point. Paths are relative
forward-slash paths with no empty, `.`, `..`, absolute, or backslash component. Undeclared, missing, duplicate, or
integrity-mismatched files reject atomically.

Logical names are globally scoped lowercase names of the form `namespace/path`. The namespace is a DNS-style label
sequence; the path uses lowercase letters, digits, `.`, `_`, `-`, and `/`, with no empty leading or trailing segment.
The exact logical name is matched at every manifest, lock, dependency, and registry boundary; resolvers MUST NOT
perform case folding, aliasing, or namespace fallback.

`packageContentDigest` is `sha256:` plus SHA-256 over `oa-c14n-v1` canonical bytes of manifest `schema`, `name`,
`version`, `root`, files sorted by ascending UTF-16 code units (RFC 8785 order), exact dependencies sorted as object
keys, and provenance. Signatures are
excluded because they cover the digest. File digests are SHA-256 of raw bytes. Archive metadata, retrieval location,
filesystem timestamps, permissions, and member order do not enter identity.

After raw file integrity succeeds, the root MUST carry a schema discriminator present in the generated artifact
schema index and MUST validate against that closed schema. Unsupported, malformed, or semantically invalid
Organization IR roots reject the package graph atomically. Non-Organization artifacts expose deterministic JSON
Pointer field origins; Organization IR additionally exposes its catalog declaration identities.

## Signatures and provenance

Signatures cover the package digest and name their algorithm and key ID. Verification MUST use an injected trust
root; a syntactically valid or self-signed signature is not trust. A lock MAY pin acceptable signer keys. Revoked keys
reject even when a cryptographic signature verifies. Every resolved file carries package key, content digest,
verified signer keys, and source path. Registry publication metadata is an observation, not package meaning.

## Exact dependency locks

`autonomy.package-lock.v1` names a root package and a closed map of exact package entries. Every entry pins logical
name, version, content digest, authoritative registry location, approved mirrors, exact dependency edges, and
optional signer keys. The lock also pins the complete registry snapshot digest. Dependency aliases are local only;
they MUST map to a lock entry whose `(name,version,digest)` exactly equals the authored dependency tuple.

Resolution MUST NOT perform version selection, registry priority search, or namespace fallback when consuming a
lock. A newer or higher-priority package cannot satisfy a locked edge. Missing and extra dependency edges reject.
Equal lock bytes, snapshot bytes, and content-addressed cache bytes MUST produce equal resolved graph digests.

## Registry snapshots, mirrors, yanking, and revocation

A registry snapshot is an immutable, monotonically sequenced observation containing exact version records and
locations. Its digest covers the entire snapshot using `oa-c14n-v1`. A mirror is only an alternate byte source; its
payload MUST match the locked package and every file digest. Mirror priority cannot change meaning.

Yanking prevents creation of new locks but does not invalidate an already exact lock. Revocation invalidates locked
resolution and MUST be represented by a newly pinned snapshot. Rollback protection compares trusted registry
sequence/checkpoint state before accepting a new lock; an isolated offline build verifies only its pinned snapshot
and MUST NOT claim knowledge of later revocation.

## Hermetic and bounded resolution

Offline mode reads only the digest-keyed cache and performs no fetch. Network mode tries only the lock's authoritative
location followed by explicitly ordered approved mirrors that also appear in the pinned snapshot. A malformed or
integrity-failing source is skipped in that order; it never prevents trying a later approved source. Every candidate
is closed-schema validated before digest projection or use. Resolution is bounded by lock, snapshot, and manifest
metadata bytes; registry-record and per-record-location cardinality; package count and graph depth; per-package file,
dependency, and signature cardinality; total bytes; and per-file bytes. Cycles,
unsafe paths, bounds exhaustion, snapshot substitution, dependency confusion, revoked content/keys, and unavailable
cache content fail without a partial graph.

## Canonical machine schemas and YAML profiles

- `artifact-schema-index.json` is the exhaustive current authored/exchanged artifact-family registry. Its generated
  schemas cover Organization IR/state/profile, deployment, component, adapter, event/history, control/execution,
  runtime proof ledger, package, lock, and registry snapshot artifacts.
- `organization-package-v1.schema.json` defines `autonomy.package.v1`.
- `organization-package-lock-v1.schema.json` defines `autonomy.package-lock.v1`.
- `registry-snapshot-v1.schema.json` defines `autonomy.registry-snapshot.v1`.
- The examples under `docs/examples/package/` are executable YAML profiles using the same closed YAML subset as
  Organization IR. Unknown fields reject.

Every indexed JSON Schema also defines its YAML serialization profile: YAML readers MUST use the Organization IR
closed YAML 1.2 core subset, convert to a JSON data model without coercion, and validate the corresponding indexed
schema. Thus JSON and YAML are two representations of one artifact model, not independently versioned languages.

## Unsupported boundaries

This protocol does not define public-key infrastructure, transparency-log consensus, registry operator governance,
online freshness, semantic-version selection, or archive compression. Those are explicit trust/policy layers. It
does define the bytes and evidence they MUST bind before their claims affect resolution.
