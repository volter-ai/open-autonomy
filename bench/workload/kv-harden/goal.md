# Goal: make the key-value store production-ready

`src/store.ts` is a naive LRU cache someone wrote in a hurry. It has no tests, no input validation, and
a latent bug in its eviction logic. Bring it up to a standard you'd merge:

- find and fix the correctness bug(s) — the eviction does not actually evict the least-recently-used entry
- validate inputs (a sane capacity, usable keys) and fail clearly instead of corrupting state
- add real tests covering get/set, overwrite, eviction order, and the edge cases
- document the contract briefly (what LRU guarantees, what the limits are)

Keep the public API shape (`new Store(capacity)`, `get`, `set`, `size`) so existing callers keep working —
this is a hardening/refactor, not a rewrite. Keep the scope tight.
