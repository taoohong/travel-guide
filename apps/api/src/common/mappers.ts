import type { Country, City, Continent, Trip, TripDestination } from '@prisma/client';
import type { PlanItem as DomainPlanItem } from '@travel-guide/types';
import type { VisaRecord, ManagedEntity, GuideKind, PlanItemRecord } from '../prisma/repositories';
import { iso } from './validation';

export function countryDto(row: Country): object {
  return { code: row.code, continentCode: row.continentCode, name: row.nameZh, nameEn: row.nameEn,
    flagUrl: row.flagUrl, latitude: row.latitude, longitude: row.longitude, currencyCode: row.currencyCode,
    languages: row.languages, timeZone: row.timeZone, phoneCode: row.phoneCode, summary: row.summary,
    online: row.online, completeness: row.completeness, version: row.version };
}
export function continentDto(row: Continent): object {
  return { code: row.code, name: row.nameZh, nameEn: row.nameEn, sortOrder: row.sortOrder,
    centerLatitude: row.centerLatitude, centerLongitude: row.centerLongitude, defaultZoom: row.defaultZoom,
    highlightColor: row.highlightColor };
}
export function cityDto(row: City): object {
  return { id: row.id, code: row.code, countryCode: row.countryCode, name: row.nameZh, nameEn: row.nameEn,
    latitude: row.latitude, longitude: row.longitude, sortOrder: row.sortOrder };
}
export function tripDto(row: Trip): object {
  return { id: row.id, userId: row.userId, title: row.title, notes: row.notes, status: row.status,
    startDate: iso(row.startDate), endDate: iso(row.endDate), travelers: row.travelers, createdAt: row.createdAt.toISOString() };
}
export function destinationDto(row: TripDestination): object {
  return { id: row.id, tripId: row.tripId, countryCode: row.countryCode, continentCode: row.continentCode,
    cityCode: row.cityCode, orderIndex: row.orderIndex, arrivalDate: iso(row.arrivalDate),
    departureDate: iso(row.departureDate), isOrigin: row.isOrigin };
}
export function planDto(row: PlanItemRecord, userId: string, memberIds: readonly string[]): DomainPlanItem {
  const completions = row.completions.filter((completion) => memberIds.includes(completion.userId));
  const ownCompletion = completions.find((completion) => completion.userId === userId);
  return { id: row.id, tripId: row.tripId, stage: row.stage, itemType: row.itemType, scope: row.scope,
    title: row.title, description: row.description, sourceType: row.sourceType, sourceId: row.sourceId,
    sourceCountryCode: row.sourceCountryCode, dedupeKey: row.dedupeKey, dedupeHash: row.dedupeHash,
    sortOrder: row.sortOrder, done: !!ownCompletion, doneAt: iso(ownCompletion?.completedAt ?? null), planDate: iso(row.planDate),
    completionCount: completions.length, memberCount: memberIds.length, imageUrl: row.imageUrl ?? null };
}
export function visaDto(row: VisaRecord): object {
  return { passportRegion: row.passportRegion, destinationCountryCode: row.destinationCountryCode,
    visaType: row.visaType, title: row.title, corePolicy: row.corePolicy, maxStayDays: row.maxStayDays,
    visaRequirement: row.visaRequirement, passportRequired: row.passportRequired, passportValidityMonths: row.passportValidityMonths,
    passportValidityRequirement: row.passportValidityRequirement, entrySummary: row.entrySummary, requirementText: row.requirementText,
    sourceProvider: row.sourceProvider, retrievedAt: iso(row.retrievedAt),
    fee: row.feeAmount && row.feeCurrency ? { amount: Number(row.feeAmount), currency: row.feeCurrency, note: row.feeNote } : null,
    processingTime: row.processingTime, notes: row.notes, sourceName: row.sourceName ?? '', sourceUrl: row.sourceUrl,
    status: row.status, version: row.version, effectiveFrom: iso(row.effectiveFrom), effectiveTo: iso(row.effectiveTo),
    lastVerifiedAt: iso(row.lastVerifiedAt),
    requirements: row.requirements.map((item) => ({ id: item.id, title: item.title, description: item.description,
      required: item.required, sortOrder: item.sortOrder, planMapping: planMapping(item) })) };
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function pick(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, row[field] instanceof Date ? (row[field] as Date).toISOString() : row[field]]));
}
const mappingFields = ['actionable', 'targetStage', 'itemType', 'scope', 'dedupeKey'];
export function planMapping(value: unknown): object | null {
  const row = record(value);
  return row.actionable && row.targetStage && row.itemType && row.scope ? pick(row, mappingFields) : null;
}

