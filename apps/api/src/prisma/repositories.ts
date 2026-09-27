import { Injectable, Inject } from '@nestjs/common';
import { TRIP_INVITE_MAX_USES, TripStatus, UserAnchorType } from '@travel-guide/constants';
import {
  ContentModule, ContentStatus, CountryGuideSectionCategory, OperationAction, PlanItemType, PlanSourceType, Prisma, type AdminUser,
  type Country, type City, type Continent, type Trip, type TripDestination,
  type PlanItem, type MediaAsset, type ContentVersion,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { recordUserAnchors } from '../modules/user-anchors';

export const REPO = {
  continent: 'ContinentRepository', country: 'CountryRepository', city: 'CityRepository', visa: 'VisaRepository',
  content: 'ContentRepository', trip: 'TripRepository', plan: 'PlanRepository', version: 'ContentVersionRepository',
  media: 'MediaRepository', admin: 'AdminRepository', log: 'OperationLogRepository', health: 'HealthRepository',
  invite: 'TripInviteRepository', expense: 'TripExpenseRepository',
} as const;

export interface ContinentRepository { list(): Promise<Continent[]> }
export interface HealthRepository { ping(): Promise<boolean> }
export interface CountryRepository {
  list(input: { continentCode?: string; keyword?: string; page: number; pageSize: number }): Promise<{ items: Country[]; total: number }>;
  find(code: string): Promise<Country | null>;
  count(): Promise<{ total: number; online: number; averageCompleteness: number }>;
}
export interface CityRepository { list(countryCode: string): Promise<City[]> }
export type VisaRecord = Prisma.VisaPolicyGetPayload<{ include: { requirements: true } }>;
export type PlanCompletionRecord = { userId: string; completedAt: Date };
export type PlanItemRecord = PlanItem & { completions: PlanCompletionRecord[]; imageUrl?: string | null };
export type PlanItemUpdateData = Pick<Prisma.PlanItemUpdateInput, 'title' | 'description' | 'sortOrder' | 'planDate'> &
  { done?: boolean; doneAt?: Date | null };
export interface VisaRepository {
  candidates(passportRegion: string, countryCode: string): Promise<VisaRecord[]>;
  list(): Promise<VisaRecord[]>;
  findPair(passportRegion: string, countryCode: string): Promise<VisaRecord | null>;
  findById(id: string): Promise<VisaRecord | null>;
}
export interface ContentRepository {
  guides(countryCode: string, kind: GuideKind, cityCode?: string): Promise<unknown[]>;
  countryGuideHealth(countryCodes: string[]): Promise<Record<string, { guideCompleteness: number; contentCompleteness: number;
    guideStatus: Record<string, boolean>; cnVisa: boolean }>>;
  attraction(id: string): Promise<unknown | null>;
  health(): Promise<{ noAttractions: number; noTransport: number; missingVisa: number; guideCompleteness: number }>;
  listManaged(entity: ManagedEntity, page: number, pageSize: number, filters?: ManagedFilters): Promise<{ items: unknown[]; total: number }>;
  getManaged(entity: ManagedEntity, id: string): Promise<unknown | null>;
  mutate(input: ContentMutation): Promise<unknown>;
  link(input: LinkMutation): Promise<unknown | null>;
  listLinks(kind: LinkKind, parent: string): Promise<unknown[]>;
  reorderLink(kind: LinkKind, id: string, sortOrder: number, adminId: string, requestId: string): Promise<unknown | null>;
}
export type GuideKind = 'transport' | 'packing' | 'tips' | 'apps' | 'attractions';
export type ManagedEntity = 'continents' | 'countries' | 'cities' | 'visa' | 'visa-requirements' |
  'transport' | 'packing' | 'travel-apps' | 'tips' | 'attractions' | 'country-guides';
export interface ManagedFilters {
  keyword?: string; continentCode?: string; countryCode?: string; cityCode?: string; online?: boolean;
  status?: ContentStatus; passportRegion?: string; destinationCountryCode?: string; visaType?: string;
  stale?: boolean; category?: string; tag?: string; visaPolicyId?: string; sort?: 'updatedAt' | 'completeness';
}
export interface ContentMutation {
  entity: ManagedEntity; action: 'create' | 'update' | 'archive' | 'publish' | 'unpublish'; id?: string;
  data: Record<string, unknown>; adminId: string; requestId: string;
}
export type LinkKind = 'country-packing' | 'country-apps' | 'attraction-images' | 'country-media';
export interface LinkMutation {
  kind: LinkKind; action: 'create' | 'delete'; id?: string; data: Record<string, unknown>;
  adminId: string; requestId: string;
}
export interface TripRepository {
  create(data: Prisma.TripUncheckedCreateInput): Promise<Trip>;
  delete(tripId: string): Promise<void>;
  list(userId: string, page: number, pageSize: number): Promise<{ items: Trip[]; total: number }>;
  find(id: string): Promise<(Trip & { destinations: TripDestination[]; planItems: PlanItemRecord[] }) | null>;
  update(id: string, data: Prisma.TripUpdateInput): Promise<Trip>;
  addDestination(data: Prisma.TripDestinationUncheckedCreateInput): Promise<TripDestination>;
  removeDestination(tripId: string, destinationId: string): Promise<boolean>;
  country(code: string): Promise<Country | null>;
  membership(tripId: string, userId: string): Promise<{ role: 'OWNER' | 'MEMBER'; status: 'ACTIVE' | 'LEFT' } | null>;
  members(tripId: string): Promise<Array<{ userId: string; nickname: string; avatarUrl: string | null; role: 'OWNER' | 'MEMBER'; joinedAt: Date }>>;
  joinMember(tripId: string, userId: string): Promise<void>;
  leaveMember(tripId: string, userId: string): Promise<boolean>;
  removeMember(tripId: string, userId: string): Promise<boolean>;
}
export interface TripInvitePreviewRecord {
  id: string; tripId: string; createdByUserId: string; expiresAt: Date; maxUses: number; useCount: number;
  revokedAt: Date | null; title: string; startDate: Date | null; endDate: Date | null;
  owner: { nickname: string; avatarUrl: string | null };
  destinations: Array<{ countryCode: string; countryName: string; cityCode: string | null; orderIndex: number }>;
  memberCount: number;
}
export type InviteJoinResult = { kind: 'joined'; tripId: string; alreadyJoined: boolean } |
  { kind: 'not-found' } | { kind: 'expired' } | { kind: 'revoked' } | { kind: 'exhausted' };
export interface TripInviteRepository {
  create(data: { tripId: string; createdByUserId: string; tokenHash: string; expiresAt: Date; maxUses: number }): Promise<void>;
  preview(tokenHash: string): Promise<TripInvitePreviewRecord | null>;
  join(tokenHash: string, userId: string, now: Date): Promise<InviteJoinResult>;
  revokeActive(tripId: string, now: Date): Promise<number>;
}
export interface PlanRepository {
  list(tripId: string): Promise<PlanItemRecord[]>;
  findByHash(tripId: string, hash: string): Promise<PlanItemRecord | null>;
  create(data: Prisma.PlanItemUncheckedCreateInput, userId: string): Promise<PlanItemRecord>;
  update(tripId: string, id: string, userId: string, data: PlanItemUpdateData): Promise<PlanItemRecord | null>;
  remove(tripId: string, id: string): Promise<PlanItemRecord | null>;
}
export type ExpenseRecord = Prisma.TripExpenseGetPayload<{ include: { payer: { select: { nickname: true } } } }>;
export interface TripExpenseRepository {
  list(tripId: string): Promise<ExpenseRecord[]>;
  find(tripId: string, id: string): Promise<ExpenseRecord | null>;
  create(data: Prisma.TripExpenseUncheckedCreateInput): Promise<ExpenseRecord>;
  remove(tripId: string, id: string): Promise<boolean>;
}
export interface ContentVersionRepository { all(): Promise<ContentVersion[]> }
export interface MediaRepository {
  create(data: Prisma.MediaAssetCreateInput): Promise<MediaAsset>;
  list(page: number, pageSize: number, usage?: string, keyword?: string): Promise<{ items: MediaAsset[]; total: number }>;
}
export interface AdminRepository { find(username: string): Promise<AdminUser | null>; findById(id: string): Promise<AdminUser | null> }
export interface OperationLogRepository {
  create(data: Prisma.OperationLogUncheckedCreateInput): Promise<void>;
  list(page: number, pageSize: number, filters?: { adminUserId?: string; action?: string; targetType?: string;
    from?: Date; to?: Date }): Promise<{ items: unknown[]; total: number }>;
}

function activeContent(): { status: ContentStatus; AND: Array<{ OR: Array<Record<string, unknown>> }> } {
  const now = new Date();
  return { status: ContentStatus.PUBLISHED, AND: [
    { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
    { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
  ] };
}

async function withPlanImages(db: Pick<PrismaService, 'attraction'>, items: PlanItemRecord[]): Promise<PlanItemRecord[]> {
  const ids = [...new Set(items.filter((item) => item.itemType === PlanItemType.ATTRACTION &&
    item.sourceType === PlanSourceType.ATTRACTION && item.sourceId).map((item) => item.sourceId!))];
  if (!ids.length) return items;
  const attractions = await db.attraction.findMany({ where: { id: { in: ids } }, select: { id: true, coverUrl: true } });
  const covers = new Map(attractions.map((item) => [item.id, item.coverUrl]));
  return items.map((item) => ({ ...item, imageUrl: item.itemType === PlanItemType.ATTRACTION &&
    item.sourceType === PlanSourceType.ATTRACTION && item.sourceId ? covers.get(item.sourceId) ?? null : null }));
}

@Injectable()
export class PrismaHealthRepository implements HealthRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async ping(): Promise<boolean> { try { await this.db.$queryRaw`SELECT 1`; return true; } catch { return false; } }
}

@Injectable()
export class PrismaContinentRepository implements ContinentRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  list(): Promise<Continent[]> { return this.db.continent.findMany({ where: activeContent(), orderBy: { sortOrder: 'asc' } }); }
}

@Injectable()
export class PrismaCountryRepository implements CountryRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async list(input: { continentCode?: string; keyword?: string; page: number; pageSize: number }): Promise<{ items: Country[]; total: number }> {
    const where: Prisma.CountryWhereInput = { ...activeContent(),
      ...(input.continentCode ? { continentCode: input.continentCode } : {}),
      ...(input.keyword ? { OR: [{ nameZh: { contains: input.keyword } }, { nameEn: { contains: input.keyword, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await this.db.$transaction([
      this.db.country.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
      this.db.country.count({ where }),
    ]);
    return { items, total };
  }
  find(code: string): Promise<Country | null> { return this.db.country.findFirst({ where: { code, ...activeContent() } }); }
  async count(): Promise<{ total: number; online: number; averageCompleteness: number }> {
    const [total, online, aggregate] = await this.db.$transaction([this.db.country.count(), this.db.country.count({ where: { online: true } }),
      this.db.country.aggregate({ _avg: { completeness: true } })]);
    return { total, online, averageCompleteness: Math.round(aggregate._avg.completeness ?? 0) };
  }
}

@Injectable()
export class PrismaCityRepository implements CityRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  list(countryCode: string): Promise<City[]> { return this.db.city.findMany({ where: { countryCode, ...activeContent() }, orderBy: { sortOrder: 'asc' } }); }
}

@Injectable()
export class PrismaVisaRepository implements VisaRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  candidates(passportRegion: string, countryCode: string): Promise<VisaRecord[]> {
    return this.db.visaPolicy.findMany({ where: { ...activeContent(),
      OR: [
        { passportRegion, destinationCountryCode: countryCode },
        { passportRegion, destinationCountryCode: '*' },
        { passportRegion: '*', destinationCountryCode: countryCode },
      ] }, include: { requirements: { where: activeContent(), orderBy: { sortOrder: 'asc' } } } });
  }
  list(): Promise<VisaRecord[]> { return this.db.visaPolicy.findMany({ include: { requirements: true }, orderBy: { updatedAt: 'desc' } }); }
  findPair(passportRegion: string, countryCode: string): Promise<VisaRecord | null> {
    return this.db.visaPolicy.findUnique({ where: { passportRegion_destinationCountryCode: {
      passportRegion, destinationCountryCode: countryCode } }, include: { requirements: true } });
  }
  findById(id: string): Promise<VisaRecord | null> {
    return this.db.visaPolicy.findUnique({ where: { id }, include: { requirements: true } });
  }
}

@Injectable()
export class PrismaTripRepository implements TripRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  create(data: Prisma.TripUncheckedCreateInput): Promise<Trip> {
    return this.db.$transaction(async (tx) => {
      const trip = await tx.trip.create({ data });
      await tx.tripMember.create({ data: { tripId: trip.id, userId: trip.userId, role: 'OWNER' } });
      await recordUserAnchors(tx, [trip.userId], UserAnchorType.FIRST_TRIP_CREATED, trip.id);
      return trip;
    });
  }
  async list(userId: string, page: number, pageSize: number): Promise<{ items: Trip[]; total: number }> {
    const where: Prisma.TripWhereInput = { members: { some: { userId, status: 'ACTIVE' } } };
    const [items, total] = await this.db.$transaction([
      this.db.trip.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.db.trip.count({ where }),
    ]);
    return { items, total };
  }
  async find(id: string): Promise<(Trip & { destinations: TripDestination[]; planItems: PlanItemRecord[] }) | null> {
    const trip = await this.db.trip.findUnique({ where: { id }, include: { destinations: { orderBy: { orderIndex: 'asc' } },
      planItems: { include: { completions: { select: { userId: true, completedAt: true } } } } } });
    return trip ? { ...trip, planItems: await withPlanImages(this.db, trip.planItems) } : null;
  }
  update(id: string, data: Prisma.TripUpdateInput): Promise<Trip> {
    const anchorType = data.status === TripStatus.TRAVELING ? UserAnchorType.FIRST_TRIP_STARTED :
      data.status === TripStatus.COMPLETED ? UserAnchorType.FIRST_TRIP_COMPLETED : null;
    if (!anchorType) return this.db.trip.update({ where: { id }, data });
    return this.db.$transaction(async (tx) => {
      const trip = await tx.trip.update({ where: { id }, data });
      await recordUserAnchors(tx, [trip.userId], anchorType, trip.id);
      return trip;
    });
  }
  async delete(tripId: string): Promise<void> { await this.db.trip.delete({ where: { id: tripId } }); }
  country(code: string): Promise<Country | null> { return this.db.country.findUnique({ where: { code } }); }
  async membership(tripId: string, userId: string): Promise<{ role: 'OWNER' | 'MEMBER'; status: 'ACTIVE' | 'LEFT' } | null> {
    const member = await this.db.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { role: true, status: true } });
    return member ? { role: member.role, status: member.status } : null;
  }
  async members(tripId: string): Promise<Array<{ userId: string; nickname: string; avatarUrl: string | null; role: 'OWNER' | 'MEMBER'; joinedAt: Date }>> {
    const rows = await this.db.tripMember.findMany({ where: { tripId, status: 'ACTIVE' }, orderBy: { joinedAt: 'asc' },
      select: { userId: true, role: true, joinedAt: true, user: { select: { nickname: true, avatarUrl: true } } } });
    return rows.map(({ user, ...row }) => ({ ...row, ...user }));
  }
  async joinMember(tripId: string, userId: string): Promise<void> {
    await this.db.tripMember.upsert({ where: { tripId_userId: { tripId, userId } },
      create: { tripId, userId, role: 'MEMBER', status: 'ACTIVE' }, update: { role: 'MEMBER', status: 'ACTIVE', joinedAt: new Date() } });
  }
  async leaveMember(tripId: string, userId: string): Promise<boolean> {
    const result = await this.db.tripMember.updateMany({ where: { tripId, userId, role: 'MEMBER', status: 'ACTIVE' }, data: { status: 'LEFT' } });
    return result.count > 0;
  }
  async removeMember(tripId: string, userId: string): Promise<boolean> {
    const result = await this.db.tripMember.updateMany({ where: { tripId, userId, role: 'MEMBER', status: 'ACTIVE' }, data: { status: 'LEFT' } });
    return result.count > 0;
  }
  async addDestination(data: Prisma.TripDestinationUncheckedCreateInput): Promise<TripDestination> {
    return this.db.$transaction(async (tx) => {
      const last = await tx.tripDestination.aggregate({ where: { tripId: data.tripId }, _max: { orderIndex: true } });
      return tx.tripDestination.create({ data: { ...data, orderIndex: (last._max.orderIndex ?? -1) + 1 } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async removeDestination(tripId: string, destinationId: string): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const target = await tx.tripDestination.findFirst({ where: { id: destinationId, tripId } });
      if (!target) return false;
      await tx.tripDestination.delete({ where: { id: destinationId } });
      const later = await tx.tripDestination.findMany({ where: { tripId, orderIndex: { gt: target.orderIndex } }, orderBy: { orderIndex: 'asc' } });
      for (const destination of later) await tx.tripDestination.update({ where: { id: destination.id }, data: { orderIndex: destination.orderIndex - 1 } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

@Injectable()
export class PrismaTripInviteRepository implements TripInviteRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async create(data: { tripId: string; createdByUserId: string; tokenHash: string; expiresAt: Date; maxUses: number }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.tripInvite.updateMany({ where: { tripId: data.tripId, revokedAt: null, expiresAt: { gt: new Date() }, useCount: { lt: TRIP_INVITE_MAX_USES } }, data: { revokedAt: new Date() } });
      await tx.tripInvite.create({ data });
    });
  }
  async preview(tokenHash: string): Promise<TripInvitePreviewRecord | null> {
    const row = await this.db.tripInvite.findUnique({ where: { tokenHash }, include: {
      trip: { include: { user: { select: { nickname: true, avatarUrl: true } },
        destinations: { orderBy: { orderIndex: 'asc' }, include: { country: { select: { nameZh: true } } } },
        members: { where: { status: 'ACTIVE' }, select: { id: true } } } },
    } });
    return row ? { id: row.id, tripId: row.tripId, createdByUserId: row.createdByUserId, expiresAt: row.expiresAt,
      maxUses: row.maxUses, useCount: row.useCount, revokedAt: row.revokedAt, title: row.trip.title,
      startDate: row.trip.startDate, endDate: row.trip.endDate, owner: row.trip.user,
      destinations: row.trip.destinations.map((destination) => ({ countryCode: destination.countryCode,
        countryName: destination.country.nameZh, cityCode: destination.cityCode, orderIndex: destination.orderIndex })),
      memberCount: row.trip.members.length } : null;
  }
  async join(tokenHash: string, userId: string, now: Date): Promise<InviteJoinResult> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "TripInvite" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
        const invite = await tx.tripInvite.findUnique({ where: { tokenHash } });
        if (!invite) return { kind: 'not-found' };
        const current = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId: invite.tripId, userId } } });
        if (current?.status === 'ACTIVE') return { kind: 'joined', tripId: invite.tripId, alreadyJoined: true };
        if (invite.revokedAt) return { kind: 'revoked' };
        if (invite.expiresAt <= now) return { kind: 'expired' };
        if (invite.useCount >= invite.maxUses) return { kind: 'exhausted' };
        await tx.tripInvite.update({ where: { id: invite.id }, data: { useCount: { increment: 1 } } });
        if (current) await tx.tripMember.update({ where: { id: current.id }, data: { status: 'ACTIVE', role: 'MEMBER', joinedAt: now } });
        else await tx.tripMember.create({ data: { tripId: invite.tripId, userId, role: 'MEMBER', status: 'ACTIVE', joinedAt: now } });
        const members = await tx.tripMember.findMany({ where: { tripId: invite.tripId, status: 'ACTIVE' }, select: { userId: true } });
        if (members.length > 1) await recordUserAnchors(tx, members.map((member) => member.userId), UserAnchorType.FIRST_TEAMED_UP, invite.tripId);
        return { kind: 'joined', tripId: invite.tripId, alreadyJoined: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const member = await this.db.tripMember.findFirst({ where: { userId, status: 'ACTIVE', trip: { invites: { some: { tokenHash } } } } });
        if (member) return { kind: 'joined', tripId: member.tripId, alreadyJoined: true };
      }
      throw error;
    }
  }
  async revokeActive(tripId: string, now: Date): Promise<number> {
    const result = await this.db.tripInvite.updateMany({ where: { tripId, revokedAt: null }, data: { revokedAt: now } });
    return result.count;
  }
}

