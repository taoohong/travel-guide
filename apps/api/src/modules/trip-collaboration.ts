import { createHash, randomBytes } from 'node:crypto';
import { Controller, Delete, Get, Inject, Injectable, Param, Post, Req, UseGuards } from '@nestjs/common';
import { TRIP_INVITE_JOIN_RATE_LIMIT, TRIP_INVITE_MAX_USES, TRIP_INVITE_PREVIEW_RATE_LIMIT,
  TRIP_INVITE_RATE_WINDOW_MS, TRIP_INVITE_TTL_DAYS } from '@travel-guide/constants';
import { z } from 'zod';
import { ApiError, parse, type ApiRequest } from '../common/http';
import { REPO, type TripInviteRepository, type TripRepository } from '../prisma/repositories';
import { UserGuard } from './auth/users';

const tokenPattern = /^[A-Za-z0-9_-]{40,60}$/;
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class TripCollaborationService {
  private readonly rates = new Map<string, { expiresAt: number; count: number }>();
  constructor(@Inject(REPO.trip) private readonly trips: TripRepository,
    @Inject(REPO.invite) private readonly invites: TripInviteRepository) {}

  private rateLimit(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    if (this.rates.size > 5000) for (const [entry, value] of this.rates) if (value.expiresAt <= now) this.rates.delete(entry);
    const bucket = this.rates.get(key);
    if (!bucket || bucket.expiresAt <= now) this.rates.set(key, { expiresAt: now + windowMs, count: 1 });
    else if (++bucket.count > limit) throw new ApiError('RATE_LIMITED', '请求过于频繁，请稍后再试');
  }

  private async owner(tripId: string, userId: string): Promise<void> {
    if (!await this.trips.find(tripId)) throw new ApiError('NOT_FOUND', '旅行不存在');
    const member = await this.trips.membership(tripId, userId);
    if (member?.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', '旅行不存在');
    if (member.role !== 'OWNER') throw new ApiError('FORBIDDEN', '只有旅行创建者可以管理同行邀请');
  }

  async createInvite(tripId: string, userId: string): Promise<object> {
    await this.owner(tripId, userId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TRIP_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.invites.create({ tripId, createdByUserId: userId, tokenHash: sha256(token), expiresAt, maxUses: TRIP_INVITE_MAX_USES });
    return { token, expiresAt: expiresAt.toISOString(), maxUses: TRIP_INVITE_MAX_USES,
      path: `/pages/trip-invite/index?token=${encodeURIComponent(token)}` };
  }

  async revokeInvites(tripId: string, userId: string): Promise<object> {
    await this.owner(tripId, userId);
    return { revoked: await this.invites.revokeActive(tripId, new Date()) };
  }

  async preview(tokenInput: string, clientKey: string): Promise<object> {
    this.rateLimit(`preview:${clientKey}`, TRIP_INVITE_PREVIEW_RATE_LIMIT, TRIP_INVITE_RATE_WINDOW_MS);
    const token = parse(z.string().regex(tokenPattern), tokenInput);
    const invite = await this.invites.preview(sha256(token));
    if (!invite) throw new ApiError('NOT_FOUND', '邀请不存在或已失效');
    if (invite.revokedAt) throw new ApiError('INVITE_REVOKED', '该邀请已失效');
    if (invite.expiresAt <= new Date()) throw new ApiError('INVITE_EXPIRED', '该邀请已过期');
    if (invite.useCount >= invite.maxUses) throw new ApiError('INVITE_EXHAUSTED', '该邀请人数已满');
    return { trip: { title: invite.title, startDate: invite.startDate?.toISOString() ?? null,
      endDate: invite.endDate?.toISOString() ?? null, destinations: invite.destinations },
      owner: invite.owner, memberCount: invite.memberCount, expiresAt: invite.expiresAt.toISOString() };
  }

  async join(tokenInput: string, userId: string, clientKey: string): Promise<object> {
    this.rateLimit(`join:${clientKey}`, TRIP_INVITE_JOIN_RATE_LIMIT, TRIP_INVITE_RATE_WINDOW_MS);
    const token = parse(z.string().regex(tokenPattern), tokenInput);
    const result = await this.invites.join(sha256(token), userId, new Date());
    if (result.kind === 'not-found') throw new ApiError('NOT_FOUND', '邀请不存在或已失效');
    if (result.kind === 'expired') throw new ApiError('INVITE_EXPIRED', '该邀请已过期');
    if (result.kind === 'revoked') throw new ApiError('INVITE_REVOKED', '该邀请已失效');
    if (result.kind === 'exhausted') throw new ApiError('INVITE_EXHAUSTED', '该邀请人数已满');
    return { tripId: result.tripId, alreadyJoined: result.alreadyJoined };
  }

  async members(tripId: string, userId: string): Promise<object> {
    const member = await this.trips.membership(tripId, userId);
    if (!member || member.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', '旅行不存在');
    return { role: member.role, items: await this.trips.members(tripId) };
  }

  async removeMember(tripId: string, ownerId: string, userId: string): Promise<object> {
    await this.owner(tripId, ownerId);
    if (ownerId === userId) throw new ApiError('CONFLICT', '不能移除旅行创建者');
    if (!await this.trips.removeMember(tripId, userId)) throw new ApiError('NOT_FOUND', '同行成员不存在');
    return { removed: true };
  }

  async leave(tripId: string, userId: string): Promise<object> {
    const member = await this.trips.membership(tripId, userId);
    if (!member || member.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', '旅行不存在');
    if (member.role === 'OWNER') throw new ApiError('CONFLICT', '旅行创建者不能直接退出');
    await this.trips.leaveMember(tripId, userId);
    return { left: true };
  }
}

@Controller('trips/:tripId')
@UseGuards(UserGuard)
export class TripCollaborationController {
  constructor(@Inject(TripCollaborationService) private readonly service: TripCollaborationService) {}
  @Post('invites') create(@Req() request: ApiRequest, @Param('tripId') tripId: string): Promise<object> {
    return this.service.createInvite(tripId, request.user!.id);
  }
  @Delete('invites') revoke(@Req() request: ApiRequest, @Param('tripId') tripId: string): Promise<object> {
    return this.service.revokeInvites(tripId, request.user!.id);
  }
  @Get('members') members(@Req() request: ApiRequest, @Param('tripId') tripId: string): Promise<object> {
    return this.service.members(tripId, request.user!.id);
  }
  @Delete('members/:userId') removeMember(@Req() request: ApiRequest, @Param('tripId') tripId: string,
    @Param('userId') userId: string): Promise<object> { return this.service.removeMember(tripId, request.user!.id, userId); }
  @Post('leave') leave(@Req() request: ApiRequest, @Param('tripId') tripId: string): Promise<object> {
    return this.service.leave(tripId, request.user!.id);
  }
}

@Controller('trip-invites')
export class TripInviteController {
  constructor(@Inject(TripCollaborationService) private readonly service: TripCollaborationService) {}
  @Get(':token') preview(@Param('token') token: string, @Req() request: ApiRequest): Promise<object> {
    return this.service.preview(token, request.ip || 'unknown');
  }
  @Post(':token/join') @UseGuards(UserGuard)
  join(@Param('token') token: string, @Req() request: ApiRequest): Promise<object> {
    return this.service.join(token, request.user!.id, request.ip || 'unknown');
  }
}
