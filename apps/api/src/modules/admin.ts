import { Body, Controller, Delete, Get, Inject, Injectable, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminRole, ContentStatus, CountryGuideSectionCategory, OperationAction, VisaRequirementType, VisaType } from '@prisma/client';
import { getVisaFreshness } from '@travel-guide/core';
import { z } from 'zod';
import { ApiError, parse, type ApiRequest } from '../common/http';
import { managedDto, tripDto } from '../common/mappers';
import { code, id, nonEmpty, pageQuery } from '../common/validation';
import { REPO, type ContentRepository, type CountryRepository, type ManagedEntity,
  type LinkKind, type OperationLogRepository, type TripRepository, type VisaRepository } from '../prisma/repositories';
import { AdminGuard, CurrentAdmin, RoleGuard, Roles } from './auth/auth';

const editable = z.object({ effectiveFrom: z.string().datetime({ offset: true }).nullish(),
  effectiveTo: z.string().datetime({ offset: true }).nullish(), lastVerifiedAt: z.string().datetime({ offset: true }).nullish() });
const mapping = { actionable: z.boolean().optional(), targetStage: z.enum(['PREPARING', 'DEPARTING', 'TRAVELING', 'RETURNING']).nullish(),
  itemType: z.enum(['VISA_MATERIAL', 'PACKING_ITEM', 'ATTRACTION']).nullish(), scope: z.enum(['TRIP', 'COUNTRY', 'DESTINATION']).nullish(),
  dedupeKey: z.string().trim().min(1).max(200).nullish() };
