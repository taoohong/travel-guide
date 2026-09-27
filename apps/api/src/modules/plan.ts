import { Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PlanItemType, PlanScope, PlanSourceType, PlanStage, Prisma } from '@prisma/client';
import { buildDedupeKey, isDuplicatePlanItem } from '@travel-guide/core';
import type { PlanItem as DomainPlanItem } from '@travel-guide/types';
import { z } from 'zod';
import { ApiError, parse, type ApiRequest } from '../common/http';
import { planDto } from '../common/mappers';
import { code, dateOrNull, id, nonEmpty } from '../common/validation';
import { REPO, type PlanRepository, type TripRepository } from '../prisma/repositories';
import { UserGuard } from './auth/users';

const createSchema = z.object({ title: nonEmpty, description: z.string().max(5000).nullish(),
  stage: z.nativeEnum(PlanStage), itemType: z.nativeEnum(PlanItemType), scope: z.nativeEnum(PlanScope),
  sourceType: z.nativeEnum(PlanSourceType), sourceId: z.string().trim().min(1).max(200).nullish(),
  sourceCountryCode: code.nullish(), dedupeKey: z.string().trim().min(1).max(200).nullish(),
  dedupeHash: z.string().max(500).nullish(), sortOrder: z.number().int().min(0).optional(),
  done: z.boolean().optional(), doneAt: z.string().datetime({ offset: true }).nullish(),
  planDate: z.string().datetime({ offset: true }).nullish() }).strict();
const patchSchema = z.object({ title: nonEmpty.optional(), description: z.string().max(5000).nullish(),
  sortOrder: z.number().int().min(0).optional(), done: z.boolean().optional(),
  doneAt: z.string().datetime({ offset: true }).nullish(), planDate: z.string().datetime({ offset: true }).nullish() }).strict();

