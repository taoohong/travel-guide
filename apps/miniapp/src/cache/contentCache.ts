import type { ContentModule } from '@travel-guide/constants';
import { cacheKeys } from './cacheKeys';
import type { CacheEntry, DataResult } from './cacheTypes';
import type { StorageAdapter } from './storage';

type Fetcher = () => Promise<unknown>;
type Resolver = (key: string) => Fetcher | null;

export class ContentCache {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly indexWrites = new Map<ContentModule, Promise<void>>();
  private readonly resolvers = new Map<ContentModule, Resolver>();
  private readonly listeners = new Map<string, (value: unknown) => void>();
  constructor(readonly storage: StorageAdapter, private readonly now: () => number = Date.now) {}
  register(module: ContentModule, resolver: Resolver): void { this.resolvers.set(module, resolver); }
  async read<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = await this.storage.get<CacheEntry<T>>(key);
    return entry && typeof entry === 'object' && 'data' in entry && typeof entry.cachedAt === 'number' ? entry : null;
  }
  async write<T>(module: ContentModule, key: string, data: T, version?: number): Promise<void> {
    await this.storage.set(key, { data, version, cachedAt: this.now() } satisfies CacheEntry<T>);
    const update = (this.indexWrites.get(module) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const indexKey = cacheKeys.index(module);
      const keys = await this.storage.get<string[]>(indexKey) ?? [];
      if (!keys.includes(key)) await this.storage.set(indexKey, [...keys, key]);
    });
    this.indexWrites.set(module, update);
    await update;
  }
  async refresh<T>(module: ContentModule, key: string, fetcher: () => Promise<T>, version?: number): Promise<T> {
    let task = this.inFlight.get(key) as Promise<T> | undefined;
    if (!task) {
      task = fetcher().then(async (data) => {
        await this.write(module, key, data, version);
        this.listeners.get(key)?.(data);
        return data;
      }).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, task);
    }
    return task;
  }
  async load<T>(module: ContentModule, key: string, fetcher: () => Promise<T>, version?: number,
    onFresh?: (data: T) => void, onFailure?: () => void): Promise<DataResult<T>> {
    if (onFresh) this.listeners.set(key, onFresh as (value: unknown) => void);
    const cached = await this.read<T>(key);
    if (cached) {
      void this.refresh(module, key, fetcher, version).catch(() => onFailure?.());
      return { data: cached.data, meta: { fromCache: true, stale: version !== undefined && cached.version !== version } };
    }
    const data = await this.refresh(module, key, fetcher, version);
    return { data, meta: { fromCache: false, stale: false } };
  }
  async refreshModule(module: ContentModule, version: number): Promise<void> {
    const keys = await this.storage.get<string[]>(cacheKeys.index(module)) ?? [];
    const resolver = this.resolvers.get(module);
    for (const key of keys) {
      const fetcher = resolver?.(key);
      if (!fetcher) throw new Error(`No content refresh handler for ${key}`);
      await this.refresh(module, key, fetcher, version);
      // An older in-flight refresh may have been joined; the version is committed only after fresh cache is durable.
      if ((await this.read(key))?.version !== version) await this.refresh(module, key, fetcher, version);
    }
  }
}
