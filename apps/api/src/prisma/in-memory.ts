import { randomUUID } from 'node:crypto';
import { Prisma, TripStatus, type Country, type PlanItem, type Trip, type TripDestination } from '@prisma/client';
import type { InviteJoinResult, PlanItemRecord, PlanItemUpdateData, PlanRepository, TripInviteRepository, TripRepository, TripInvitePreviewRecord } from './repositories';

const copy = <T>(value: T): T => structuredClone(value);
const date = (value: string | Date | null | undefined): Date | null => value ? new Date(value) : null;
const uniqueViolation = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.19.3' });

/** 与 PostgreSQL 相同：非空 dedupeHash 在一个 Trip 内唯一，多个 null 可共存。 */
export class InMemoryPlanRepository implements PlanRepository {
  private rows: PlanItem[] = [];
  private completions = new Map<string, Map<string, Date>>();
  private withCompletions(row: PlanItem): PlanItemRecord {
    return copy({ ...row, completions: [...(this.completions.get(row.id) ?? [])].map(([userId, completedAt]) => ({ userId, completedAt })) });
  }
  async list(tripId: string): Promise<PlanItemRecord[]> { return this.rows.filter((row) => row.tripId === tripId)
    .sort((a, b) => a.stage.localeCompare(b.stage) || a.sortOrder - b.sortOrder).map((row) => this.withCompletions(row)); }
  async findByHash(tripId: string, hash: string): Promise<PlanItemRecord | null> {
    const row = this.rows.find((item) => item.tripId === tripId && item.dedupeHash === hash);
    return row ? this.withCompletions(row) : null;
  }
  async create(data: Prisma.PlanItemUncheckedCreateInput, userId: string): Promise<PlanItemRecord> {
    const hash = typeof data.dedupeHash === 'string' ? data.dedupeHash : null;
    if (hash && this.rows.some((row) => row.tripId === data.tripId && row.dedupeHash === hash)) throw uniqueViolation();
    const row: PlanItem = { id: typeof data.id === 'string' ? data.id : randomUUID(), tripId: data.tripId,
      title: data.title, description: typeof data.description === 'string' ? data.description : null,
      stage: data.stage, itemType: data.itemType, scope: data.scope, sourceType: data.sourceType,
      sourceId: typeof data.sourceId === 'string' ? data.sourceId : null,
      sourceCountryCode: typeof data.sourceCountryCode === 'string' ? data.sourceCountryCode : null,
      dedupeKey: typeof data.dedupeKey === 'string' ? data.dedupeKey : null, dedupeHash: hash,
      sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0, done: false, doneAt: null,
      planDate: date(data.planDate as string | Date | null | undefined),
      createdAt: new Date(), updatedAt: new Date() };
    this.rows.push(row);
    if (data.done) this.completions.set(row.id, new Map([[userId, date(data.doneAt as string | Date | null | undefined) ?? new Date()]]));
    return this.withCompletions(row);
  }
  async update(tripId: string, id: string, userId: string, data: PlanItemUpdateData): Promise<PlanItemRecord | null> {
    const row = this.rows.find((item) => item.id === id && item.tripId === tripId);
    if (!row) return null;
    const { done, doneAt, ...itemChanges } = data;
    Object.assign(row, copy(Object.fromEntries(Object.entries(itemChanges).filter(([, value]) => value !== undefined))), { updatedAt: new Date() });
    if (done !== undefined) {
      const progress = this.completions.get(row.id) ?? new Map<string, Date>();
      if (done) progress.set(userId, doneAt ?? new Date()); else progress.delete(userId);
      if (progress.size) this.completions.set(row.id, progress); else this.completions.delete(row.id);
    }
    return this.withCompletions(row);
  }
  async remove(tripId: string, id: string): Promise<PlanItemRecord | null> {
    const index = this.rows.findIndex((item) => item.id === id && item.tripId === tripId);
    if (index < 0) return null;
    const [row] = this.rows.splice(index, 1);
    const removed = row ? this.withCompletions(row) : null;
    this.completions.delete(id);
    return removed;
  }
}

