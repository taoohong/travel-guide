import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { z } from 'zod';

const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) loadEnvFile(envFile);

const schema = z.object({
  MODE: z.enum(['database', 'production']).default('database'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  APP_VERSION: z.string().min(1).default('0.1.0'),
  DATABASE_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(32),
  WECHAT_APP_ID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),
  UPLOAD_ROOT_DIR: z.string().min(1).default(resolve(process.cwd(), '.uploads')),
  STATIC_BASE_URL: z.string().url().default('http://127.0.0.1:3000/static'),
  CORS_ORIGINS: z.string().default(''),
  DEMO_ADMIN_PASSWORD: z.string().optional(),
  DEV_AUTH_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
}).superRefine((value, ctx) => {
  if (/change.?me|default|password|secret|generate|placeholder|example|set_a/i.test(value.AUTH_SECRET)) {
    ctx.addIssue({ code: 'custom', path: ['AUTH_SECRET'], message: 'AUTH_SECRET must be a strong private value' });
  }
  if (!value.DATABASE_URL) {
    ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL is required' });
  }
  if (Boolean(value.WECHAT_APP_ID) !== Boolean(value.WECHAT_APP_SECRET)) {
    ctx.addIssue({ code: 'custom', path: ['WECHAT_APP_SECRET'], message: 'WECHAT_APP_ID and WECHAT_APP_SECRET must be configured together' });
  }
  if (value.DEV_AUTH_ENABLED && value.MODE === 'production') {
    ctx.addIssue({ code: 'custom', path: ['DEV_AUTH_ENABLED'], message: 'Development authentication is disabled in production' });
  }
});

export type AppConfig = z.infer<typeof schema>;

export function readConfig(): AppConfig {
  return schema.parse(process.env);
}