@Injectable()
export class PlanService {
  constructor(@Inject(REPO.plan) private readonly plans: PlanRepository, @Inject(REPO.trip) private readonly trips: TripRepository) {}
  private async memberIds(tripId: string): Promise<string[]> { return (await this.trips.members(tripId)).map((member) => member.userId); }
  private async trip(tripId: string, userId: string): Promise<void> {
    if (!await this.trips.find(parse(id, tripId))) throw new ApiError('NOT_FOUND', '旅行不存在');
    const member = await this.trips.membership(tripId, userId);
    if (!member || member.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', '旅行不存在');
  }
  async list(userId: string, tripId: string): Promise<object[]> {
    await this.trip(tripId, userId);
    const memberIds = await this.memberIds(tripId);
    return (await this.plans.list(tripId)).map((item) => planDto(item, userId, memberIds));
  }
  async create(userId: string, tripId: string, body: unknown): Promise<object> {
    await this.trip(tripId, userId);
    const memberIds = await this.memberIds(tripId);
    const input = parse(createSchema, body);
    if (input.scope === PlanScope.COUNTRY && !input.sourceCountryCode) throw new ApiError('VALIDATION_FAILED', 'COUNTRY 范围必须提供 sourceCountryCode');
    if (input.doneAt && !input.done) throw new ApiError('VALIDATION_FAILED', '未完成事项不能提供 doneAt');
    const dedupeHash = input.sourceType === PlanSourceType.USER && !input.dedupeKey && !input.sourceId ? null : buildDedupeKey(input);
    if (input.dedupeHash !== undefined && input.dedupeHash !== dedupeHash) throw new ApiError('VALIDATION_FAILED', 'dedupeHash 与业务字段不一致');
    const existingItems = dedupeHash ? await this.plans.list(tripId) : [];
    const domainItems = existingItems.map((item): DomainPlanItem => planDto(item, userId, memberIds));
    if (dedupeHash && isDuplicatePlanItem(domainItems, { ...input, tripId, sourceId: input.sourceId ?? null,
      sourceCountryCode: input.sourceCountryCode ?? null, dedupeKey: input.dedupeKey ?? null })) {
      const found = await this.plans.findByHash(tripId, dedupeHash);
      if (found) return { created: false, planItem: planDto(found, userId, memberIds), toast: '已在准备计划中' };
    }
    try {
      const row = await this.plans.create({ tripId, title: input.title, description: input.description,
        stage: input.stage, itemType: input.itemType, scope: input.scope, sourceType: input.sourceType,
        sourceId: input.sourceId, sourceCountryCode: input.sourceCountryCode, dedupeKey: input.dedupeKey,
        dedupeHash, sortOrder: input.sortOrder ?? 0, done: input.done ?? false,
        doneAt: input.done ? dateOrNull(input.doneAt) ?? new Date() : null, planDate: dateOrNull(input.planDate) }, userId);
      return { created: true, planItem: planDto(row, userId, memberIds), toast: '已加入准备计划' };
    } catch (error) {
      if (dedupeHash && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const found = await this.plans.findByHash(tripId, dedupeHash);
        if (found) return { created: false, planItem: planDto(found, userId, memberIds), toast: '已在准备计划中' };
      }
      throw error;
    }
  }
  async update(userId: string, tripId: string, itemId: string, body: unknown): Promise<object> {
    await this.trip(tripId, userId);
    const input = parse(patchSchema, body);
    if (input.done === false && input.doneAt) throw new ApiError('VALIDATION_FAILED', '未完成事项不能提供 doneAt');
    const memberIds = await this.memberIds(tripId);
    const updated = await this.plans.update(tripId, parse(id, itemId), userId, { title: input.title, description: input.description,
      sortOrder: input.sortOrder, done: input.done,
      doneAt: input.done === false ? null : input.done === true ? dateOrNull(input.doneAt) ?? new Date() : dateOrNull(input.doneAt),
      planDate: dateOrNull(input.planDate) });
    if (!updated) throw new ApiError('NOT_FOUND', '计划项不存在');
    return planDto(updated, userId, memberIds);
  }
  async remove(userId: string, tripId: string, itemId: string): Promise<object> {
    await this.trip(tripId, userId);
    const row = await this.plans.remove(tripId, parse(id, itemId));
    if (!row) throw new ApiError('NOT_FOUND', '计划项不存在');
    const memberIds = await this.memberIds(tripId);
    const removed = planDto(row, userId, memberIds);
    return { removed, undoHint: { action: 'POST', path: `/trips/${tripId}/plan-items`,
      payload: { title: row.title, description: row.description, stage: row.stage, itemType: row.itemType, scope: row.scope,
        sourceType: row.sourceType, sourceId: row.sourceId, sourceCountryCode: row.sourceCountryCode, dedupeKey: row.dedupeKey,
        sortOrder: row.sortOrder, done: removed.done, doneAt: removed.doneAt,
        planDate: row.planDate?.toISOString() ?? null } } };
  }
}

@Controller('trips/:tripId/plan-items')
@UseGuards(UserGuard)
export class PlanController {
  constructor(@Inject(PlanService) private readonly service: PlanService) {}
  @Get() list(@Req() request: ApiRequest, @Param('tripId') tripId: string): Promise<object[]> { return this.service.list(request.user!.id, tripId); }
  @Post() @HttpCode(200) create(@Req() request: ApiRequest, @Param('tripId') tripId: string, @Body() body: unknown): Promise<object> { return this.service.create(request.user!.id, tripId, body); }
  @Patch(':planItemId') update(@Req() request: ApiRequest, @Param('tripId') tripId: string, @Param('planItemId') itemId: string, @Body() body: unknown): Promise<object> {
    return this.service.update(request.user!.id, tripId, itemId, body);
  }
  @Delete(':planItemId') remove(@Req() request: ApiRequest, @Param('tripId') tripId: string, @Param('planItemId') itemId: string): Promise<object> {
    return this.service.remove(request.user!.id, tripId, itemId);
  }
}