export class InMemoryTripRepository implements TripRepository {
  private trips: Trip[] = [];
  private destinations: TripDestination[] = [];
  private memberships = new Map<string, { tripId: string; userId: string; role: 'OWNER' | 'MEMBER'; status: 'ACTIVE' | 'LEFT'; joinedAt: Date }>();
  constructor(private readonly countries: Country[] = []) {}
  async create(data: Prisma.TripUncheckedCreateInput): Promise<Trip> {
    const row: Trip = { id: typeof data.id === 'string' ? data.id : randomUUID(), userId: data.userId, title: data.title,
      notes: typeof data.notes === 'string' ? data.notes : null, status: TripStatus.DRAFT,
      travelers: Array.isArray(data.travelers) ? [...data.travelers] : [],
      startDate: date(data.startDate as string | Date | null | undefined), endDate: date(data.endDate as string | Date | null | undefined),
      createdAt: new Date(), updatedAt: new Date() };
    this.trips.push(row);
    const key = `${row.id}:${row.userId}`;
    this.memberships.set(key, { tripId: row.id, userId: row.userId, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() });
    return copy(row);
  }
  async list(userId: string, page: number, pageSize: number): Promise<{ items: Trip[]; total: number }> {
    const memberTrips = new Set([...this.memberships.values()].filter((item) => item.userId === userId && item.status === 'ACTIVE').map((item) => item.tripId));
    const rows = this.trips.filter((item) => memberTrips.has(item.id)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { items: copy(rows.slice((page - 1) * pageSize, page * pageSize)), total: rows.length };
  }
  async find(id: string): Promise<(Trip & { destinations: TripDestination[]; planItems: PlanItemRecord[] }) | null> {
    const row = this.trips.find((item) => item.id === id);
    return row ? copy({ ...row, destinations: this.destinations.filter((item) => item.tripId === id)
      .sort((a, b) => a.orderIndex - b.orderIndex), planItems: [] }) : null;
  }
  async update(id: string, data: Prisma.TripUpdateInput): Promise<Trip> {
    const row = this.trips.find((item) => item.id === id);
    if (!row) throw new Error('Trip not found');
    Object.assign(row, copy(Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))), { updatedAt: new Date() });
    return copy(row);
  }
  async delete(tripId: string): Promise<void> {
    this.trips = this.trips.filter((trip) => trip.id !== tripId);
    this.destinations = this.destinations.filter((destination) => destination.tripId !== tripId);
    for (const [key, member] of this.memberships) if (member.tripId === tripId) this.memberships.delete(key);
  }
  async country(code: string): Promise<Country | null> { return copy(this.countries.find((item) => item.code === code) ?? null); }
  async addDestination(data: Prisma.TripDestinationUncheckedCreateInput): Promise<TripDestination> {
    const last = this.destinations.filter((item) => item.tripId === data.tripId).reduce((max, item) => Math.max(max, item.orderIndex), -1);
    const row: TripDestination = { id: typeof data.id === 'string' ? data.id : randomUUID(), tripId: data.tripId,
      countryCode: data.countryCode, continentCode: data.continentCode, cityCode: typeof data.cityCode === 'string' ? data.cityCode : null,
      orderIndex: last + 1, arrivalDate: date(data.arrivalDate as string | Date | null | undefined),
      departureDate: date(data.departureDate as string | Date | null | undefined), isOrigin: Boolean(data.isOrigin) };
    this.destinations.push(row);
    return copy(row);
  }
  async removeDestination(tripId: string, destinationId: string): Promise<boolean> {
    const index = this.destinations.findIndex((item) => item.tripId === tripId && item.id === destinationId);
    if (index < 0) return false;
    const removed = this.destinations.splice(index, 1)[0]!;
    for (const row of this.destinations) if (row.tripId === tripId && row.orderIndex > removed.orderIndex) row.orderIndex--;
    return true;
  }
  async membership(tripId: string, userId: string): Promise<{ role: 'OWNER' | 'MEMBER'; status: 'ACTIVE' | 'LEFT' } | null> {
    const row = this.memberships.get(`${tripId}:${userId}`);
    return row ? { role: row.role, status: row.status } : null;
  }
  async members(tripId: string): Promise<Array<{ userId: string; nickname: string; avatarUrl: string | null; role: 'OWNER' | 'MEMBER'; joinedAt: Date }>> {
    return copy([...this.memberships.values()].filter((item) => item.tripId === tripId && item.status === 'ACTIVE')
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime()).map((item) => ({ userId: item.userId,
        nickname: item.userId, avatarUrl: null, role: item.role, joinedAt: item.joinedAt })));
  }
  async joinMember(tripId: string, userId: string): Promise<void> {
    const key = `${tripId}:${userId}`;
    this.memberships.set(key, { tripId, userId, role: this.memberships.get(key)?.role === 'OWNER' ? 'OWNER' : 'MEMBER', status: 'ACTIVE', joinedAt: new Date() });
  }
  async leaveMember(tripId: string, userId: string): Promise<boolean> {
    const row = this.memberships.get(`${tripId}:${userId}`);
    if (!row || row.role !== 'MEMBER' || row.status !== 'ACTIVE') return false;
    row.status = 'LEFT'; return true;
  }
  async removeMember(tripId: string, userId: string): Promise<boolean> { return this.leaveMember(tripId, userId); }
}

