import { Body, Controller, Get, Inject, Injectable, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AdminRole, ContentModule, ContentStatus, CountryGuideSectionCategory, OperationAction, Prisma } from '@prisma/client';
import { z } from 'zod';
import { countryDto } from '../common/mappers';
import { ApiError, parse, type ApiRequest } from '../common/http';
import { code, id, nonEmpty } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard, CurrentAdmin, RoleGuard, Roles } from './auth/auth';

const editors: AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.CONTENT_ADMIN];
const publishers: AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.REVIEWER];
const nullableDate = z.string().datetime({ offset: true }).nullish();
const sectionFields = {
  category: z.nativeEnum(CountryGuideSectionCategory),
  title: nonEmpty,
  subtitle: z.string().trim().max(500).nullish(),
  content: z.string().trim().min(1).max(50000),
  sortOrder: z.number().int().min(0).optional(),
  sourceKey: z.string().trim().min(1).max(120).nullish(),
  sourceProvider: nonEmpty,
  sourceUrl: z.string().url().max(2000),
  sourceUpdatedAt: nullableDate,
  lastVerifiedAt: nullableDate,
  effectiveFrom: nullableDate,
  effectiveTo: nullableDate,
};
const createSchema = z.object(sectionFields).strict();
const patchSchema = z.object({ ...sectionFields, status: z.nativeEnum(ContentStatus).optional() }).partial().strict();
const importSectionSchema = z.object({
  key: z.string().trim().min(1).max(120),
  category: z.nativeEnum(CountryGuideSectionCategory),
  title: nonEmpty,
  subtitle: z.string().trim().max(500).nullish(),
  content: z.string().trim().min(1).max(50000),
  sortOrder: z.number().int().min(0).default(0),
  sourceProvider: nonEmpty.optional(),
  sourceUrl: z.string().url().max(2000).optional(),
  sourceUpdatedAt: nullableDate,
  importedAt: nullableDate,
  lastVerifiedAt: nullableDate,
  effectiveFrom: nullableDate,
  effectiveTo: nullableDate,
}).strict();
const importPackageSchema = z.object({
  countryCode: code,
  provider: nonEmpty,
  sourceUrl: z.string().url().max(2000),
  sourceUpdatedAt: nullableDate,
  lastVerifiedAt: nullableDate,
  effectiveFrom: nullableDate,
  effectiveTo: nullableDate,
  sections: z.array(z.unknown()).min(1).max(200),
}).strict();
const importRequestSchema = z.object({
  apply: z.boolean().default(false),
  packages: z.array(z.unknown()).max(50),
  ignoredKeys: z.array(z.string().max(200)).default([]),
}).strict();

type GuideGroup = 'overview' | 'entryResidence' | 'travelRisk' | 'safety' | 'transport' | 'priceMedical' | 'practicalInfo';
const groupForCategory: Record<CountryGuideSectionCategory, GuideGroup> = {
  COUNTRY_OVERVIEW: 'overview', ENTRY_RESIDENCE: 'entryResidence', TRAVEL_RISK: 'travelRisk', SAFETY: 'safety',
  TRANSPORT: 'transport', PRICE_MEDICAL: 'priceMedical', PRACTICAL_INFO: 'practicalInfo',
};
const fieldsForDiff = ['category', 'title', 'subtitle', 'content', 'sortOrder', 'sourceProvider', 'sourceUrl', 'sourceUpdatedAt',
  'importedAt', 'lastVerifiedAt', 'effectiveFrom', 'effectiveTo'] as const;
type DiffKind = 'ADDED' | 'CHANGED' | 'UNCHANGED';

