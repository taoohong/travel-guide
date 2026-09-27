import type { ContentModule } from '@travel-guide/constants';
import { clientApi, type ClientApi } from '../api/client';
import { ContentCache } from '../cache/contentCache';
import { TaroStorageAdapter, type StorageAdapter } from '../cache/storage';

export interface ServiceContext { api: ClientApi; cache: ContentCache; storage: StorageAdapter;
  version(module: ContentModule): Promise<number | undefined> }
export const storage = new TaroStorageAdapter();
export const contentCache = new ContentCache(storage);
export const serviceContext: ServiceContext = {
  api: clientApi, cache: contentCache, storage,
  async version(module) { return (await storage.get<Record<string, number>>('content:versions'))?.[module]; },
};
