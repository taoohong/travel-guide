import type {
  ContentModule,
  ContentStatus,
  PlanItemType,
  PlanScope,
  PlanSourceType,
  PlanStage,
  TripStatus,
  TripMemberRole,
  TripMemberStatus,
  VisaType,
  VisaRequirementType,
  CountryGuideSectionKey,
} from "@travel-guide/constants";

/** 日期字段使用 ISO 8601 字符串；持久化层自行转换。 */
export interface Trip {
  id: string;
  userId: string;
  title: string;
  status: TripStatus;
  startDate: string | null;
  endDate: string | null;
  notes?: string | null;
  travelers?: string[];
}

export interface TripMember {
  id: string;
  tripId: string;
  userId: string;
  role: TripMemberRole;
  status: TripMemberStatus;
  joinedAt: string | null;
  createdAt: string;
  user: { id: string; nickname: string; avatarUrl: string | null };
}

export interface TripInvitePreview {
  trip: Pick<Trip, "id" | "title" | "startDate" | "endDate"> & {
    destinations: Array<{ countryCode: string; countryName: string; cityCode: string | null; orderIndex: number }>;
  };
  owner: { nickname: string; avatarUrl: string | null };
  memberCount: number;
  expiresAt: string;
}

export interface TripDestination {
  id: string;
  tripId: string;
  countryCode: string;
  continentCode: string;
  cityCode: string | null;
  orderIndex: number;
  arrivalDate: string | null;
  departureDate: string | null;
  isOrigin: boolean;
}

export interface PlanMapping {
  actionable: boolean;
  targetStage: PlanStage;
  itemType: PlanItemType;
  scope: PlanScope;
  dedupeKey: string | null;
}

export interface PlanItem {
  id: string;
  tripId: string;
  stage: PlanStage;
  itemType: PlanItemType;
  scope: PlanScope;
  title: string;
  description: string | null;
  sourceType: PlanSourceType;
  sourceId: string | null;
  sourceCountryCode: string | null;
  dedupeKey: string | null;
  dedupeHash: string | null;
  sortOrder: number;
  done: boolean;
  doneAt: string | null;
  planDate: string | null;
  completionCount?: number;
  memberCount?: number;
  imageUrl?: string | null;
}

export interface VisaRequirement {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  sortOrder: number;
  planMapping: PlanMapping | null;
}

export interface PlanItemDraft {
  title: string;
  description: string | null;
  stage: PlanStage;
  itemType: PlanItemType;
  scope: PlanScope;
  sourceType: PlanSourceType;
  sourceId: string | null;
  sourceCountryCode: string | null;
  dedupeKey: string | null;
}

export interface ContentMetadata {
  version: number;
  status: ContentStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  lastVerifiedAt: string | null;
}

export interface VisaPolicy extends ContentMetadata {
  passportRegion: string;
  destinationCountryCode: string;
  visaType: VisaType;
  title: string;
  corePolicy: string[];
  maxStayDays: number | null;
  passportRequired: boolean | null;
  fee: { amount: number; currency: string; note?: string } | null;
  processingTime: string | null;
  requirements: VisaRequirement[];
  notes: string[];
  sourceName: string;
  sourceUrl: string | null;
  visaRequirement: VisaRequirementType;
  passportValidityMonths: number | null;
  passportValidityRequirement: string | null;
  entrySummary: string | null;
  requirementText: string | null;
  sourceProvider: string | null;
  retrievedAt: string | null;
}

export interface CountryGuideSection extends ContentMetadata {
  id: string;
  countryCode: string;
  sectionKey: CountryGuideSectionKey;
  title: string;
  content: string;
  sortOrder: number;
  sourceProvider: string;
  sourceUrl: string;
  sourceUpdatedAt: string | null;
  importedAt: string | null;
}

export interface Country extends ContentMetadata {
  code: string;
  continentCode: string;
  name: string;
  latitude: number;
  longitude: number;
  online: boolean;
  completeness: number;
}

export interface Attraction extends ContentMetadata {
  id: string;
  countryCode: string;
  cityCode: string | null;
  name: string;
  description: string | null;
  planMapping: PlanMapping | null;
}

export interface ContentVersion {
  module: ContentModule;
  version: number;
  changedByEntity: string | null;
  changedById: string | null;
}

/** GET /content/version 使用的逐模块版本快照。 */
export type ContentVersionSnapshot = Record<ContentModule, number>;

export interface ContentVersionDiff {
  diffs: Array<{
    module: ContentModule;
    local: number;
    server: number;
    changed: boolean;
  }>;
  changedModules: ContentModule[];
}

export type VisaMatchLevel = "exact" | "region-fallback" | "global-fallback" | "none";
