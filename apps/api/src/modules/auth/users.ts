import { Body, Controller, Get, Inject, Injectable, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserAnchorType } from '@travel-guide/constants';
import { z } from 'zod';
import { ApiError, parse, type ApiRequest } from '../../common/http';
import type { AppConfig } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { recordUserAnchors } from '../user-anchors';
import { sign, verify } from './auth';
import { MediaService } from '../media';

const userProfile = { id: true, uid: true, nickname: true, avatarUrl: true, passportRegion: true,
  showPlanAddGuide: true, locale: true } as const;
const tokenLifetimeSeconds = 30 * 24 * 60 * 60;
const wechatProvider = 'WECHAT_MINI_PROGRAM';
const developmentProvider = 'DEVELOPMENT';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class UserAuthService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject('APP_CONFIG') private readonly config: AppConfig) {}

  async login(body: unknown, requestId: string): Promise<object> {
    const input = parse(z.object({ code: z.string().trim().min(1).max(256), nickname: z.string().trim().min(1).max(40) }).strict(), body);
    const providerUserId = await this.exchangeCode(input.code, requestId);
    const user = await this.resolveIdentity(wechatProvider, providerUserId, input.nickname);
    return { token: sign({ sub: user.uid, exp: Math.floor(Date.now() / 1000) + tokenLifetimeSeconds, scope: 'user' }, this.config.AUTH_SECRET),
      expiresIn: tokenLifetimeSeconds, user };
  }

  async developmentLogin(body: unknown): Promise<object> {
    if (!this.config.DEV_AUTH_ENABLED || this.config.MODE === 'production') throw new ApiError('NOT_FOUND', '开发身份登录不可用');
    const input = parse(z.object({ identity: z.enum(['A', 'B']) }).strict(), body);
    const nickname = `开发用户 ${input.identity}`;
    const user = await this.resolveIdentity(developmentProvider, input.identity, nickname);
    return { token: sign({ sub: user.uid, exp: Math.floor(Date.now() / 1000) + tokenLifetimeSeconds, scope: 'user' }, this.config.AUTH_SECRET),
      expiresIn: tokenLifetimeSeconds, user };
  }

  private async resolveIdentity(provider: string, providerUserId: string, nickname: string) {
    const where = { provider_providerUserId: { provider, providerUserId } };
    const resolve = () => this.db.$transaction(async (tx) => {
      const identity = await tx.authIdentity.findUnique({ where, select: { userId: true } });
      const user = identity
        ? await tx.user.update({ where: { id: identity.userId }, data: { nickname }, select: userProfile })
        : await tx.user.create({ data: { nickname, identities: { create: { provider, providerUserId } },
          }, select: userProfile });
      await recordUserAnchors(tx, [user.id], UserAnchorType.FIRST_LOGIN);
      return user;
    });
    try {
      return await resolve();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const identity = await this.db.authIdentity.findUnique({ where, select: { userId: true } });
      if (!identity) throw error;
      return this.db.$transaction(async (tx) => {
        const user = await tx.user.update({ where: { id: identity.userId }, data: { nickname }, select: userProfile });
        await recordUserAnchors(tx, [user.id], UserAnchorType.FIRST_LOGIN);
        return user;
      });
    }
  }

  async getProfile(userId: string): Promise<object> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: userProfile });
    if (!user) throw new ApiError('UNAUTHORIZED', '登录状态已失效');
    return user;
  }

  listAnchors(userId: string): Promise<object> {
    return this.db.userAnchor.findMany({ where: { userId }, orderBy: [{ occurredAt: 'asc' }, { type: 'asc' }],
      select: { type: true, tripId: true, occurredAt: true } });
  }

  async recordFirstUse(userId: string): Promise<object> {
    await recordUserAnchors(this.db, [userId], UserAnchorType.FIRST_USED);
    return { recorded: true };
  }

  async updateProfile(userId: string, body: unknown): Promise<object> {
    const input = parse(z.object({ nickname: z.string().trim().min(1).max(40).optional(),
      passportRegion: z.string().regex(/^[A-Z]{2}$/).optional(), showPlanAddGuide: z.boolean().optional(),
      locale: z.string().trim().min(2).max(20).optional() }).strict()
      .refine((value) => Object.keys(value).length > 0), body);
    return this.db.user.update({ where: { id: userId }, data: input, select: userProfile });
  }

  updateAvatar(userId: string, avatarUrl: string): Promise<object> {
    return this.db.user.update({ where: { id: userId }, data: { avatarUrl }, select: userProfile });
  }

  private async exchangeCode(code: string, requestId: string): Promise<string> {
    const { WECHAT_APP_ID: appId, WECHAT_APP_SECRET: secret } = this.config;
    if (!appId || !secret) throw new ApiError('INTERNAL_ERROR', '微信登录尚未配置');
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appId);
    url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    let result: { openid?: string; errcode?: number };
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      const cause = error instanceof Error && 'cause' in error ? error.cause : undefined;
      const causeCode = cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
        ? cause.code : undefined;
      console.error(JSON.stringify({ event: 'wechat_login_upstream_error', requestId,
        errorName: error instanceof Error ? error.name : 'UnknownError', causeCode }));
      throw new ApiError('INTERNAL_ERROR', '微信登录服务暂时不可用');
    }
    if (!response.ok) {
      console.error(JSON.stringify({ event: 'wechat_login_upstream_status', requestId, status: response.status }));
      throw new ApiError('INTERNAL_ERROR', '微信登录服务暂时不可用');
    }
    try {
      result = await response.json() as typeof result;
    } catch (error) {
      console.error(JSON.stringify({ event: 'wechat_login_invalid_response', requestId,
        errorName: error instanceof Error ? error.name : 'UnknownError' }));
      throw new ApiError('INTERNAL_ERROR', '微信登录服务暂时不可用');
    }
    if (result.errcode) {
      console.error(JSON.stringify({ event: 'wechat_login_rejected', requestId, errcode: result.errcode }));
    }
    if (!result.openid || result.errcode) throw new ApiError('UNAUTHORIZED', '微信登录校验失败，请重试');
    return result.openid;
  }
}

