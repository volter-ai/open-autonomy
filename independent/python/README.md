# R4 clean-room Python utility

`r4.py` is a Python 3, standard-library-only JSON request/response CLI. Input is bounded to 4 MiB and duplicate JSON object names, non-finite numbers, and malformed JSON reject.

Run `python3 independent/python/r4.py` and provide one JSON object on stdin. The request has `operation` (or `op`) and `document`. Operations are `check`, `canonical` (also requires `domain`), `normalize`, and `migrate-v1-v2`.

The checker intentionally implements the portable high-value subset: closed Organization IR top level, discriminator/required catalogs, identifiers, common sort-aware references, graph duplicates/cycles, and budget range. Normalization is the supported closed, single-module subset: it checks first, materializes empty top-level catalogs, import-required defaults, and instruction defaults. It retains imports but does not load them or rewrite cross-module references. Unsupported full-schema, lifecycle, protocol, authority, effect-coverage, and closed-graph semantics are not claimed.

Canonical output includes the UTF-8 JSON text, its hex bytes, and the domain-framed SHA-256 digest. Object keys use UTF-16 order. Migration is deliberately explicit and lossy: legacy agents become prompt behaviors and actors, capability names become placeholder declarations, and the exact source is preserved in a namespaced extension; the response reports losses requiring authorization.

Run the clean-room regression vectors with `cd independent/python && python3 -m unittest -v test_r4.py`.
