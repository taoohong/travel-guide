export interface CacheEntry<T> { data: T; version?: number; cachedAt: number }
export interface DataResult<T> { data: T; meta: { fromCache: boolean; stale: boolean } }