@Injectable()
export class PrismaPlanRepository implements PlanRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  private readonly include = { completions: { select: { userId: true, completedAt: true } } } satisfies Prisma.PlanItemInclude;
  async list(tripId: string): Promise<PlanItemRecord[]> {
    const items = await this.db.planItem.findMany({ where: { tripId }, orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }], include: this.include });
    return withPlanImages(this.db, items);
  }
  async findByHash(tripId: string, hash: string): Promise<PlanItemRecord | null> {
    const item = await this.db.planItem.findUnique({ where: { tripId_dedupeHash: { tripId, dedupeHash: hash } }, include: this.include });
    return item ? (await withPlanImages(this.db, [item]))[0]! : null;
  }
  create(data: Prisma.PlanItemUncheckedCreateInput, userId: string): Promise<PlanItemRecord> {
    const { done, doneAt, ...planData } = data;
    return this.db.$transaction(async (tx) => {
      const row = await tx.planItem.create({ data: { ...planData, done: false, doneAt: null } });
      if (done) await tx.planItemCompletion.create({ data: { planItemId: row.id, userId, completedAt: doneAt ?? new Date() } });
      const item = await tx.planItem.findUniqueOrThrow({ where: { id: row.id }, include: this.include });
      return (await withPlanImages(tx, [item]))[0]!;
    });
  }
  async update(tripId: string, id: string, userId: string, data: PlanItemUpdateData): Promise<PlanItemRecord | null> {
    const { done, doneAt, ...planData } = data;
    return this.db.$transaction(async (tx) => {
      const existing = await tx.planItem.findFirst({ where: { id, tripId } });
      if (!existing) return null;
      if (done === true) await tx.planItemCompletion.upsert({
        where: { planItemId_userId: { planItemId: id, userId } },
        create: { planItemId: id, userId, completedAt: doneAt ?? new Date() }, update: { completedAt: doneAt ?? new Date() },
      });
      else if (done === false) await tx.planItemCompletion.deleteMany({ where: { planItemId: id, userId } });
      if (Object.values(planData).some((value) => value !== undefined)) await tx.planItem.update({ where: { id }, data: planData });
      const item = await tx.planItem.findUnique({ where: { id }, include: this.include });
      return item ? (await withPlanImages(tx, [item]))[0]! : null;
    });
  }
  async remove(tripId: string, id: string): Promise<PlanItemRecord | null> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.planItem.findFirst({ where: { id, tripId }, include: this.include });
      if (!existing) return null;
      await tx.planItem.delete({ where: { id } });
      return (await withPlanImages(tx, [existing]))[0]!;
    });
  }
}

