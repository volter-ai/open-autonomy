export class MemoryDurableObjectNamespace implements DurableObjectNamespace {
  private readonly instances = new Map<string, DurableObjectStub>();

  constructor(private readonly create: (state: DurableObjectState) => DurableObject) {}

  idFromName(name: string): DurableObjectId {
    return name as unknown as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    const key = id as unknown as string;
    let stub = this.instances.get(key);
    if (!stub) {
      const storage = new MemoryStorage();
      const instance = this.create({ storage } as DurableObjectState);
      stub = { fetch: (input, init) => instance.fetch(new Request(input, init)) };
      this.instances.set(key, stub);
    }
    return stub;
  }
}

class MemoryStorage {
  private readonly values = new Map<string, unknown>();
  private alarm: number | null = null;

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  async setAlarm(time: number): Promise<void> {
    this.alarm = time;
  }
}
