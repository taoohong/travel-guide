import { describe, expect, it, vi } from 'vitest';
import { ContentModule, ContentStatus, VisaType } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PrismaContentRepository } from '../src/prisma/repositories';

describe('签证内容版本', () => {
  it('VisaPolicy 已发布内容修改与审核发布只递增 visa 模块版本', async () => {
    const policy = { id: 'visa-ie-cn', passportRegion: 'CN', destinationCountryCode: 'IE', title: '爱尔兰政策',
      visaType: VisaType.VISA_REQUIRED, maxStayDays: null, status: ContentStatus.PUBLISHED, version: 3,
      corePolicy: [], requirements: [], notes: [], sourceName: null, sourceUrl: null, lastVerifiedAt: null,
      effectiveFrom: null, effectiveTo: null, entrySummary: null, requirementText: null, passportRequired: null,
      passportValidityMonths: null, createdAt: new Date(), updatedAt: new Date() };
    let pending: Record<string, unknown> | null = null;
    const versionModules: string[] = [];
    const tx = {
      visaPolicy: { findUnique: vi.fn(async () => policy), update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...policy, ...data, title: data.title ?? policy.title, status: data.status ?? policy.status, version: policy.version + 1,
      })) },
      contentRevision: {
        findFirst: vi.fn(async () => pending),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { pending = { id: 'rev-1', ...data }; return pending; }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { pending = { ...pending, ...data }; return pending; }),
        delete: vi.fn(async () => { pending = null; return {}; }),
      },
      contentVersion: { upsert: vi.fn(async ({ where }: { where: { module: string } }) => { versionModules.push(where.module); return {}; }) },
      operationLog: { create: vi.fn(async () => ({})) },
    };
    const db = { $transaction: vi.fn(async (run: (value: unknown) => Promise<unknown>) => run(tx)) } as unknown as PrismaService;
    const repository = new PrismaContentRepository(db);
    await repository.mutate({ entity: 'visa', action: 'update', id: policy.id, data: { entrySummary: '最新说明' }, adminId: 'admin-1', requestId: 'edit' });
    expect(tx.contentVersion.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { module: ContentModule.visa } }));
    expect(pending).toMatchObject({ version: 0, after: expect.objectContaining({ entrySummary: '最新说明' }) });

    await repository.mutate({ entity: 'visa', action: 'publish', id: policy.id, data: {}, adminId: 'reviewer-1', requestId: 'publish' });
    expect(tx.contentVersion.upsert).toHaveBeenCalledTimes(2);
    expect(versionModules).toEqual([ContentModule.visa, ContentModule.visa]);
    expect(versionModules).not.toContain(ContentModule.countryGuide);
  });
});
