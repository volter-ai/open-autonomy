declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => unknown | Promise<unknown>): void;
  export function beforeEach(fn: () => unknown | Promise<unknown>): void;
  export function afterEach(fn: () => unknown | Promise<unknown>): void;
  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toBeString(): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
  }
  export function expect(value: unknown): Matchers & { not: Matchers };
}
