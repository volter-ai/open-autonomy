# Organization IR compatibility policy

R4 proves public-spec implementability with a separately authored Python 3 implementation and a digest-locked corpus. The portable comparison surface is structural checking, `oa-c14n-v1`, closed single-module authored-default normalization, and the explicitly experimental `autonomy.ir.v1` to `autonomy.organization.v2` migration. Full graph linking and semantic validation remain outside this minimal subset and must not be inferred from a passing result.

Every observed difference is classified as `normative-mismatch`, `supported-subset`, `diagnostic-wording`, or `tool-failure`; a report with an untriaged difference is invalid. Normative mismatches block compatibility. Supported-subset and wording differences require explicit acceptance in the report. Tool failures block the run.

Minor v2 releases must accept documents valid in the preceding minor release for at least two subsequent minor releases. Deprecation must be announced in the normative specification and retained for that same window. Major-version support ends only at a published release and date, never implicitly. The v1 migration remains experimental and has no sunset until a registered normative migration edge supplies field accounting, introduction release, minimum support window, and sunset criteria.

Clean-room authors may read normative specifications, generated schemas, and normative examples. They may not read the primary implementation, its tests, private fixtures, or differential-harness expectations before submitting their implementation and exposure record. Post-submission discrepancies are resolved by clarifying the public specification and re-running both implementations; copying primary behavior is not an acceptable remedy.
