// @open-autonomy/dry-run — hermetic execution substrate for autonomy
// workflows: an external-operations port boundary, a virtual clock, an
// append-only action ledger, and fail-closed egress enforcement. See
// README.md for the model and the consumer contract.
export * from './ports.ts';
export * from './clock.ts';
export * from './ledger.ts';
export * from './guard.ts';