@Injectable()
export class PrismaTripExpenseRepository implements TripExpenseRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  list(tripId: string): Promise<ExpenseRecord[]> {
    return this.db.tripExpense.findMany({ where: { tripId }, include: { payer: { select: { nickname: true } } }, orderBy: { createdAt: 'desc' } });
  }
  find(tripId: string, id: string): Promise<ExpenseRecord | null> {
    return this.db.tripExpense.findFirst({ where: { tripId, id }, include: { payer: { select: { nickname: true } } } });
  }
  create(data: Prisma.TripExpenseUncheckedCreateInput): Promise<ExpenseRecord> {
    return this.db.tripExpense.create({ data, include: { payer: { select: { nickname: true } } } });
  }
  async remove(tripId: string, id: string): Promise<boolean> {
    const result = await this.db.tripExpense.deleteMany({ where: { tripId, id } });
    return result.count > 0;
  }
}

@Injectable()
export class PrismaContentVersionRepository implements ContentVersionRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  all(): Promise<ContentVersion[]> { return this.db.contentVersion.findMany(); }
}

@Injectable()
export class PrismaMediaRepository implements MediaRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  create(data: Prisma.MediaAssetCreateInput): Promise<MediaAsset> { return this.db.mediaAsset.create({ data }); }
  async list(page: number, pageSize: number, usage?: string, keyword?: string): Promise<{ items: MediaAsset[]; total: number }> {
    const where: Prisma.MediaAssetWhereInput = { ...(usage ? { usage: usage as Prisma.EnumMediaUsageFilter['equals'] } : {}),
      ...(keyword ? { OR: [{ path: { contains: keyword, mode: 'insensitive' } }, { url: { contains: keyword, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await this.db.$transaction([
      this.db.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.db.mediaAsset.count({ where }),
    ]);
    return { items, total };
  }
}

@Injectable()
export class PrismaAdminRepository implements AdminRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  find(username: string): Promise<AdminUser | null> { return this.db.adminUser.findUnique({ where: { username } }); }
  findById(id: string): Promise<AdminUser | null> { return this.db.adminUser.findUnique({ where: { id } }); }
}

@Injectable()
export class PrismaOperationLogRepository implements OperationLogRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async create(data: Prisma.OperationLogUncheckedCreateInput): Promise<void> { await this.db.operationLog.create({ data }); }
  async list(page: number, pageSize: number, filters: { adminUserId?: string; action?: string; targetType?: string;
    from?: Date; to?: Date } = {}): Promise<{ items: unknown[]; total: number }> {
    const where: Prisma.OperationLogWhereInput = {
      ...(filters.adminUserId ? { adminUserId: filters.adminUserId } : {}),
      ...(filters.action ? { action: filters.action as OperationAction } : {}),
      ...(filters.targetType ? { targetType: filters.targetType } : {}),
      ...(filters.from || filters.to ? { createdAt: { gte: filters.from, lte: filters.to } } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.operationLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, action: true, targetType: true, targetId: true, targetLabel: true, changes: true, requestId: true, adminUserId: true, createdAt: true } }),
      this.db.operationLog.count({ where }),
    ]);
    return { items, total };
  }
}

