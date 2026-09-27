import { Body, Controller, Delete, Get, Inject, Injectable, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { calculatePlanProgress, canTransitionTripStatus, getCurrentTripStage, sortTripDestinations } from '@travel-guide/core';
import type { Trip as DomainTrip, TripDestination as DomainDestination } from '@travel-guide/types';
import { z } from 'zod';
import { ApiError, parse, type ApiRequest } from '../common/http';
import { destinationDto, planDto, tripDto } from '../common/mappers';
import { code, dateOrNull, id, iso, nonEmpty, pageQuery } from '../common/validation';
import { REPO, type CityRepository, type TripRepository } from '../prisma/repositories';
import { UserGuard } from './auth/users';

const tripCreate = z.object({ title: nonEmpty, notes: z.string().max(5000).nullish(),
  startDate: z.string().datetime({ offset: true }).nullish(), endDate: z.string().datetime({ offset: true }).nullish(),
  travelers: z.array(z.string().trim().min(1).max(80)).max(20).optional() }).strict();
const tripPatch = tripCreate.partial();
const destinationCreate = z.object({ countryCode: code, cityCode: z.string().regex(/^[A-Z0-9_-]{2,12}$/).nullish(),
  arrivalDate: z.string().datetime({ offset: true }).nullish(), departureDate: z.string().datetime({ offset: true }).nullish(),
  isOrigin: z.boolean().optional() }).strict();

@Injectable()
export class TripService {
  constructor(@Inject(REPO.trip) private readonly trips: TripRepository, @Inject(REPO.city) private readonly cities: CityRepository) {}
  async create(userId: string, body: unknown): Promise<object> {
    const input = parse(tripCreate, body);
    if (input.startDate && input.endDate && input.startDate > input.endDate) throw new ApiError('VALIDATION_FAILED', '结束日期不能早于开始日期');
    return tripDto(await this.trips.create({ userId, title: input.title, notes: input.notes,
      startDate: dateOrNull(input.startDate), endDate: dateOrNull(input.endDate), travelers: input.travelers }));
  }
  async list(userId: string, query: unknown): Promise<object> {
    const input = parse(pageQuery, query);
    const result = await this.trips.list(userId, input.page, input.pageSize);
    const items = await Promise.all(result.items.map(async (trip) => ({ ...tripDto(trip),
      memberRole: (await this.trips.membership(trip.id, userId))?.role ?? 'MEMBER',
      members: await this.trips.members(trip.id) })));
    return { items, total: result.total, page: input.page, pageSize: input.pageSize };
  }
  private async access(tripId: string, userId: string, ownerOnly = false) {
    const row = await this.trips.find(parse(id, tripId));
    if (!row) throw new ApiError('NOT_FOUND', '旅行不存在');
    const member = await this.trips.membership(tripId, userId);
    if (!member || member.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', '旅行不存在');
    if (ownerOnly && member.role !== 'OWNER') throw new ApiError('FORBIDDEN', '只有旅行创建者可以执行此操作');
    return { row, member };
  }
  async get(userId: string, tripId: string): Promise<object> {
    const { row, member } = await this.access(tripId, userId);
    const members = await this.trips.members(tripId);
    const memberIds = members.map((item) => item.userId);
    const planItems = row.planItems.map((item) => planDto(item, userId, memberIds));
    const domain: DomainTrip = { id: row.id, userId: row.userId, title: row.title, status: row.status,
      startDate: iso(row.startDate), endDate: iso(row.endDate), notes: row.notes };
    const destinations = row.destinations.map((item): DomainDestination => ({ ...item, cityCode: item.cityCode,
      arrivalDate: iso(item.arrivalDate), departureDate: iso(item.departureDate) }));
    return { ...tripDto(row), memberRole: member.role, members,
      currentStage: getCurrentTripStage(domain), destinations: sortTripDestinations(destinations).map((item) => ({ ...item })),
      stats: calculatePlanProgress(planItems), planItems };
  }
  async update(userId: string, tripId: string, body: unknown): Promise<object> {
    const input = parse(tripPatch, body);
    const { row: current } = await this.access(tripId, userId, true);
    const start = input.startDate === undefined ? iso(current.startDate) : input.startDate;
    const end = input.endDate === undefined ? iso(current.endDate) : input.endDate;
    if (start && end && start > end) throw new ApiError('VALIDATION_FAILED', '结束日期不能早于开始日期');
    return tripDto(await this.trips.update(tripId, { title: input.title, notes: input.notes, travelers: input.travelers,
      startDate: input.startDate === undefined ? undefined : dateOrNull(input.startDate),
      endDate: input.endDate === undefined ? undefined : dateOrNull(input.endDate) }));
  }
  async dissolve(userId: string, tripId: string): Promise<object> {
    await this.access(tripId, userId, true);
    await this.trips.delete(tripId);
    return { dissolved: true };
  }
  async confirm(userId: string, tripId: string, body: unknown): Promise<object> {
    const { stage } = parse(z.object({ stage: z.nativeEnum(TripStatus) }).strict(), body);
    const { row: current } = await this.access(tripId, userId, true);
    if (!canTransitionTripStatus(current.status, stage)) throw new ApiError('CONFLICT', '只能确认相邻旅行阶段');
    return tripDto(await this.trips.update(tripId, { status: stage }));
  }
  async addDestination(userId: string, tripId: string, body: unknown): Promise<object> {
    await this.access(tripId, userId, true);
    const input = parse(destinationCreate, body);
    const country = await this.trips.country(input.countryCode);
    if (!country) throw new ApiError('NOT_FOUND', '国家不存在');
    if (input.cityCode && !(await this.cities.list(input.countryCode)).some((item) => item.code === input.cityCode))
      throw new ApiError('VALIDATION_FAILED', '城市不属于该国家');
    if (input.arrivalDate && input.departureDate && input.arrivalDate > input.departureDate)
      throw new ApiError('VALIDATION_FAILED', '离开日期不能早于抵达日期');
    return destinationDto(await this.trips.addDestination({ tripId, countryCode: input.countryCode,
      continentCode: country.continentCode, cityCode: input.cityCode, orderIndex: 0,
      arrivalDate: dateOrNull(input.arrivalDate), departureDate: dateOrNull(input.departureDate), isOrigin: input.isOrigin ?? false }));
  }
  async removeDestination(userId: string, tripId: string, destinationId: string): Promise<object> {
    await this.access(tripId, userId, true);
    if (!await this.trips.removeDestination(parse(id, tripId), parse(id, destinationId))) throw new ApiError('NOT_FOUND', '目的地不存在');
    return { removed: true };
  }
}

@Controller('trips')
@UseGuards(UserGuard)
export class TripController {
  constructor(@Inject(TripService) private readonly service: TripService) {}
  @Post() create(@Req() request: ApiRequest, @Body() body: unknown): Promise<object> { return this.service.create(request.user!.id, body); }
  @Get() list(@Req() request: ApiRequest, @Query() query: unknown): Promise<object> { return this.service.list(request.user!.id, query); }
  @Get(':tripId') get(@Req() request: ApiRequest, @Param('tripId') tripId: string): Promise<object> { return this.service.get(request.user!.id, tripId); }
  @Patch(':tripId') update(@Req() request: ApiRequest, @Param('tripId') tripId: string, @Body() body: unknown): Promise<object> { return this.service.update(request.user!.id, tripId, body); }
  @Delete(':tripId') dissolve(@Req() request: ApiRequest, @Param('tripId') tripId: string): Promise<object> { return this.service.dissolve(request.user!.id, tripId); }
  @Post(':tripId/stage-confirm') confirm(@Req() request: ApiRequest, @Param('tripId') tripId: string, @Body() body: unknown): Promise<object> { return this.service.confirm(request.user!.id, tripId, body); }
  @Post(':tripId/destinations') destination(@Req() request: ApiRequest, @Param('tripId') tripId: string, @Body() body: unknown): Promise<object> { return this.service.addDestination(request.user!.id, tripId, body); }
  @Delete(':tripId/destinations/:destinationId') remove(@Req() request: ApiRequest, @Param('tripId') tripId: string, @Param('destinationId') destinationId: string): Promise<object> {
    return this.service.removeDestination(request.user!.id, tripId, destinationId);
  }
}