function asDate(value: string | Date | null | undefined): Date | null | undefined {
  return value === undefined ? undefined : value === null ? null : value instanceof Date ? value : new Date(value);
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function commonSource<T extends string>(values: Array<T | null | undefined>): T | null {
  const distinct = [...new Set(values.filter((value): value is T => Boolean(value)))];
  return distinct.length === 1 && values.every((value) => Boolean(value)) ? distinct[0]! : null;
}
function sourceFreshness(values: Array<Date | null>): string | null {
  if (!values.length || values.some((value) => value === null)) return null;
  return new Date(Math.min(...values.map((value) => value!.getTime()))).toISOString();
}
function publicSection(row: Record<string, unknown>): object {
  return { id: row.id, title: row.title, subtitle: row.subtitle ?? null, content: row.content,
    sortOrder: row.sortOrder, sourceUrl: row.sourceUrl ?? null, lastVerifiedAt: iso(row.lastVerifiedAt as Date | string | null | undefined) };
}
function adminSection(row: Record<string, unknown>): object {
  return { id: row.id, countryCode: row.countryCode, category: row.category, title: row.title, subtitle: row.subtitle ?? null,
    content: row.content, sortOrder: row.sortOrder, sourceKey: row.sourceKey ?? null, sourceProvider: row.sourceProvider,
    sourceUrl: row.sourceUrl ?? null, sourceUpdatedAt: iso(row.sourceUpdatedAt as Date | string | null | undefined),
    effectiveFrom: iso(row.effectiveFrom as Date | string | null | undefined), effectiveTo: iso(row.effectiveTo as Date | string | null | undefined),
    importedAt: iso(row.importedAt as Date | string | null | undefined), lastVerifiedAt: iso(row.lastVerifiedAt as Date | string | null | undefined),
    contentHash: row.contentHash ?? null, status: row.status, version: row.version,
    draftPending: row.draftPending === true,
    createdAt: iso(row.createdAt as Date | string | null | undefined), updatedAt: iso(row.updatedAt as Date | string | null | undefined) };
}
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return fieldsForDiff.filter((field) => {
    const left = field.endsWith('At') ? iso(before[field] as Date | string | null | undefined) : before[field] ?? null;
    const right = field.endsWith('At') ? iso(after[field] as Date | string | null | undefined) : after[field] ?? null;
    return JSON.stringify(left) !== JSON.stringify(right);
  });
}
function dateFields(value: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = { ...value };
  for (const field of ['sourceUpdatedAt', 'importedAt', 'lastVerifiedAt', 'effectiveFrom', 'effectiveTo']) {
    if (field in data) data[field] = asDate(data[field] as string | Date | null | undefined);
  }
  return data;
}
function definedFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
function assertEditor(admin: ApiRequest['admin']): void {
  if (!admin || !editors.includes(admin.role as AdminRole)) throw new ApiError('FORBIDDEN', '无权限');
}
function assertCanPatch(admin: ApiRequest['admin'], data: Record<string, unknown>): void {
  if (!admin) throw new ApiError('FORBIDDEN', '无权限');
  const role = admin.role as AdminRole;
  const hasContentEdit = Object.keys(data).some((field) => field !== 'status');
  if (hasContentEdit && !editors.includes(role)) throw new ApiError('FORBIDDEN', '无权限');
  if (data.status === ContentStatus.PUBLISHED && !publishers.includes(role)) throw new ApiError('FORBIDDEN', '无权限');
  if (data.status && data.status !== ContentStatus.PUBLISHED && !editors.includes(role)) throw new ApiError('FORBIDDEN', '无权限');
}

