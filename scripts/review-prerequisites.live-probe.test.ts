import { expect, test } from 'bun:test';

test('live probe: required CI failure prevents model review', () => {
  expect('probe failure').toBe('CI green');
});
