import { createHmac, timingSafeEqual } from 'node:crypto';
import { Body, Controller, createParamDecorator, Get, Inject, Injectable, Post, Req, SetMetadata, UseGuards } from '@nestjs/common';
import type { ExecutionContext, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole, OperationAction } from '@prisma/client';
import { z } from 'zod';
import { ApiError, parse, type ApiRequest } from '../../common/http';
import type { AppConfig } from '../../config/env';
import { REPO, type AdminRepository, type OperationLogRepository } from '../../prisma/repositories';
import { verifyPassword } from './password';

export interface TokenPayload { sub: string; exp: number; scope?: string }
const lifetimeSeconds = 8 * 60 * 60;

export function sign(payload: TokenPayload, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const content = `${header}.${body}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}
export function verify(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  let actual: Buffer;
  try { actual = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object' || !('sub' in payload) || !('exp' in payload)) return null;
    const value = payload as TokenPayload;
    return typeof value.sub === 'string' && typeof value.exp === 'number' && value.exp > Math.floor(Date.now() / 1000) ? value : null;
  } catch { return null; }
}

@Injectable()
export class AuthService {
  constructor(@Inject(REPO.admin) private readonly admins: AdminRepository,
    @Inject(REPO.log) private readonly logs: OperationLogRepository,
    @Inject('APP_CONFIG') private readonly config: AppConfig) {}
  async login(body: unknown, requestId: string): Promise<object> {
    const { username, password } = parse(z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1) }).strict(), body);
    const admin = await this.admins.find(username);
    if (!admin || !admin.isActive || !verifyPassword(password, admin.passwordHash)) throw new ApiError('UNAUTHORIZED', '用户名或密码错误');
    await this.logs.create({ action: OperationAction.LOGIN, targetType: 'AdminUser', targetId: admin.id,
      targetLabel: admin.username, adminUserId: admin.id, requestId, changes: [] });
    return { token: sign({ sub: admin.id, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds, scope: 'admin' }, this.config.AUTH_SECRET),
      expiresIn: lifetimeSeconds, user: { id: admin.id, username: admin.username, role: admin.role } };
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(REPO.admin) private readonly admins: AdminRepository, @Inject('APP_CONFIG') private readonly config: AppConfig) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const authorization = request.header('Authorization');
    if (!authorization?.startsWith('Bearer ')) throw new ApiError('UNAUTHORIZED', '请先登录');
    const payload = verify(authorization.slice(7), this.config.AUTH_SECRET);
    if (!payload || (payload.scope && payload.scope !== 'admin')) throw new ApiError('UNAUTHORIZED', '登录已失效');
    const admin = await this.admins.findById(payload.sub);
    if (!admin?.isActive) throw new ApiError('UNAUTHORIZED', '登录已失效');
    request.admin = { id: admin.id, role: admin.role, username: admin.username };
    return true;
  }
}

export const Roles = (...roles: AdminRole[]) => SetMetadata('roles', roles);
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[]>('roles', [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const admin = context.switchToHttp().getRequest<ApiRequest>().admin;
    if (!admin || !roles.includes(admin.role as AdminRole)) throw new ApiError('FORBIDDEN', '无权限');
    return true;
  }
}

export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<ApiRequest>().admin);

@Controller('admin/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly service: AuthService) {}
  @Post('login') login(@Body() body: unknown, @Req() req: ApiRequest): Promise<object> { return this.service.login(body, req.requestId); }
  @Get('me') @UseGuards(AdminGuard) me(@CurrentAdmin() admin: ApiRequest['admin']): object { return admin ?? {}; }
}