export const schemas = {
  continents: editable.extend({ code, nameZh: nonEmpty, nameEn: nonEmpty, sortOrder: z.number().int().optional(), enabled: z.boolean().optional(),
    centerLatitude: z.number().min(-90).max(90).nullish(), centerLongitude: z.number().min(-180).max(180).nullish(),
    defaultZoom: z.number().positive().nullish(), highlightColor: z.string().max(30).nullish() }).strict(),
  countries: editable.extend({ code, continentCode: code, nameZh: nonEmpty, nameEn: nonEmpty, latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180), online: z.boolean().optional(), summary: z.string().max(5000).nullish(),
    flagUrl: z.string().url().nullish(), currencyCode: z.string().length(3).nullish(), languages: z.array(z.string().max(50)).optional(),
    timeZone: z.string().max(100).nullish(), phoneCode: z.string().max(20).nullish(),
    recommendation: z.number().int().min(0).optional(), sortOrder: z.number().int().optional() }).strict(),
  cities: editable.extend({ countryCode: code, code: z.string().regex(/^[A-Z0-9_-]{2,12}$/), nameZh: nonEmpty, nameEn: nonEmpty,
    latitude: z.number().min(-90).max(90).nullish(), longitude: z.number().min(-180).max(180).nullish(), sortOrder: z.number().int().optional() }).strict(),
  visa: editable.extend({ passportRegion: z.union([code, z.literal('*')]), destinationCountryCode: z.union([code, z.literal('*')]),
    visaType: z.nativeEnum(VisaType), visaRequirement: z.nativeEnum(VisaRequirementType).optional(), title: nonEmpty,
    corePolicy: z.array(nonEmpty).optional(), sourceName: nonEmpty.nullish(), sourceProvider: nonEmpty.nullish(),
    maxStayDays: z.number().int().positive().nullish(), feeAmount: z.number().nonnegative().nullish(), feeCurrency: z.string().length(3).nullish(),
    passportRequired: z.boolean().nullish(), passportValidityMonths: z.number().int().positive().nullish(),
    passportValidityRequirement: z.string().max(500).nullish(), entrySummary: z.string().max(5000).nullish(), requirementText: z.string().max(20000).nullish(),
    feeNote: z.string().max(500).nullish(), processingTime: z.string().max(200).nullish(), notes: z.array(z.string().max(500)).optional(),
    sourceUrl: z.string().url().nullish(), retrievedAt: z.string().datetime({ offset: true }).nullish() }).strict(),
  'country-guides': editable.extend({ countryCode: code, category: z.nativeEnum(CountryGuideSectionCategory), title: nonEmpty,
    subtitle: z.string().trim().max(500).nullish(), content: nonEmpty, sortOrder: z.number().int().optional(), sourceKey: z.string().max(120).nullish(),
    sourceProvider: nonEmpty, sourceUrl: z.string().url(), sourceUpdatedAt: z.string().datetime({ offset: true }).nullish(),
    importedAt: z.string().datetime({ offset: true }).nullish(), contentHash: z.string().max(128).nullish() }).strict(),
  'visa-requirements': editable.extend({ visaPolicyId: id, title: nonEmpty, description: z.string().max(2000).nullish(),
    required: z.boolean().optional(), sortOrder: z.number().int().optional(), ...mapping }).strict(),
  transport: editable.extend({ countryCode: code, cityCode: z.string().max(12).nullish(), name: nonEmpty, kind: nonEmpty,
    description: z.string().max(5000).nullish(), paymentMethod: z.string().max(500).nullish(), priceInfo: z.string().max(500).nullish(),
    operatingHours: z.string().max(500).nullish(), notes: z.string().max(5000).nullish(), sortOrder: z.number().int().optional(), ...mapping }).strict(),
  packing: editable.extend({ code: z.string().regex(/^[a-z0-9_]{2,80}$/), name: nonEmpty, description: z.string().max(2000).nullish(),
    category: z.string().max(100).nullish(), universal: z.boolean().optional(), sortOrder: z.number().int().optional(), ...mapping }).omit({ sortOrder: true }).strict(),
  'travel-apps': editable.extend({ code: z.string().regex(/^[a-z0-9_]{2,80}$/), name: nonEmpty, logoUrl: z.string().url().nullish(),
    iosUrl: z.string().url().nullish(), androidUrl: z.string().url().nullish(), purpose: z.string().max(1000).nullish(),
    recommendation: z.string().max(1000).nullish(), ...mapping }).strict(),
  tips: editable.extend({ countryCode: code, cityCode: z.string().max(12).nullish(), title: nonEmpty, content: nonEmpty,
    category: nonEmpty, importance: z.enum(['NORMAL', 'TIP', 'IMPORTANT', 'WARNING']).optional(),
    sortOrder: z.number().int().optional(), ...mapping }).strict(),
  attractions: editable.extend({ countryCode: code, cityCode: z.string().max(12).nullish(), nameZh: nonEmpty, nameEn: z.string().max(500).nullish(),
    description: z.string().max(10000).nullish(), latitude: z.number().min(-90).max(90).nullish(), longitude: z.number().min(-180).max(180).nullish(),
    coverUrl: z.string().url().nullish(), visitMinutes: z.number().int().positive().nullish(), openingHours: z.string().max(500).nullish(),
    ticketInfo: z.string().max(1000).nullish(), website: z.string().url().nullish(), category: z.string().max(100).nullish(), tags: z.array(z.string().max(100)).optional(),
    recommendation: z.number().int().optional(), sortOrder: z.number().int().optional(), ...mapping }).strict(),
} satisfies Record<ManagedEntity, z.ZodObject<z.ZodRawShape>>;
const entities = Object.keys(schemas) as ManagedEntity[];
const linkSchemas = {
  'country-packing': z.object({ countryCode: code, packingItemId: id, sortOrder: z.number().int().optional() }).strict(),
  'country-apps': z.object({ countryCode: code, travelAppId: id, cityCode: z.string().max(12).nullish(), sortOrder: z.number().int().optional() }).strict(),
  'attraction-images': z.object({ attractionId: id, mediaAssetId: id, alt: z.string().max(500).nullish(), sortOrder: z.number().int().optional() }).strict(),
  'country-media': z.object({ countryCode: code, mediaAssetId: id, alt: z.string().max(500).nullish(), sortOrder: z.number().int().optional() }).strict(),
};
function linkKind(value: string): LinkKind {
  if (!(value in linkSchemas)) throw new ApiError('NOT_FOUND', '关联类型不存在');
  return value as LinkKind;
}

function entityOf(value: string): ManagedEntity {
  if (!entities.includes(value as ManagedEntity)) throw new ApiError('NOT_FOUND', '内容类型不存在');
  return value as ManagedEntity;
}
function convertDates(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) =>
    ['effectiveFrom', 'effectiveTo', 'lastVerifiedAt', 'retrievedAt', 'sourceUpdatedAt', 'importedAt'].includes(key) &&
      typeof value === 'string' ? [key, new Date(value)] : [key, value]));
}

