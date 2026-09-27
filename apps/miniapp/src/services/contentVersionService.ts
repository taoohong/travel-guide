import { CONTENT_MODULES, type ContentModule } from '@travel-guide/constants';
import { diffContentVersion } from '@travel-guide/core';
import type { ContentVersionSnapshot } from '@travel-guide/types';
import type { ClientApi } from '../api/client';
import { cacheKeys } from '../cache/cacheKeys';
import type { ContentCache } from '../cache/contentCache';
import type { StorageAdapter } from '../cache/storage';

export type VersionState = { local: Partial<ContentVersionSnapshot>; server: Partial<ContentVersionSnapshot>;
  changedModules: ContentModule[]; failedModules: ContentModule[]; offline: boolean };
export class ContentVersionService {
  constructor(private readonly api: Pick<ClientApi, 'contentVersion'>, private readonly cache: ContentCache,
    private readonly storage: StorageAdapter, private readonly onChange?: (value: VersionState) => void) {}
  async local(): Promise<Partial<ContentVersionSnapshot>> {
    return await this.storage.get<Partial<ContentVersionSnapshot>>(cacheKeys.versions) ?? {};
  }
  async sync(): Promise<VersionState> {
    const local = await this.local();
    let server: ContentVersionSnapshot;
    try { server = await this.api.contentVersion(); }
    catch {
      const result = { local, server: {}, changedModules: [], failedModules: [], offline: true } satisfies VersionState;
      this.onChange?.(result);
      return result;
    }
    const changedModules = diffContentVersion(local, server).changedModules;
    const next = { ...local };
    const failedModules: ContentModule[] = [];
    for (const module of CONTENT_MODULES) {
      if (!changedModules.includes(module)) continue;
      try {
        await this.cache.refreshModule(module, server[module]);
        next[module] = server[module];
        await this.storage.set(cacheKeys.versions, next);
      } catch { failedModules.push(module); }
    }
    const result = { local: next, server, changedModules, failedModules, offline: false } satisfies VersionState;
    this.onChange?.(result);
    return result;
  }
}
