import { z } from 'zod';

export const code = z.string().regex(/^[A-Z]{2}$/, '必须是两位大写字母');
export const continentCode = z.string().regex(/^[A-Z]{2}$/, '大陆代码必须是两位大写字母');
export const id = z.string().min(1).max(100);
export const nonEmpty = z.string().trim().min(1).max(500);
export const isoDate = z.string().datetime({ offset: true });
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function dateOrNull(value: string | null | undefined): Date | null | undefined {
  return value === undefined ? undefined : value === null ? null : new Date(value);
}

export function iso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}
