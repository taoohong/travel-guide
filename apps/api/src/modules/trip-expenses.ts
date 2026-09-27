import { Body, Controller, Delete, Get, Inject, Injectable, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ApiError, parse, type ApiRequest } from '../common/http';
import { id } from '../common/validation';
import { REPO, type ExpenseRecord, type TripExpenseRepository, type TripRepository } from '../prisma/repositories';
import { UserGuard } from './auth/users';

const createExpense = z.object({ category: z.string().trim().min(1).max(30), amountCents: z.number().int().positive().max(1_000_000_000),
  payerUserId: id, participantUserIds: z.array(id).min(1).max(20), note: z.string().trim().max(300).nullish() }).strict();

function expenseDto(row: ExpenseRecord) {
  return { id: row.id, tripId: row.tripId, category: row.category, amountCents: row.amountCents,
    payerUserId: row.payerUserId, payerNickname: row.payer.nickname, participantUserIds: row.participantUserIds,
    note: row.note, createdAt: row.createdAt.toISOString() };
}

@Injectable()
export class TripExpenseService {
  constructor(@Inject(REPO.expense) private readonly expenses: TripExpenseRepository,
    @Inject(REPO.trip) private readonly trips: TripRepository) {}

  private async assertMember(tripId: string, userId: string) {
    if (!await this.trips.find(parse(id, tripId))) throw new ApiError('NOT_FOUND', '旅行不存在');
    const member = await this.trips.membership(tripId, userId);
    if (!member || member.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', '旅行不存在');
    return member;
  }

  async list(userId: string, tripId: string): Promise<object[]> {
    await this.assertMember(tripId, userId);
    return (await this.expenses.list(tripId)).map(expenseDto);
  }

  async create(userId: string, tripId: string, body: unknown): Promise<object> {
    await this.assertMember(tripId, userId);
    const input = parse(createExpense, body);
    const memberIds = new Set((await this.trips.members(tripId)).map((member) => member.userId));
    const participantUserIds = [...new Set(input.participantUserIds)];
    if (!memberIds.has(input.payerUserId) || participantUserIds.some((memberId) => !memberIds.has(memberId)))
      throw new ApiError('VALIDATION_FAILED', '付款人和分摊成员必须是当前同行者');
    return expenseDto(await this.expenses.create({ tripId, category: input.category, amountCents: input.amountCents,
      payerUserId: input.payerUserId, participantUserIds, note: input.note || null }));
  }

  async remove(userId: string, tripId: string, expenseId: string): Promise<object> {
    const member = await this.assertMember(tripId, userId);
    const expense = await this.expenses.find(tripId, parse(id, expenseId));
    if (!expense) throw new ApiError('NOT_FOUND', '账单不存在');
    if (expense.payerUserId !== userId && member.role !== 'OWNER') throw new ApiError('FORBIDDEN', '只有付款人或旅行创建者可以删除账单');
    await this.expenses.remove(tripId, expense.id);
    return { removed: true };
  }
}

@Controller('trips/:tripId/expenses')
@UseGuards(UserGuard)
export class TripExpenseController {
  constructor(@Inject(TripExpenseService) private readonly service: TripExpenseService) {}
  @Get() list(@Req() request: ApiRequest, @Param('tripId') tripId: string): Promise<object[]> {
    return this.service.list(request.user!.id, tripId);
  }
  @Post() create(@Req() request: ApiRequest, @Param('tripId') tripId: string, @Body() body: unknown): Promise<object> {
    return this.service.create(request.user!.id, tripId, body);
  }
  @Delete(':expenseId') remove(@Req() request: ApiRequest, @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string): Promise<object> {
    return this.service.remove(request.user!.id, tripId, expenseId);
  }
}
