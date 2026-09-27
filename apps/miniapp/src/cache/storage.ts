import Taro from '@tarojs/taro';

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

type TaroStorage = Pick<typeof Taro, 'getStorage' | 'setStorage' | 'removeStorage'>;
export class TaroStorageAdapter implements StorageAdapter {
  constructor(private readonly taro: TaroStorage = Taro) {}
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.taro.getStorage({ key });
      return JSON.parse(String(result.data)) as T;
    } catch { return null; }
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.taro.setStorage({ key, data: JSON.stringify(value) });
  }
  async remove(key: string): Promise<void> { await this.taro.removeStorage({ key }); }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();
  async get<T>(key: string): Promise<T | null> {
    try { const value = this.values.get(key); return value === undefined ? null : JSON.parse(value) as T; }
    catch { return null; }
  }
  async set<T>(key: string, value: T): Promise<void> { this.values.set(key, JSON.stringify(value)); }
  async remove(key: string): Promise<void> { this.values.delete(key); }
}
