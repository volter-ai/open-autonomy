import { describe, expect, test } from 'bun:test';
import { greeting, responseBody } from './app.js';

describe('small app', () => {
  test('greets the default audience', () => {
    expect(greeting()).toBe('hello, world');
  });

  test('trims a provided name', () => {
    expect(responseBody({ name: ' agent ' })).toEqual({ message: 'hello, agent' });
  });
});