@Injectable()
export class ContentHealthService {
  constructor(@Inject(REPO.content) private readonly content: ContentRepository,
    @Inject(REPO.country) private readonly countries: CountryRepository,
    @Inject(REPO.visa) private readonly visas: VisaRepository) {}
  async status(): Promise<object> {
    const [countries, missing, policies] = await Promise.all([this.countries.count(), this.content.health(), this.visas.list()]);
    const stale = policies.filter((row) => row.status === 'PUBLISHED' && getVisaFreshness({ lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      effectiveFrom: row.effectiveFrom?.toISOString() ?? null, effectiveTo: row.effectiveTo?.toISOString() ?? null }).expired).length;
    return { countries: countries.total, onlineCountries: countries.online, missingVisa: missing.missingVisa,
      staleVisaPolicies: stale, countriesWithoutAttractions: missing.noAttractions, countriesWithoutTransport: missing.noTransport,
      completeness: countries.averageCompleteness, guideCompleteness: missing.guideCompleteness };
  }
}

@Injectable()
export class AdminContentService {
  constructor(@Inject(REPO.content) private readonly content: ContentRepository,
    @Inject(REPO.visa) private readonly visas: VisaRepository,
    @Inject(REPO.log) private readonly logs: OperationLogRepository,
    @Inject(REPO.trip) private readonly trips: TripRepository,
    @Inject(ContentHealthService) private readonly healthService: ContentHealthService) {}
  async list(entityInput: string, query: unknown): Promise<object> {
    const entity = entityOf(entityInput);
    const input = parse(pageQuery.extend({ keyword: z.string().trim().min(1).max(100).optional(),
      continentCode: code.optional(), countryCode: code.optional(), cityCode: z.string().max(12).optional(),
      online: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
      status: z.nativeEnum(ContentStatus).optional(), passportRegion: z.union([code, z.literal('*')]).optional(),
      destinationCountryCode: z.union([code, z.literal('*')]).optional(), visaType: z.nativeEnum(VisaType).optional(),
      stale: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
      category: z.string().max(100).optional(), tag: z.string().max(100).optional(), visaPolicyId: id.optional(),
      sort: z.enum(['updatedAt', 'completeness']).optional() }), query);
    const result = await this.content.listManaged(entity, input.page, input.pageSize, input);
    return { items: result.items.map((row) => this.asManaged(entity, row)), total: result.total, page: input.page, pageSize: input.pageSize };
  }
  private asManaged(entity: ManagedEntity, row: unknown): object {
    const dto = managedDto(entity, row);
    if (entity !== 'visa') return dto;
    const policy = row as { lastVerifiedAt?: Date | string | null; effectiveFrom?: Date | string | null; effectiveTo?: Date | string | null };
    const date = (value: Date | string | null | undefined): string | null => value instanceof Date ? value.toISOString() : value ?? null;
    return { ...dto, freshness: getVisaFreshness({ lastVerifiedAt: date(policy.lastVerifiedAt),
      effectiveFrom: date(policy.effectiveFrom), effectiveTo: date(policy.effectiveTo) }) };
  }
  async get(entityInput: string, itemId: string): Promise<object> {
    const entity = entityOf(entityInput);
    const row = await this.content.getManaged(entity, parse(id, itemId));
    if (!row) throw new ApiError('NOT_FOUND', '内容不存在');
    return this.asManaged(entity, row);
  }
  async write(entityInput: string, action: 'create' | 'update' | 'archive' | 'publish' | 'unpublish', itemId: string | undefined,
    body: unknown, adminId: string, requestId: string): Promise<object> {
    const entity = entityOf(entityInput);
    const schema: z.AnyZodObject = schemas[entity];
    const data = action === 'create' ? parse(schema, body) : action === 'update' ? parse(schema.partial(), body) :
      action === 'publish' ? { lastVerifiedAt: new Date() } : {};
    if ((action === 'create' || action === 'update') && data.actionable === true) {
      const previous = itemId ? await this.content.getManaged(entity, itemId) as Record<string, unknown> | null : null;
      const merged = { ...previous, ...data };
      if (!merged.targetStage || !merged.itemType || !merged.scope) throw new ApiError('VALIDATION_FAILED', '可加入计划的内容必须提供完整 planMapping');
    }
    if (entity === 'visa' && action === 'publish') {
      const candidate = await this.visas.findById(itemId ?? '');
      if (!candidate) throw new ApiError('NOT_FOUND', '签证政策不存在');
      const staged = await this.content.getManaged('visa', itemId ?? '') as Record<string, unknown> | null;
      const policy = { ...candidate, ...staged };
      const missing = [
        !(policy.sourceProvider || policy.sourceName) && 'sourceProvider',
        !policy.sourceUrl && 'sourceUrl',
      ].filter(Boolean);
      if (missing.length) throw new ApiError('VALIDATION_FAILED', '签证政策尚未完整，不能发布', { missing });
    }
    const row = await this.content.mutate({ entity, action, id: itemId, data: convertDates(data), adminId, requestId });
    if (!row) throw new ApiError('NOT_FOUND', '内容不存在');
    return managedDto(entity, row);
  }
  async link(kindInput: string, action: 'create' | 'delete', linkId: string | undefined, body: unknown,
    adminId: string, requestId: string): Promise<object> {
    const kind = linkKind(kindInput);
    const data = action === 'create' ? parse(linkSchemas[kind], body) : {};
    const row = await this.content.link({ kind, action, id: linkId ? parse(id, linkId) : undefined, data, adminId, requestId });
    if (!row) throw new ApiError('NOT_FOUND', '关联或媒体资源不存在');
    return row as object;
  }
  links(kindInput: string, parentInput: string): Promise<unknown[]> {
    const kind = linkKind(kindInput);
    return this.content.listLinks(kind, parse(id, parentInput));
  }
  async reorderLink(kindInput: string, linkId: string, body: unknown, adminId: string, requestId: string): Promise<object> {
    const kind = linkKind(kindInput);
    const { sortOrder } = parse(z.object({ sortOrder: z.number().int().min(0) }).strict(), body);
    const row = await this.content.reorderLink(kind, parse(id, linkId), sortOrder, adminId, requestId);
    if (!row) throw new ApiError('NOT_FOUND', '关联不存在');
    return row as object;
  }
  health(): Promise<object> { return this.healthService.status(); }
  async logsList(query: unknown): Promise<object> {
    const input = parse(pageQuery.extend({ adminUserId: id.optional(), action: z.nativeEnum(OperationAction).optional(),
      targetType: z.string().max(100).optional(), from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional() }), query);
    const result = await this.logs.list(input.page, input.pageSize, { ...input,
      from: input.from ? new Date(input.from) : undefined, to: input.to ? new Date(input.to) : undefined });
    return { items: result.items.map((value) => { const row = value as Record<string, unknown>;
      return { id: row.id, adminUserId: row.adminUserId, action: row.action, targetType: row.targetType,
        targetId: row.targetId, targetLabel: row.targetLabel, changes: row.changes, requestId: row.requestId,
        timestamp: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt }; }),
    total: result.total, page: input.page, pageSize: input.pageSize };
  }
  async tripsList(query: unknown): Promise<object> {
    const input = parse(pageQuery.extend({ userId: id }), query);
    const result = await this.trips.list(input.userId, input.page, input.pageSize);
    return { items: result.items.map(tripDto), total: result.total, page: input.page, pageSize: input.pageSize };
  }
  async freshness(): Promise<object[]> {
    return (await this.visas.list()).filter((row) => row.status === 'PUBLISHED' && getVisaFreshness({ lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      effectiveFrom: row.effectiveFrom?.toISOString() ?? null, effectiveTo: row.effectiveTo?.toISOString() ?? null }).expired)
      .map((row) => ({ passportRegion: row.passportRegion, destinationCountryCode: row.destinationCountryCode,
        ...getVisaFreshness({ lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
          effectiveFrom: row.effectiveFrom?.toISOString() ?? null, effectiveTo: row.effectiveTo?.toISOString() ?? null }) }));
  }
  async visaByPair(passportRegion: string, countryCode: string): Promise<{ id: string } | null> {
    const row = await this.visas.findPair(passportRegion, countryCode);
    return row ? { id: row.id } : null;
  }
}

