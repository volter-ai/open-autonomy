// Compatibility import surface for the CLI/tests. The policy is core-owned because compile, upgrade, and
// atomic activation must all use one byte-identical convergence rule.
export * from '../packages/core/src/settings-merge.ts';
