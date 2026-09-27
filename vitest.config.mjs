import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { setupFiles: ['./apps/miniapp/tests/setup.ts'] } });