export class InMemoryTripInviteRepository implements TripInviteRepository {
  private rows: Array<{ id: string; tripId: string; createdByUserId: string; tokenHash: string; expiresAt: Date;
    maxUses: number; useCount: number; revokedAt: Date | null }> = [];
  private joinQueue: Promise<void> = Promise.resolve();
  constructor(private readonly trips: InMemoryTripRepository) {}
  async create(data: { tripId: string; createdByUserId: string; tokenHash: string; expiresAt: Date; maxUses: number }): Promise<void> {
    for (const row of this.rows) if (row.tripId === data.tripId && !row.revokedAt) row.revokedAt = new Date();
    this.rows.push({ ...copy(data), id: randomUUID(), useCount: 0, revokedAt: null });
  }
  async preview(tokenHash: string): Promise<TripInvitePreviewRecord | null> {
    const invite = this.rows.find((row) => row.tokenHash === tokenHash); if (!invite) return null;
    const trip = await this.trips.find(invite.tripId); if (!trip) return null;
    const destinations = await Promise.all(trip.destinations.map(async (destination) => {
      const country = await this.trips.country(destination.countryCode);
      return { countryCode: destination.countryCode, countryName: country?.nameZh ?? destination.countryCode,
        cityCode: destination.cityCode, orderIndex: destination.orderIndex };
    }));
    const members = await this.trips.members(invite.tripId);
    const owner = members.find((member) => member.role === 'OWNER');
    return { ...copy(invite), title: trip.title, startDate: trip.startDate, endDate: trip.endDate,
      owner: { nickname: owner?.nickname ?? invite.createdByUserId, avatarUrl: owner?.avatarUrl ?? null },
      destinations, memberCount: members.length };
  }
  async join(tokenHash: string, userId: string, now: Date): Promise<InviteJoinResult> {
    const previous = this.joinQueue;
    let release = () => {};
    this.joinQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const invite = this.rows.find((row) => row.tokenHash === tokenHash);
      if (!invite || !await this.trips.find(invite.tripId)) return { kind: 'not-found' };
      const member = await this.trips.membership(invite.tripId, userId);
      if (member?.status === 'ACTIVE') return { kind: 'joined', tripId: invite.tripId, alreadyJoined: true };
      if (invite.revokedAt) return { kind: 'revoked' };
      if (invite.expiresAt <= now) return { kind: 'expired' };
      if (invite.useCount >= invite.maxUses) return { kind: 'exhausted' };
      invite.useCount++;
      await this.trips.joinMember(invite.tripId, userId);
      return { kind: 'joined', tripId: invite.tripId, alreadyJoined: false };
    } finally { release(); }
  }
  async revokeActive(tripId: string, now: Date): Promise<number> {
    let count = 0;
    for (const invite of this.rows) if (invite.tripId === tripId && !invite.revokedAt) { invite.revokedAt = now; count++; }
    return count;
  }
}