type Delegate = {
  findMany(args: Record<string, unknown>): Promise<unknown[]>;
  count(args: Record<string, unknown>): Promise<number>;
  findUnique(args: Record<string, unknown>): Promise<unknown | null>;
  create(args: Record<string, unknown>): Promise<unknown>;
  update(args: Record<string, unknown>): Promise<unknown>;
};

function delegate(db: Prisma.TransactionClient | PrismaService, entity: ManagedEntity): Delegate {
  const model = entity === 'continents' ? db.continent : entity === 'countries' ? db.country :
    entity === 'cities' ? db.city : entity === 'visa' ? db.visaPolicy :
    entity === 'visa-requirements' ? db.visaRequirement : entity === 'country-guides' ? db.countryGuideSection : entity === 'transport' ? db.transportOption :
    entity === 'packing' ? db.packingItem : entity === 'travel-apps' ? db.travelApp :
    entity === 'tips' ? db.travelTip : db.attraction;
  return model as unknown as Delegate;
}

export const contentModule: Record<ManagedEntity, ContentModule> = {
  continents: ContentModule.country, countries: ContentModule.country, cities: ContentModule.city,
  'country-guides': ContentModule.countryGuide,
  visa: ContentModule.visa, 'visa-requirements': ContentModule.visa, transport: ContentModule.transport,
  packing: ContentModule.packing, 'travel-apps': ContentModule.country, tips: ContentModule.travelTip,
  attractions: ContentModule.attraction,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

const ignoredChanges = new Set(['createdAt', 'updatedAt', 'version', 'id']);
export function computeChanges(before: unknown, after: unknown): Array<{ field: string; before: unknown; after: unknown }> {
  const old = record(before);
  const next = record(after);
  return Object.keys(next).filter((field) => !ignoredChanges.has(field) && JSON.stringify(old[field]) !== JSON.stringify(next[field]))
    .map((field) => ({ field, before: old[field] ?? null, after: next[field] ?? null }));
}

@Injectable()
export class PrismaContentRepository implements ContentRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async guides(countryCode: string, kind: GuideKind, cityCode?: string): Promise<unknown[]> {
    const where = { countryCode, ...activeContent() };
    if (kind === 'transport') return this.db.transportOption.findMany({ where: { ...where, ...(cityCode ? { cityCode } : {}) }, orderBy: { sortOrder: 'asc' } });
    if (kind === 'tips') return this.db.travelTip.findMany({ where: { ...where, ...(cityCode ? { cityCode } : {}) }, orderBy: { sortOrder: 'asc' } });
    if (kind === 'attractions') return this.db.attraction.findMany({ where: { ...where, ...(cityCode ? { cityCode } : {}) }, include: { images: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } });
    if (kind === 'packing') return this.db.countryPacking.findMany({ where: { countryCode, packingItem: activeContent() }, include: { packingItem: true }, orderBy: { sortOrder: 'asc' } });
    return this.db.countryTravelApp.findMany({ where: { countryCode, ...(cityCode ? { cityCode } : {}), travelApp: activeContent() }, include: { travelApp: true }, orderBy: { sortOrder: 'asc' } });
  }
  async countryGuideHealth(countryCodes: string[]): Promise<Record<string, { guideCompleteness: number; contentCompleteness: number;
    guideStatus: Record<string, boolean>; cnVisa: boolean }>> {
    if (!countryCodes.length) return {};
    const categories = Object.values(CountryGuideSectionCategory);
    const [sections, visas] = await Promise.all([
      this.db.countryGuideSection.findMany({ where: { countryCode: { in: countryCodes }, status: ContentStatus.PUBLISHED },
        select: { countryCode: true, category: true } }),
      this.db.visaPolicy.findMany({ where: { passportRegion: 'CN', destinationCountryCode: { in: countryCodes }, status: ContentStatus.PUBLISHED },
        select: { destinationCountryCode: true } }),
    ]);
    const published = new Map<string, Set<string>>();
    for (const row of sections) {
      const values = published.get(row.countryCode) ?? new Set<string>();
      values.add(row.category);
      published.set(row.countryCode, values);
    }
    const visasByCountry = new Set(visas.map((row) => row.destinationCountryCode));
    return Object.fromEntries(countryCodes.map((code) => {
      const sections = published.get(code) ?? new Set<string>();
      const guideStatus = Object.fromEntries(categories.map((category) => [category, sections.has(category)]));
      const count = sections.size;
      const cnVisa = visasByCountry.has(code);
      const completeness = Math.round((count + Number(cnVisa)) * 100 / (categories.length + 1));
      return [code, { guideStatus, cnVisa, guideCompleteness: completeness, contentCompleteness: completeness }];
    }));
  }
  attraction(id: string): Promise<unknown | null> { return this.db.attraction.findFirst({ where: { id, ...activeContent() }, include: { images: true } }); }
  async health(): Promise<{ noAttractions: number; noTransport: number; missingVisa: number; guideCompleteness: number }> {
    const countries = await this.db.country.findMany({ where: { online: true }, select: { code: true } });
    const [attractions, transport, guideHealth] = await Promise.all([
      this.db.attraction.findMany({ where: { status: ContentStatus.PUBLISHED }, select: { countryCode: true } }),
      this.db.transportOption.findMany({ where: { status: ContentStatus.PUBLISHED }, select: { countryCode: true } }),
      this.countryGuideHealth(countries.map((country) => country.code)),
    ]);
    const hasAttractions = new Set(attractions.map((item) => item.countryCode));
    const hasTransport = new Set(transport.map((item) => item.countryCode));
    const healthRows = Object.values(guideHealth);
    return { noAttractions: countries.filter((item) => !hasAttractions.has(item.code)).length,
      noTransport: countries.filter((item) => !hasTransport.has(item.code)).length,
      missingVisa: countries.filter((item) => !guideHealth[item.code]?.cnVisa).length,
      guideCompleteness: healthRows.length ? Math.round(healthRows.reduce((sum, item) => sum + item.guideCompleteness, 0) / healthRows.length) : 0 };
  }
  async listManaged(entity: ManagedEntity, page: number, pageSize: number, filters: ManagedFilters = {}): Promise<{ items: unknown[]; total: number }> {
    const model = delegate(this.db, entity);
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (entity === 'countries') {
      if (filters.continentCode) where.continentCode = filters.continentCode;
      if (filters.online !== undefined) where.online = filters.online;
    }
    if (['cities', 'transport', 'tips', 'attractions', 'country-guides'].includes(entity) && filters.countryCode) where.countryCode = filters.countryCode;
    if (['transport', 'tips', 'attractions'].includes(entity) && filters.cityCode) where.cityCode = filters.cityCode;
    if (entity === 'visa') {
      if (filters.passportRegion) where.passportRegion = filters.passportRegion;
      if (filters.destinationCountryCode) where.destinationCountryCode = filters.destinationCountryCode;
      if (filters.visaType) where.visaType = filters.visaType;
      if (filters.stale) where.OR = [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: new Date(Date.now() - 90 * 86_400_000) } }];
    }
    if (entity === 'visa-requirements' && filters.visaPolicyId) where.visaPolicyId = filters.visaPolicyId;
    if (['tips', 'attractions', 'country-guides'].includes(entity) && filters.category) where.category = filters.category;
    if (entity === 'attractions' && filters.tag) where.tags = { has: filters.tag };
    if (filters.keyword) {
      const fields = entity === 'countries' || entity === 'continents' || entity === 'cities' || entity === 'attractions' ? ['nameZh', 'nameEn'] :
        entity === 'packing' || entity === 'travel-apps' ? ['name', 'code'] : entity === 'transport' ? ['name'] : ['title'];
      where.AND = [{ OR: fields.map((field) => ({ [field]: { contains: filters.keyword, mode: 'insensitive' } })) }];
    }
    const orderBy = entity === 'countries' && filters.sort === 'completeness' ? { completeness: 'asc' } : { updatedAt: 'desc' };
    const [items, total] = await Promise.all([
      model.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }), model.count({ where }),
    ]);
    const ids = items.map((item) => { const row = record(item); return String(row.id ?? row.code); });
    const drafts = await this.db.contentRevision.findMany({ where: { entityType: entity, version: 0, entityId: { in: ids } },
      select: { entityId: true } });
    const pending = new Set(drafts.map((draft) => draft.entityId));
    const guideHealth = entity === 'countries' ? await this.countryGuideHealth(ids) : {};
    return { items: items.map((item) => {
      const row = record(item);
      const key = String(row.id ?? row.code);
      return { ...row, ...(guideHealth[key] ?? {}), draftPending: pending.has(key) };
    }), total };
  }
  async getManaged(entity: ManagedEntity, id: string): Promise<unknown | null> {
    const where = entity === 'continents' || entity === 'countries' ? { code: id } : { id };
    const row = await delegate(this.db, entity).findUnique({ where });
    if (!row) return null;
    const draft = await this.db.contentRevision.findFirst({ where: { entityType: entity, entityId: id, version: 0 },
      orderBy: { createdAt: 'desc' } });
    return draft ? { ...record(row), ...record(draft.after), draftPending: true } : row;
  }
  mutate(input: ContentMutation): Promise<unknown> {
    return this.db.$transaction(async (tx) => {
      const model = delegate(tx, input.entity);
      const where = input.entity === 'continents' || input.entity === 'countries' ? { code: input.id } : { id: input.id };
      const before = input.action === 'create' ? null : await model.findUnique({ where });
      if (input.action !== 'create' && !before) return null;
      const previous = record(before);
      const targetIdBefore = String(previous.id ?? previous.code ?? '');
      const module = contentModule[input.entity];
      const draft = input.action === 'create' ? null : await tx.contentRevision.findFirst({
        where: { entityType: input.entity, entityId: targetIdBefore, version: 0 }, orderBy: { createdAt: 'desc' } });
      if (input.action === 'update' && previous.status === ContentStatus.PUBLISHED) {
        const patch = { ...record(draft?.after), ...input.data };
        const changes = computeChanges(before, { ...previous, ...patch });
        const data = { after: JSON.parse(JSON.stringify(patch)) as Prisma.InputJsonValue,
          changedFields: changes as Prisma.InputJsonValue, adminUserId: input.adminId };
        if (draft) await tx.contentRevision.update({ where: { id: draft.id }, data });
        else await tx.contentRevision.create({ data: { module, entityType: input.entity, entityId: targetIdBefore,
          version: 0, before: JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue, ...data } });
        await tx.operationLog.create({ data: { action: OperationAction.UPDATE, targetType: input.entity,
          targetId: targetIdBefore, targetLabel: String(previous.title ?? previous.nameZh ?? previous.name ?? previous.code ?? targetIdBefore),
          changes: changes as Prisma.InputJsonValue, requestId: input.requestId, adminUserId: input.adminId } });
        if ((input.entity === 'visa' || input.entity === 'country-guides') && changes.length) {
          await tx.contentVersion.upsert({ where: { module }, create: { module, version: 1, changedByEntity: input.entity, changedById: targetIdBefore },
            update: { version: { increment: 1 }, changedByEntity: input.entity, changedById: targetIdBefore } });
        }
        return { ...previous, ...patch, draftPending: true };
      }
      const data = input.action === 'archive' ? { status: ContentStatus.ARCHIVED, version: { increment: 1 } } :
        input.action === 'unpublish' ? { status: ContentStatus.DRAFT, version: { increment: 1 } } :
        input.action === 'publish' ? { ...record(draft?.after), ...input.data, status: ContentStatus.PUBLISHED, version: { increment: 1 } } :
        input.action === 'update' ? { ...input.data, version: { increment: 1 } } : input.data;
      const after = input.action === 'create' ? await model.create({ data }) : await model.update({ where, data });
      const object = record(after);
      const targetId = String(object.id ?? object.code ?? '');
      if (draft) await tx.contentRevision.delete({ where: { id: draft.id } });
      const changes = computeChanges(before, after);
      if (input.action === 'publish' || (input.action === 'update' && (input.entity === 'visa' || input.entity === 'country-guides') && changes.length > 0) ||
        (previous.status === ContentStatus.PUBLISHED &&
        (input.action === 'archive' || input.action === 'unpublish'))) {
        await tx.contentVersion.upsert({ where: { module }, create: { module, version: 1, changedByEntity: input.entity, changedById: targetId },
          update: { version: { increment: 1 }, changedByEntity: input.entity, changedById: targetId } });
      }
      const action = input.action === 'archive' ? OperationAction.DELETE : input.action === 'publish' ? OperationAction.PUBLISH :
        input.action === 'unpublish' ? OperationAction.UNPUBLISH :
        input.action === 'create' ? OperationAction.CREATE : OperationAction.UPDATE;
      await tx.operationLog.create({ data: { action, targetType: input.entity, targetId, targetLabel: String(object.title ?? object.nameZh ?? object.name ?? object.code ?? targetId),
        changes: changes as Prisma.InputJsonValue, requestId: input.requestId, adminUserId: input.adminId } });
      await tx.contentRevision.create({ data: { module, entityType: input.entity, entityId: targetId,
        version: typeof object.version === 'number' ? object.version : 1,
        before: before ? JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue : Prisma.JsonNull,
        after: JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue,
        changedFields: changes as Prisma.InputJsonValue, adminUserId: input.adminId } });
      return after;
    });
  }
  link(input: LinkMutation): Promise<unknown | null> {
    return this.db.$transaction(async (tx) => {
      const before = input.action === 'delete' ? input.kind === 'country-packing' ?
        await tx.countryPacking.findUnique({ where: { id: input.id } }) : input.kind === 'country-apps' ?
          await tx.countryTravelApp.findUnique({ where: { id: input.id } }) : input.kind === 'country-media' ?
            await tx.countryMedia.findUnique({ where: { id: input.id } }) : await tx.attractionImage.findUnique({ where: { id: input.id } }) : null;
      if (input.action === 'delete' && !before) return null;
      const asset = input.action === 'create' && (input.kind === 'attraction-images' || input.kind === 'country-media') ?
        await tx.mediaAsset.findUnique({ where: { id: String(input.data.mediaAssetId) } }) : null;
      if (input.action === 'create' && input.kind === 'attraction-images' && (!asset || asset.usage !== 'ATTRACTION')) return null;
      if (input.action === 'create' && input.kind === 'country-media' && (!asset || asset.usage !== 'CONTENT')) return null;
      const data = asset ? { ...(input.kind === 'country-media' ? { countryCode: input.data.countryCode } : { attractionId: input.data.attractionId }),
        mediaAssetId: asset.id, path: asset.path, url: asset.url, alt: input.data.alt, sortOrder: input.data.sortOrder } : input.data;
      const after = input.kind === 'country-packing' ?
        input.action === 'create' ? await tx.countryPacking.create({ data: data as Prisma.CountryPackingUncheckedCreateInput }) :
          await tx.countryPacking.delete({ where: { id: input.id } }) :
        input.kind === 'country-apps' ?
        input.action === 'create' ? await tx.countryTravelApp.create({ data: data as Prisma.CountryTravelAppUncheckedCreateInput }) :
          await tx.countryTravelApp.delete({ where: { id: input.id } }) :
        input.kind === 'country-media' ?
          input.action === 'create' ? await tx.countryMedia.create({ data: data as Prisma.CountryMediaUncheckedCreateInput }) :
            await tx.countryMedia.delete({ where: { id: input.id } }) :
          input.action === 'create' ? await tx.attractionImage.create({ data: data as Prisma.AttractionImageUncheckedCreateInput }) :
            await tx.attractionImage.delete({ where: { id: input.id } });
      const row = record(after);
      const module = input.kind === 'country-packing' ? ContentModule.packing :
        input.kind === 'attraction-images' ? ContentModule.attraction : ContentModule.country;
      await tx.contentVersion.upsert({ where: { module }, create: { module, version: 1, changedByEntity: input.kind, changedById: String(row.id) },
        update: { version: { increment: 1 }, changedByEntity: input.kind, changedById: String(row.id) } });
      await tx.operationLog.create({ data: { adminUserId: input.adminId, action: input.action === 'create' ? OperationAction.CREATE : OperationAction.DELETE,
        targetType: input.kind, targetId: String(row.id), targetLabel: String(row.countryCode ?? row.attractionId ?? row.id),
        changes: computeChanges(input.action === 'create' ? null : before, input.action === 'create' ? after : { deleted: true }) as Prisma.InputJsonValue,
        requestId: input.requestId } });
      return after;
    });
  }
  listLinks(kind: LinkKind, parent: string): Promise<unknown[]> {
    if (kind === 'country-packing') return this.db.countryPacking.findMany({ where: { countryCode: parent },
      include: { packingItem: { select: { code: true, name: true } } }, orderBy: { sortOrder: 'asc' } });
    if (kind === 'country-apps') return this.db.countryTravelApp.findMany({ where: { countryCode: parent },
      include: { travelApp: { select: { code: true, name: true } } }, orderBy: { sortOrder: 'asc' } });
    if (kind === 'country-media') return this.db.countryMedia.findMany({ where: { countryCode: parent }, orderBy: { sortOrder: 'asc' } });
    return this.db.attractionImage.findMany({ where: { attractionId: parent }, orderBy: { sortOrder: 'asc' } });
  }
  reorderLink(kind: LinkKind, id: string, sortOrder: number, adminId: string, requestId: string): Promise<unknown | null> {
    return this.db.$transaction(async (tx) => {
      const before = kind === 'country-packing' ? await tx.countryPacking.findUnique({ where: { id } }) :
        kind === 'country-apps' ? await tx.countryTravelApp.findUnique({ where: { id } }) :
          kind === 'country-media' ? await tx.countryMedia.findUnique({ where: { id } }) : await tx.attractionImage.findUnique({ where: { id } });
      if (!before) return null;
      const after = kind === 'country-packing' ? await tx.countryPacking.update({ where: { id }, data: { sortOrder } }) :
        kind === 'country-apps' ? await tx.countryTravelApp.update({ where: { id }, data: { sortOrder } }) :
          kind === 'country-media' ? await tx.countryMedia.update({ where: { id }, data: { sortOrder } }) : await tx.attractionImage.update({ where: { id }, data: { sortOrder } });
      const module = kind === 'country-packing' ? ContentModule.packing : kind === 'attraction-images' ? ContentModule.attraction : ContentModule.country;
      await tx.contentVersion.upsert({ where: { module }, create: { module, version: 1, changedByEntity: kind, changedById: id },
        update: { version: { increment: 1 }, changedByEntity: kind, changedById: id } });
      await tx.operationLog.create({ data: { adminUserId: adminId, action: OperationAction.UPDATE, targetType: kind, targetId: id,
        targetLabel: id, requestId, changes: computeChanges(before, after) as Prisma.InputJsonValue } });
      return after;
    });
  }
}

export const repositoryProviders = [
  { provide: REPO.health, useClass: PrismaHealthRepository },
  { provide: REPO.continent, useClass: PrismaContinentRepository },
  { provide: REPO.country, useClass: PrismaCountryRepository },
  { provide: REPO.city, useClass: PrismaCityRepository },
  { provide: REPO.visa, useClass: PrismaVisaRepository },
  { provide: REPO.content, useClass: PrismaContentRepository },
  { provide: REPO.trip, useClass: PrismaTripRepository },
  { provide: REPO.invite, useClass: PrismaTripInviteRepository },
  { provide: REPO.plan, useClass: PrismaPlanRepository },
  { provide: REPO.expense, useClass: PrismaTripExpenseRepository },
  { provide: REPO.version, useClass: PrismaContentVersionRepository },
  { provide: REPO.media, useClass: PrismaMediaRepository },
  { provide: REPO.admin, useClass: PrismaAdminRepository },
  { provide: REPO.log, useClass: PrismaOperationLogRepository },
];
