import { describe, expect, it, vi } from 'vitest';
import { AdminRole, ContentStatus, CountryGuideSectionCategory } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CountryGuideService } from '../src/modules/country-guides';

const baseCountry = { code: 'IE', continentCode: 'EU', nameZh: '爱尔兰', nameEn: 'Ireland', flagUrl: null,
  currencyCode: 'EUR', languages: ['en'], timeZone: null, phoneCode: null, latitude: 53, longitude: -8,
  online: true, completeness: 0, summary: null, version: 1 };
const baseSection = { id: 'g1', countryCode: 'IE', category: CountryGuideSectionCategory.TRANSPORT, title: '公共交通',
  subtitle: null, content: '交通信息', sortOrder: 0, sourceKey: 'transport', sourceProvider: 'official',
  sourceUrl: 'https://example.com/guide', sourceUpdatedAt: null, importedAt: null, lastVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
  contentHash: null, version: 1, status: ContentStatus.DRAFT, createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z') };

function mockPrisma(overrides: Record<string, unknown> = {}) {
  const tx = {
    countryGuideSection: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseSection, ...data })),
      findUnique: vi.fn(async () => baseSection), update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseSection, ...data, version: 2 })) },
    contentRevision: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) },
    contentVersion: { upsert: vi.fn(async () => ({})) },
    operationLog: { create: vi.fn(async () => ({})) },
  };
  const db = {
    country: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => ({ code: 'IE' })) },
    countryGuideSection: { findMany: vi.fn(async () => []) },
    contentRevision: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (run: (value: unknown) => Promise<unknown>) => run(tx)),
    ...overrides,
  };
  return { db: db as unknown as PrismaService, tx };
}

const contentAdmin = { id: 'admin-content', username: 'editor', role: AdminRole.CONTENT_ADMIN };
const reviewer = { id: 'admin-reviewer', username: 'reviewer', role: AdminRole.REVIEWER };

describe('国家指南 API', () => {
  it('聚合七类章节，并且查询条件只允许 Published 内容', async () => {
    const published = { ...baseSection, status: ContentStatus.PUBLISHED };
    const { db } = mockPrisma({ country: { findFirst: vi.fn(async () => ({ ...baseCountry, guideSections: [published] })) } });
    const result = await new CountryGuideService(db).getPublic('IE') as {
      country: { code: string }; sections: Record<string, unknown[]>; source: Record<string, unknown>;
    };
    expect(result.country.code).toBe('IE');
    expect(Object.keys(result.sections)).toEqual(['overview', 'entryResidence', 'travelRisk', 'safety', 'transport', 'priceMedical', 'practicalInfo']);
    expect(result.sections.transport).toMatchObject([{ id: 'g1', title: '公共交通', content: '交通信息', sortOrder: 0,
      sourceUrl: 'https://example.com/guide', lastVerifiedAt: '2026-09-01T00:00:00.000Z' }]);
    expect(result.sections.overview).toEqual([]);
    expect(result.source).toEqual({ provider: 'official', sourceUrl: 'https://example.com/guide', lastVerifiedAt: '2026-09-01T00:00:00.000Z' });
    expect(db.country.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: { guideSections: expect.objectContaining({ where: expect.objectContaining({ status: ContentStatus.PUBLISHED }) }) },
    }));
  });

  it('Admin CRUD 可建草稿、编辑标题/内容、排序并归档；公开版本仅在内容可见时变化', async () => {
    const existing = { ...baseSection, status: ContentStatus.PUBLISHED };
    const { db, tx } = mockPrisma({ countryGuideSection: { findMany: vi.fn(async () => [existing]) } });
    tx.countryGuideSection.findUnique.mockImplementation(async () => existing as never);
    const service = new CountryGuideService(db);
    const listed = await service.listAdmin('IE') as Array<Record<string, unknown>>;
    expect(listed[0]?.status).toBe('PUBLISHED');
    const created = await service.createAdmin('IE', { category: CountryGuideSectionCategory.SAFETY, title: '安全', content: '提醒',
      sortOrder: 2, sourceProvider: 'official', sourceUrl: 'https://example.com/safety' }, contentAdmin, 'req-create') as Record<string, unknown>;
    expect(created.status).toBe(ContentStatus.DRAFT);
    expect(tx.countryGuideSection.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: ContentStatus.DRAFT }) }));
    await service.patchAdmin('g1', { title: '更新后的标题', subtitle: '二级标题', content: '更新后的内容', sortOrder: 3 }, contentAdmin, 'req-patch');
    expect(tx.contentRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      module: 'countryGuide', entityType: 'country-guides', version: 0,
      after: expect.objectContaining({ title: '更新后的标题', subtitle: '二级标题', content: '更新后的内容' }),
    }) }));
    await service.patchAdmin('g1', {}, contentAdmin, 'req-delete', true);
    expect(tx.countryGuideSection.update).toHaveBeenCalledTimes(1);
    expect(tx.contentVersion.upsert).toHaveBeenCalledTimes(1);
    expect(tx.operationLog.create).toHaveBeenCalled();
  });

  it('权限阻止查看者写入、内容管理员发布以及审核员修改正文', async () => {
    const service = new CountryGuideService(mockPrisma().db);
    const viewer = { ...contentAdmin, role: AdminRole.VIEWER };
    await expect(service.createAdmin('IE', {}, viewer, 'r')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.patchAdmin('g1', { status: ContentStatus.PUBLISHED }, contentAdmin, 'r')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.patchAdmin('g1', { title: '不应允许' }, reviewer, 'r')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('审核员发布草稿时只递增 countryGuide 内容版本', async () => {
    const { db, tx } = mockPrisma();
    await new CountryGuideService(db).patchAdmin('g1', { status: ContentStatus.PUBLISHED }, reviewer, 'req-publish');
    expect(tx.contentVersion.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { module: 'countryGuide' }, create: expect.objectContaining({ module: 'countryGuide', version: 1 }),
      update: expect.objectContaining({ version: { increment: 1 } }),
    }));
  });
});