@Injectable()
export class CountryGuideService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async getPublic(countryInput: string): Promise<object> {
    const countryCode = parse(code, countryInput);
    const now = new Date();
    const country = await this.db.country.findFirst({
      where: { code: countryCode, status: ContentStatus.PUBLISHED,
        AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }] },
      include: { guideSections: { where: { status: ContentStatus.PUBLISHED,
        AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }] },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] } },
    });
    if (!country) throw new ApiError('NOT_FOUND', '国家不存在');
    const rows = country.guideSections;
    const sections: Record<GuideGroup, object[]> = {
      overview: [], entryResidence: [], travelRisk: [], safety: [], transport: [], priceMedical: [], practicalInfo: [],
    };
    for (const row of rows) sections[groupForCategory[row.category]].push(publicSection(row as unknown as Record<string, unknown>));
    return { country: countryDto(country), sections,
      source: { provider: commonSource(rows.map((row) => row.sourceProvider)),
        sourceUrl: commonSource(rows.map((row) => row.sourceUrl)),
        lastVerifiedAt: sourceFreshness(rows.map((row) => row.lastVerifiedAt)) } };
  }

  async listAdmin(countryInput: string, statusInput?: string): Promise<object[]> {
    const countryCode = parse(code, countryInput);
    const status = statusInput ? parse(z.nativeEnum(ContentStatus), statusInput) : undefined;
    if (!await this.db.country.findUnique({ where: { code: countryCode }, select: { code: true } })) throw new ApiError('NOT_FOUND', '国家不存在');
    const rows = await this.db.countryGuideSection.findMany({ where: { countryCode, ...(status ? { status } : {}) },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { updatedAt: 'desc' }] });
    const drafts = await this.db.contentRevision.findMany({ where: { entityType: 'country-guides', version: 0,
      entityId: { in: rows.map((row) => row.id) } } });
    const draftById = new Map(drafts.map((draft) => [draft.entityId, record(draft.after)]));
    return rows.map((row) => {
      const draft = draftById.get(row.id);
      return adminSection({ ...row, ...(draft ?? {}), id: row.id, countryCode: row.countryCode,
        status: draft?.status ?? row.status, draftPending: Boolean(draft) });
    });
  }

  async createAdmin(countryInput: string, body: unknown, admin: ApiRequest['admin'], requestId: string): Promise<object> {
    assertEditor(admin);
    const countryCode = parse(code, countryInput);
    const data = dateFields(parse(createSchema, body));
    if (!await this.db.country.findUnique({ where: { code: countryCode }, select: { code: true } })) throw new ApiError('NOT_FOUND', '国家不存在');
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.countryGuideSection.create({ data: { ...data, countryCode, status: ContentStatus.DRAFT } as Prisma.CountryGuideSectionUncheckedCreateInput });
      await tx.operationLog.create({ data: { action: OperationAction.CREATE, targetType: 'country-guide', targetId: created.id,
        targetLabel: created.title, changes: json(data), requestId, adminUserId: admin!.id } });
      return created;
    });
    return adminSection(row as unknown as Record<string, unknown>);
  }

  async patchAdmin(idInput: string, body: unknown, admin: ApiRequest['admin'], requestId: string, archive = false): Promise<object> {
    const sectionId = parse(id, idInput);
    const data: Record<string, unknown> = archive ? { status: ContentStatus.ARCHIVED } : parse(patchSchema, body);
    assertCanPatch(admin, data);
    const patch = dateFields(data);
    const result = await this.db.$transaction(async (tx) => {
      const before = await tx.countryGuideSection.findUnique({ where: { id: sectionId } });
      if (!before) throw new ApiError('NOT_FOUND', '国家指南不存在');
      const draft = await tx.contentRevision.findFirst({ where: { entityType: 'country-guides', entityId: sectionId, version: 0 },
        orderBy: { createdAt: 'desc' } });
      const staged = { ...record(draft?.after), ...patch };
      const nextStatus = archive ? ContentStatus.ARCHIVED : (patch.status as ContentStatus | undefined) ?? before.status;
      const changes = changedFields(before as unknown as Record<string, unknown>, { ...before, ...staged } as Record<string, unknown>);
      const statusChanged = nextStatus !== before.status;
      if (!changes.length && !statusChanged && !draft) return before;
      const stageOnly = before.status === ContentStatus.PUBLISHED && !archive &&
        patch.status !== ContentStatus.PUBLISHED && patch.status !== ContentStatus.DRAFT && patch.status !== ContentStatus.ARCHIVED;
      if (stageOnly) {
        const pendingStatus = patch.status ?? record(draft?.after).status;
        const after = { ...staged, ...(pendingStatus ? { status: pendingStatus } : {}) };
        const logged = [...changes, ...(statusChanged ? [{ field: 'status', before: before.status, after: nextStatus }] : [])];
        const revisionData = { after: json(after), changedFields: json(changes), adminUserId: admin!.id };
        if (draft) await tx.contentRevision.update({ where: { id: draft.id }, data: revisionData });
        else await tx.contentRevision.create({ data: { module: ContentModule.countryGuide, entityType: 'country-guides', entityId: sectionId,
          version: 0, before: json(before), ...revisionData } });
        await tx.operationLog.create({ data: { action: OperationAction.UPDATE, targetType: 'country-guide', targetId: sectionId,
          targetLabel: String(staged.title ?? before.title), changes: json(logged), requestId, adminUserId: admin!.id } });
        return { ...before, ...after, id: before.id, countryCode: before.countryCode, status: pendingStatus ?? before.status, draftPending: true };
      }
      const afterStatus = archive ? ContentStatus.ARCHIVED : (patch.status as ContentStatus | undefined) ?? before.status;
      const updateData = { ...staged, status: afterStatus, version: { increment: 1 } };
      const updated = await tx.countryGuideSection.update({ where: { id: sectionId }, data: updateData });
      if (draft) await tx.contentRevision.delete({ where: { id: draft.id } });
      if (changes.length || statusChanged) {
        await tx.contentVersion.upsert({ where: { module: ContentModule.countryGuide },
          create: { module: ContentModule.countryGuide, version: 1, changedByEntity: 'country-guide', changedById: sectionId },
          update: { version: { increment: 1 }, changedByEntity: 'country-guide', changedById: sectionId } });
      }
      const action = updated.status === ContentStatus.PUBLISHED && (before.status !== ContentStatus.PUBLISHED || Boolean(draft)) ? OperationAction.PUBLISH :
        before.status === ContentStatus.PUBLISHED && updated.status !== ContentStatus.PUBLISHED ? (archive ? OperationAction.DELETE : OperationAction.UNPUBLISH) : OperationAction.UPDATE;
      const logged = [...changes, ...(statusChanged ? [{ field: 'status', before: before.status, after: afterStatus }] : [])];
      await tx.operationLog.create({ data: { action, targetType: 'country-guide', targetId: sectionId, targetLabel: updated.title,
        changes: json(logged), requestId, adminUserId: admin!.id } });
      return updated;
    });
    return adminSection(result as unknown as Record<string, unknown>);
  }

  async import(body: unknown, admin: ApiRequest['admin'], requestId: string): Promise<object> {
    assertEditor(admin);
    const request = parse(importRequestSchema, body);
    const errors: Array<{ path: string; message: string }> = [];
    const candidates: Array<{ countryCode: string; sourceKey: string; data: Record<string, unknown>; path: string }> = [];
    let totalSections = 0;
    const seen = new Set<string>();
    for (const [packageIndex, rawPackage] of request.packages.entries()) {
      const packageResult = importPackageSchema.safeParse(rawPackage);
      if (!packageResult.success) {
        errors.push(...packageResult.error.issues.map((issue) => ({ path: `packages.${packageIndex}.${issue.path.join('.')}`, message: issue.message })));
        continue;
      }
      const item = packageResult.data;
      const country = await this.db.country.findUnique({ where: { code: item.countryCode }, select: { code: true } });
      if (!country) errors.push({ path: `packages.${packageIndex}.countryCode`, message: '国家不存在' });
      for (const [sectionIndex, rawSection] of item.sections.entries()) {
        totalSections += 1;
        if (totalSections > 2000) {
          errors.push({ path: 'packages', message: '单次导入最多 2000 条指南内容' });
          break;
        }
        const sectionResult = importSectionSchema.safeParse(rawSection);
        if (!sectionResult.success) {
          errors.push(...sectionResult.error.issues.map((issue) => ({ path: `packages.${packageIndex}.sections.${sectionIndex}.${issue.path.join('.')}`, message: issue.message })));
          continue;
        }
        const section = sectionResult.data;
        const identity = `${item.countryCode}:${section.key}`;
        if (seen.has(identity)) {
          errors.push({ path: `packages.${packageIndex}.sections.${sectionIndex}.key`, message: '同一国家的导入包中 key 重复' });
          continue;
        }
        seen.add(identity);
        const { key, ...rest } = section;
      const data = definedFields(dateFields({ ...rest, sourceProvider: section.sourceProvider ?? item.provider,
        sourceUrl: section.sourceUrl ?? item.sourceUrl,
        sourceUpdatedAt: section.sourceUpdatedAt ?? item.sourceUpdatedAt,
        lastVerifiedAt: section.lastVerifiedAt ?? item.lastVerifiedAt,
        effectiveFrom: section.effectiveFrom ?? item.effectiveFrom,
        effectiveTo: section.effectiveTo ?? item.effectiveTo }));
        candidates.push({ countryCode: item.countryCode, sourceKey: key, data, path: `packages.${packageIndex}.sections.${sectionIndex}` });
      }
    }
    const existing = new Map<string, Record<string, unknown>>();
    const byCountry = new Map<string, typeof candidates>();
    for (const item of candidates) {
      const group = byCountry.get(item.countryCode) ?? [];
      group.push(item);
      byCountry.set(item.countryCode, group);
    }
    for (const [countryCode, items] of byCountry) {
      const rows = await this.db.countryGuideSection.findMany({ where: { countryCode, sourceKey: { in: items.map((item) => item.sourceKey) } } });
      for (const row of rows) existing.set(`${countryCode}:${row.sourceKey}`, row as unknown as Record<string, unknown>);
    }
    const drafts = existing.size ? await this.db.contentRevision.findMany({ where: { entityType: 'country-guides', version: 0,
      entityId: { in: [...existing.values()].map((row) => String(row.id)) } } }) : [];
    const draftById = new Map(drafts.map((draft) => [draft.entityId, record(draft.after)]));
    const preview = candidates.map((item) => {
      const baseline = existing.get(`${item.countryCode}:${item.sourceKey}`);
      const before = baseline ? { ...baseline, ...(draftById.get(String(baseline.id)) ?? {}) } : undefined;
      const changed = { ...(before ?? {}), ...item.data };
      const fields = before ? changedFields(before, changed) : [];
      const kind: DiffKind = !before ? 'ADDED' : fields.length ? 'CHANGED' : 'UNCHANGED';
      const after = kind === 'UNCHANGED' ? changed : { ...changed, status: ContentStatus.DRAFT };
      return { countryCode: item.countryCode, key: item.sourceKey, id: baseline?.id ?? null, kind, changedFields: fields,
        before: before ? adminSection(before) : null, after: adminSection(after),
        statusAfterImport: kind === 'UNCHANGED' ? before?.status : ContentStatus.DRAFT };
    });
    const counts = { added: preview.filter((item) => item.kind === 'ADDED').length,
      changed: preview.filter((item) => item.kind === 'CHANGED').length,
      unchanged: preview.filter((item) => item.kind === 'UNCHANGED').length, errors: errors.length };
    const ignored = new Set(request.ignoredKeys);
    const selectedCandidates = candidates.filter((item) => !ignored.has(`${item.countryCode}:${item.sourceKey}`));
    const selectedPreview = selectedCandidates.map((item) => preview[candidates.indexOf(item)]!);
    if (errors.length || !request.apply || !selectedPreview.some((item) => item.kind !== 'UNCHANGED')) return { applied: false, counts, items: preview, errors };

    await this.db.$transaction(async (tx) => {
      for (const item of selectedCandidates) {
        const row = existing.get(`${item.countryCode}:${item.sourceKey}`);
        const itemPreview = preview[candidates.indexOf(item)]!;
        const kind = itemPreview.kind;
        if (kind === 'UNCHANGED') continue;
        const data = { ...item.data, sourceKey: item.sourceKey, importedAt: item.data.importedAt ?? new Date(), status: ContentStatus.DRAFT };
        if (row) {
          if (row.status === ContentStatus.PUBLISHED) {
            const existingDraft = await tx.contentRevision.findFirst({ where: { entityType: 'country-guides', entityId: String(row.id), version: 0 },
              orderBy: { createdAt: 'desc' } });
            const baseline = record(row);
            const next = { ...baseline, ...record(existingDraft?.after), ...data, status: ContentStatus.DRAFT };
            const revisionData = { after: json(next), changedFields: json(changedFields(baseline, next)), adminUserId: admin!.id };
            if (existingDraft) await tx.contentRevision.update({ where: { id: existingDraft.id }, data: revisionData });
            else await tx.contentRevision.create({ data: { module: ContentModule.countryGuide, entityType: 'country-guides',
              entityId: String(row.id), version: 0, before: json(baseline), ...revisionData } });
          } else {
            await tx.countryGuideSection.update({ where: { id: String(row.id) }, data: { ...data, version: { increment: 1 } } });
          }
        } else {
          await tx.countryGuideSection.create({ data: { ...data, countryCode: item.countryCode } as Prisma.CountryGuideSectionUncheckedCreateInput });
        }
        await tx.operationLog.create({ data: { action: row ? OperationAction.UPDATE : OperationAction.CREATE,
          targetType: 'country-guide', targetId: row ? String(row.id) : item.sourceKey,
          targetLabel: String(item.data.title), changes: json({ import: true, sourceKey: item.sourceKey, changedFields: itemPreview.changedFields }),
          requestId, adminUserId: admin!.id } });
      }
    });
    return { applied: true, counts, items: preview, errors };
  }
}

@Controller()
export class CountryGuideController {
  constructor(@Inject(CountryGuideService) private readonly service: CountryGuideService) {}
  @Get('countries/:countryCode/guide') get(@Param('countryCode') codeInput: string): Promise<object> { return this.service.getPublic(codeInput); }
}

@Controller('admin')
@UseGuards(AdminGuard, RoleGuard)
export class AdminCountryGuideController {
  constructor(@Inject(CountryGuideService) private readonly service: CountryGuideService) {}
  @Post('country-guides/import') @Roles(...editors)
  import(@Body() body: unknown, @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    return this.service.import(body, admin, req.requestId);
  }
}
