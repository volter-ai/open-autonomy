// A quick in-memory LRU cache. No tests, no validation. Something here is wrong under eviction.
export class Store {
  private cap: number;
  private map = new Map<string, unknown>();

  constructor(capacity: number) {
    this.cap = capacity;
  }

  get(key: string): unknown {
    return this.map.get(key);
  }

  set(key: string, value: unknown): void {
    this.map.set(key, value);
    if (this.map.size > this.cap) {
      // meant to drop the least-recently-used entry
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  size(): number {
    return this.map.size;
  }
}
