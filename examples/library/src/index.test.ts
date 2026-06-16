import { describe, expect, test } from 'bun:test';
import { slugify } from './index.js';

describe('slugify', () => {
  test('normalizes a phrase', () => {
    expect(slugify(' Open Autonomy! ')).toBe('open-autonomy');
  });

  test('respects max length without trailing hyphens', () => {
    expect(slugify('hello brave world', { maxLength: 8 })).toBe('hello-br');
  });
});
