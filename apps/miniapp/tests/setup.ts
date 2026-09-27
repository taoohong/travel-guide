import { vi } from 'vitest';

vi.mock('@tarojs/taro', () => ({ default: {}, getStorage: vi.fn(), setStorage: vi.fn(),
  removeStorage: vi.fn(), request: vi.fn() }));