const packageBody = (apply = false) => ({ apply, packages: [{ countryCode: 'IE', provider: 'official', sourceUrl: 'https://example.com/guide',
  sections: [
    { key: 'added', category: 'SAFETY', title: '新增', content: 'new content' },
    { key: 'changed', category: 'TRANSPORT', title: '更新标题', content: 'new content', sourceUrl: 'https://example.com/new' },
    { key: 'same', category: 'TRANSPORT', title: '保持不变', content: 'same content' },
  ] }] });

const existingImportRows = [
  { ...baseSection, id: 'changed-id', sourceKey: 'changed', title: '旧标题', content: 'old content', sourceUrl: 'https://example.com/old', status: ContentStatus.PUBLISHED },
  { ...baseSection, id: 'same-id', sourceKey: 'same', title: '保持不变', content: 'same content', status: ContentStatus.DRAFT },
];

describe('国家指南 JSON 导入预览与 Diff', () => {
  it('生成 ADDED / CHANGED / UNCHANGED Diff，并标出 title、content、sourceUrl', async () => {
    const { db, tx } = mockPrisma({ countryGuideSection: { findMany: vi.fn(async () => existingImportRows) } });
    const result = await new CountryGuideService(db).import(packageBody(), contentAdmin, 'req-preview') as {
      applied: boolean; counts: Record<string, number>; items: Array<{ key: string; kind: string; changedFields: string[] }>;
    };
    expect(result.applied).toBe(false);
    expect(result.counts).toEqual({ added: 1, changed: 1, unchanged: 1, errors: 0 });
    expect(result.items.map((item) => item.kind)).toEqual(['ADDED', 'CHANGED', 'UNCHANGED']);
    expect(result.items[1]?.changedFields).toEqual(expect.arrayContaining(['title', 'content', 'sourceUrl']));
    expect(tx.countryGuideSection.create).not.toHaveBeenCalled();
    expect(tx.countryGuideSection.update).not.toHaveBeenCalled();
  });

  it('apply 只写 DRAFT；无效 schema 返回错误预览且不落库', async () => {
    const { db, tx } = mockPrisma({ countryGuideSection: { findMany: vi.fn(async () => existingImportRows) } });
    const applied = await new CountryGuideService(db).import(packageBody(true), contentAdmin, 'req-apply') as { applied: boolean };
    expect(applied.applied).toBe(true);
    expect(tx.countryGuideSection.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: ContentStatus.DRAFT }) }));
    expect(tx.contentRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      module: 'countryGuide', entityType: 'country-guides', version: 0,
      after: expect.objectContaining({ status: ContentStatus.DRAFT }),
    }) }));

    const invalidDb = mockPrisma();
    const invalid = await new CountryGuideService(invalidDb.db).import({ apply: true, packages: [{ countryCode: 'IE', provider: 'official',
      sourceUrl: 'https://example.com/guide', sections: [
        { key: 'would-add', category: 'SAFETY', title: '有效记录', content: 'valid' },
        { key: 'bad', category: 'NOT_A_CATEGORY', title: '错', content: '错' },
      ] }] }, contentAdmin, 'req-invalid') as {
      applied: boolean; counts: Record<string, number>; errors: Array<{ path: string }>; items: Array<{ kind: string }>;
    };
    expect(invalid.applied).toBe(false);
    expect(invalid.counts.errors).toBeGreaterThan(0);
    expect(invalid.counts.added).toBe(1);
    expect(invalid.items).toMatchObject([{ kind: 'ADDED' }]);
    expect(invalid.errors[0]?.path).toContain('sections.1.category');
    expect(invalidDb.db.$transaction).not.toHaveBeenCalled();
  });
});