@Injectable()
export class UserGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject('APP_CONFIG') private readonly config: AppConfig) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const authorization = request.header('Authorization');
    if (!authorization?.startsWith('Bearer ')) throw new ApiError('UNAUTHORIZED', '请先登录');
    const payload = verify(authorization.slice(7), this.config.AUTH_SECRET);
    if (!payload || payload.scope !== 'user') throw new ApiError('UNAUTHORIZED', '登录已失效');
    const user = await this.db.user.findUnique({ where: { uid: payload.sub }, select: { id: true } }) ??
      await this.db.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
    if (!user) throw new ApiError('UNAUTHORIZED', '登录已失效');
    request.user = user;
    return true;
  }
}

@Controller('auth')
export class UserAuthController {
  constructor(@Inject(UserAuthService) private readonly service: UserAuthService) {}
  @Post('wechat-login') login(@Body() body: unknown, @Req() request: ApiRequest): Promise<object> {
    return this.service.login(body, request.requestId);
  }
  @Post('dev-login') developmentLogin(@Body() body: unknown): Promise<object> { return this.service.developmentLogin(body); }
}

@Controller('users/me')
@UseGuards(UserGuard)
export class UserProfileController {
  constructor(@Inject(UserAuthService) private readonly service: UserAuthService,
    @Inject(MediaService) private readonly media: MediaService) {}

  @Get() getProfile(@Req() request: ApiRequest): Promise<object> { return this.service.getProfile(request.user!.id); }
  @Get('anchors') anchors(@Req() request: ApiRequest): Promise<object> { return this.service.listAnchors(request.user!.id); }
  @Post('anchors/first-use') firstUse(@Req() request: ApiRequest): Promise<object> {
    return this.service.recordFirstUse(request.user!.id);
  }
  @Patch() updateProfile(@Req() request: ApiRequest, @Body() body: unknown): Promise<object> {
    return this.service.updateProfile(request.user!.id, body);
  }
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadAvatar(@Req() request: ApiRequest, @UploadedFile() file: Express.Multer.File | undefined): Promise<object> {
    const asset = await this.media.upload(file, { usage: 'USER_AVATAR' }) as { url: string };
    return this.service.updateAvatar(request.user!.id, asset.url);
  }
}
