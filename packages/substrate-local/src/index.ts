// @open-autonomy/substrate-local — the generic local substrate: compile an IR to a local-loop
// installation (schedule + loop + the vendored runner), and the TermfleetRunner. Tooling-agnostic —
// what an agent calls (ztrack, gh, …) is the profile's concern, never the substrate's.
export * from './emit';
export * from './runner';