export function guideDto(kind: GuideKind, value: unknown): object {
  const link = record(value);
  const row = kind === 'packing' ? record(link.packingItem) : kind === 'apps' ? record(link.travelApp) : link;
  const fields: Record<GuideKind, string[]> = {
    transport: ['id', 'countryCode', 'cityCode', 'name', 'kind', 'description', 'paymentMethod', 'priceInfo', 'operatingHours', 'notes', 'sortOrder'],
    packing: ['id', 'code', 'name', 'description', 'category', 'universal', 'sortOrder'],
    tips: ['id', 'countryCode', 'cityCode', 'title', 'content', 'category', 'importance', 'sortOrder'],
    apps: ['id', 'code', 'name', 'logoUrl', 'iosUrl', 'androidUrl', 'purpose', 'recommendation'],
    attractions: ['id', 'countryCode', 'cityCode', 'nameZh', 'nameEn', 'description', 'latitude', 'longitude', 'coverUrl', 'visitMinutes', 'openingHours', 'ticketInfo', 'website', 'category', 'tags', 'recommendation', 'sortOrder'],
  };
  return { ...pick(row, fields[kind]), ...(kind === 'packing' || kind === 'apps' ? { sortOrder: link.sortOrder } : {}),
    planMapping: planMapping(row),
    ...(kind === 'attractions' ? { images: Array.isArray(row.images) ? row.images.map((image) => pick(record(image), ['id', 'url', 'alt', 'sortOrder'])) : [] } : {}) };
}

const managedFields: Record<ManagedEntity, string[]> = {
  continents: ['code', 'nameZh', 'nameEn', 'sortOrder', 'enabled', 'centerLatitude', 'centerLongitude', 'defaultZoom', 'highlightColor'],
  countries: ['code', 'continentCode', 'nameZh', 'nameEn', 'latitude', 'longitude', 'online', 'completeness', 'guideCompleteness', 'contentCompleteness', 'guideStatus', 'cnVisa', 'summary', 'flagUrl', 'currencyCode', 'languages', 'timeZone', 'phoneCode', 'recommendation', 'sortOrder'],
  cities: ['id', 'countryCode', 'code', 'nameZh', 'nameEn', 'latitude', 'longitude', 'sortOrder'],
  visa: ['id', 'passportRegion', 'destinationCountryCode', 'visaType', 'visaRequirement', 'title', 'corePolicy', 'maxStayDays',
    'passportRequired', 'passportValidityMonths', 'passportValidityRequirement', 'entrySummary', 'requirementText', 'feeAmount', 'feeCurrency',
    'feeNote', 'processingTime', 'notes', 'sourceName', 'sourceProvider', 'sourceUrl', 'retrievedAt'],
  'visa-requirements': ['id', 'visaPolicyId', 'title', 'description', 'required', 'sortOrder', ...mappingFields],
  transport: ['id', 'countryCode', 'cityCode', 'name', 'kind', 'description', 'paymentMethod', 'priceInfo', 'operatingHours', 'notes', 'sortOrder', ...mappingFields],
  packing: ['id', 'code', 'name', 'description', 'category', 'universal', 'sortOrder', ...mappingFields],
  'travel-apps': ['id', 'code', 'name', 'logoUrl', 'iosUrl', 'androidUrl', 'purpose', 'recommendation', ...mappingFields],
  tips: ['id', 'countryCode', 'cityCode', 'title', 'content', 'category', 'importance', 'sortOrder', ...mappingFields],
  attractions: ['id', 'countryCode', 'cityCode', 'nameZh', 'nameEn', 'description', 'latitude', 'longitude', 'coverUrl', 'visitMinutes', 'openingHours', 'ticketInfo', 'website', 'category', 'tags', 'recommendation', 'sortOrder', ...mappingFields],
  'country-guides': ['id', 'countryCode', 'category', 'title', 'subtitle', 'content', 'sortOrder', 'sourceKey', 'sourceProvider', 'sourceUrl',
    'sourceUpdatedAt', 'importedAt', 'contentHash'],
};
export function managedDto(entity: ManagedEntity, value: unknown): object {
  const row = record(value);
  return { ...pick(row, managedFields[entity]), status: row.status, version: row.version,
    draftPending: row.draftPending === true, updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    effectiveFrom: row.effectiveFrom instanceof Date ? row.effectiveFrom.toISOString() : row.effectiveFrom ?? null,
    effectiveTo: row.effectiveTo instanceof Date ? row.effectiveTo.toISOString() : row.effectiveTo ?? null,
    lastVerifiedAt: row.lastVerifiedAt instanceof Date ? row.lastVerifiedAt.toISOString() : row.lastVerifiedAt ?? null };
}