const readers = [AdminRole.SUPER_ADMIN, AdminRole.CONTENT_ADMIN, AdminRole.REVIEWER, AdminRole.VIEWER];
const editors = [AdminRole.SUPER_ADMIN, AdminRole.CONTENT_ADMIN];
const publishers = [AdminRole.SUPER_ADMIN, AdminRole.REVIEWER];

@Controller('admin')
@UseGuards(AdminGuard, RoleGuard)
export class AdminController {
  constructor(@Inject(AdminContentService) private readonly service: AdminContentService) {}
  @Get('content-health') @Roles(...readers) health(): Promise<object> { return this.service.health(); }
  @Get('operation-logs') @Roles(...readers) logs(@Query() query: unknown): Promise<object> { return this.service.logsList(query); }
  @Get('trips') @Roles(...readers) trips(@Query() query: unknown): Promise<object> { return this.service.tripsList(query); }
  @Get('visa/freshness') @Roles(...readers) freshness(): Promise<object[]> { return this.service.freshness(); }
  @Get('visa') @Roles(...readers) visa(@Query() query: unknown): Promise<object> { return this.service.list('visa', query); }
  @Get('links/:kind/:parent') @Roles(...readers) links(@Param('kind') kind: string, @Param('parent') parent: string): Promise<unknown[]> {
    return this.service.links(kind, parent);
  }
  @Patch('links/:kind/:id') @Roles(...editors) reorderLink(@Param('kind') kind: string, @Param('id') linkId: string,
    @Body() body: unknown, @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    return this.service.reorderLink(kind, linkId, body, admin!.id, req.requestId);
  }
  @Post('links/:kind') @Roles(...editors) link(@Param('kind') kind: string, @Body() body: unknown,
    @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    return this.service.link(kind, 'create', undefined, body, admin!.id, req.requestId);
  }
  @Delete('links/:kind/:id') @Roles(...editors) unlink(@Param('kind') kind: string, @Param('id') linkId: string,
    @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    return this.service.link(kind, 'delete', linkId, {}, admin!.id, req.requestId);
  }
  @Post('visa') @Roles(...editors) async upsertVisa(@Body() body: unknown, @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    const input = parse(schemas.visa, body);
    const existing = await this.service.visaByPair(input.passportRegion, input.destinationCountryCode);
    return this.service.write('visa', existing ? 'update' : 'create', existing?.id, body, admin!.id, req.requestId);
  }
  @Delete('visa/:passportRegion/:countryCode') @Roles(...editors) async archiveVisa(
    @Param('passportRegion') passportRegion: string, @Param('countryCode') countryCode: string,
    @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    const existing = await this.service.visaByPair(parse(code, passportRegion), parse(code, countryCode));
    if (!existing) throw new ApiError('NOT_FOUND', '签证政策不存在');
    return this.service.write('visa', 'archive', existing.id, {}, admin!.id, req.requestId);
  }
  @Get('content/:entity') @Roles(...readers) list(@Param('entity') entity: string, @Query() query: unknown): Promise<object> { return this.service.list(entity, query); }
  @Get('content/:entity/:id') @Roles(...readers) get(@Param('entity') entity: string, @Param('id') id: string): Promise<object> { return this.service.get(entity, id); }
  @Post('content/:entity') @Roles(...editors) create(@Param('entity') entity: string, @Body() body: unknown,
    @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    return this.service.write(entity, 'create', undefined, body, admin!.id, req.requestId);
  }
  @Patch('content/:entity/:id') @Roles(...editors) update(@Param('entity') entity: string, @Param('id') id: string,
    @Body() body: unknown, @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    return this.service.write(entity, 'update', id, body, admin!.id, req.requestId);
  }
  @Delete('content/:entity/:id') @Roles(...editors) archive(@Param('entity') entity: string, @Param('id') id: string,
    @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    return this.service.write(entity, 'archive', id, {}, admin!.id, req.requestId);
  }
  @Post('content/:entity/:id/publish') @Roles(...publishers) publish(@Param('entity') entity: string, @Param('id') id: string,
    @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    return this.service.write(entity, 'publish', id, {}, admin!.id, req.requestId);
  }
  @Post('content/:entity/:id/unpublish') @Roles(...publishers) unpublish(@Param('entity') entity: string, @Param('id') id: string,
    @CurrentAdmin() admin: ApiRequest['admin'], @Req() req: ApiRequest): Promise<object> {
    return this.service.write(entity, 'unpublish', id, {}, admin!.id, req.requestId);
  }
}
