import { describe, expect, it } from 'vitest';
import { of, firstValueFrom } from 'rxjs';
import { ContentModule, type AdminUser, type ContentVersion } from '@prisma/client';
import { ApiError, ApiExceptionFilter, ResponseEnvelope, requestIdMiddleware } from '../src/common/http';
import { ContentService } from '../src/modules/content';
import { VisaService } from '../src/modules/visa';
import { AuthService, AdminGuard, RoleGuard } from '../src/modules/auth/auth';
import { hashPassword } from '../src/modules/auth/password';
import { computeChanges } from '../src/prisma/repositories';
import type { AdminRepository, ContentRepository, ContentVersionRepository, CountryRepository,
  OperationLogRepository, VisaRepository, VisaRecord } from '../src/prisma/repositories';
import type { AppConfig } from '../src/config/env';
import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const emptyContent = { guides: async () => [], attraction: async () => null, health: async () => ({ noAttractions: 0, noTransport: 0, missingVisa: 0, guideCompleteness: 0 }),
  countryGuideSections: async () => [], countryGuideHealth: async () => ({}),
  listManaged: async () => ({ items: [], total: 0 }), getManaged: async () => null, mutate: async () => null,
  link: async () => null, listLinks: async () => [], reorderLink: async () => null } as ContentRepository;
const emptyCountries = { find: async () => null, list: async () => ({ items: [], total: 0 }), count: async () => ({ total: 0, online: 0, averageCompleteness: 0 }) } as CountryRepository;

describe('平台响应与错误', () => {
  it('沿用安全的上游 RequestId，成功响应统一封装', async () => {
    const headers: Record<string, string> = {};
    let finish: (() => void) | undefined;
    const req = { method: 'GET', originalUrl: '/api/v1/health', header: () => 'upstream-123' };
    const res = { statusCode: 200, setHeader: (key: string, value: string) => { headers[key] = value; }, on: (_event: string, cb: () => void) => { finish = cb; } };
    requestIdMiddleware(req as never, res as never, () => {});
    const context = { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
    const output = await firstValueFrom(new ResponseEnvelope().intercept(context, { handle: () => of({ status: 'ok' }) }));
    expect(output).toMatchObject({ success: true, data: { status: 'ok' }, requestId: 'upstream-123' });
    expect(headers['X-Request-Id']).toBe('upstream-123');
    finish?.();
  });

  it('404 和未知 500 均不暴露内部异常文本', () => {
    const bodies: Array<Record<string, unknown>> = [];
    let status = 0;
    const response = { status: (value: number) => { status = value; return response; }, json: (body: Record<string, unknown>) => { bodies.push(body); } };
    const host = { switchToHttp: () => ({ getRequest: () => ({ requestId: 'r1' }), getResponse: () => response }) } as ArgumentsHost;
    const filter = new ApiExceptionFilter();
    filter.catch(new ApiError('NOT_FOUND', '不存在'), host);
    expect(status).toBe(404);
    filter.catch(new Error('postgresql://secret SQL path C:\\private'), host);
    expect(status).toBe(500);
    expect(JSON.stringify(bodies[1])).not.toMatch(/secret|SQL|private/);
    expect(bodies[1]).toMatchObject({ success: false, code: 'INTERNAL_ERROR', requestId: 'r1' });
  });
});

describe('签证与内容版本接线', () => {
  const makeVisa = (passportRegion: string, destinationCountryCode: string, visaType: string): VisaRecord => ({
    passportRegion, destinationCountryCode, visaType, status: 'PUBLISHED', lastVerifiedAt: new Date('2026-01-01'),
    effectiveFrom: null, effectiveTo: null, requirements: [], title: '政策', corePolicy: [], notes: [],
  } as unknown as VisaRecord);
  it('精确、地区兜底、全局兜底和无数据均使用 Core 匹配', async () => {
    const policies = [makeVisa('CN', 'JP', 'VISA_REQUIRED'), makeVisa('SG', 'JP', 'VISA_FREE'),
      makeVisa('CN', '*', 'VISA_REQUIRED'), makeVisa('*', 'FR', 'VISA_FREE')];
    const repo = { candidates: async (passport: string, country: string) => policies.filter((item) =>
      (item.passportRegion === passport && (item.destinationCountryCode === country || item.destinationCountryCode === '*')) ||
      (item.passportRegion === '*' && item.destinationCountryCode === country)), list: async () => policies,
      findPair: async () => null, findById: async () => null } as VisaRepository;
    const service = new VisaService(repo);
    expect((await service.get('CN', 'JP') as { matchLevel: string }).matchLevel).toBe('exact');
    expect((await service.get('SG', 'JP') as { policy: { visaType: string } }).policy.visaType).toBe('VISA_FREE');
    expect((await service.get('CN', 'KR') as { matchLevel: string }).matchLevel).toBe('region-fallback');
    expect((await service.get('SG', 'FR') as { matchLevel: string }).matchLevel).toBe('global-fallback');
    expect((await service.get('SG', 'KR') as { available: boolean }).available).toBe(false);
    expect((await service.get('CN', 'JP') as { expired: boolean }).expired).toBe(true);
  });

  it('CN → IE 保留明确的 null 签证停留期和护照有效期，不自行推断', async () => {
    const ireland = { ...makeVisa('CN', 'IE', 'VISA_REQUIRED'), visaRequirement: 'REQUIRED', maxStayDays: null,
      passportRequired: null, passportValidityMonths: null, entrySummary: null, requirementText: null, sourceUrl: null } as VisaRecord;
    const repo = { candidates: async () => [ireland], list: async () => [ireland], findPair: async () => ireland, findById: async () => ireland } as VisaRepository;
    const result = await new VisaService(repo).get('CN', 'IE') as Record<string, unknown>;
    expect(result).toMatchObject({ visaRequirement: 'REQUIRED', maxStayDays: null, passportRequired: null,
      passportValidityMonths: null, entrySummary: null, requirementText: null, sourceUrl: null });
  });

  it('版本快照和差异只报告变化模块', async () => {
    const versions = [{ module: ContentModule.visa, version: 2 }] as ContentVersion[];
    const repo = { all: async () => versions } as ContentVersionRepository;
    const service = new ContentService(emptyContent, repo, emptyCountries);
    const snapshot = await service.snapshot();
    expect(snapshot.visa).toBe(2);
    expect(snapshot.country).toBe(0);
    expect((await service.diff({ local: { visa: 1 } }) as { changedModules: string[] }).changedModules).toEqual(['visa']);
  });
});

describe('管理员与字段日志', () => {
  const config = { AUTH_SECRET: 'a'.repeat(64) } as AppConfig;
  it('seed 与登录共用 scrypt；错误密码统一返回未授权', async () => {
    const admin = { id: 'a1', username: 'editor', role: 'CONTENT_ADMIN', isActive: true,
      passwordHash: await hashPassword('correct-password') } as AdminUser;
    const records: string[] = [];
    const repo = { find: async () => admin, findById: async () => admin } as AdminRepository;
    const logs = { create: async () => { records.push('LOGIN'); }, list: async () => ({ items: [], total: 0 }) } as OperationLogRepository;
    const service = new AuthService(repo, logs, config);
    const login = await service.login({ username: 'editor', password: 'correct-password' }, 'r1') as { token: string };
    expect(login.token.split('.')).toHaveLength(3);
    expect(records).toEqual(['LOGIN']);
    await expect(service.login({ username: 'editor', password: 'wrong' }, 'r2')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const guard = new AdminGuard(repo, config);
    const request = { header: () => `Bearer ${login.token}` };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
    expect(await guard.canActivate(context)).toBe(true);
    expect((request as { admin?: { role: string } }).admin?.role).toBe('CONTENT_ADMIN');
    const unauthorized = { switchToHttp: () => ({ getRequest: () => ({ header: () => undefined }) }) } as ExecutionContext;
    await expect(guard.canActivate(unauthorized)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('角色守卫拒绝无权限操作，日志 diff 过滤技术字段', () => {
    const reflector = new Reflector();
    const handler = () => {};
    Reflect.defineMetadata('roles', ['SUPER_ADMIN'], handler);
    const context = { getHandler: () => handler, getClass: () => class Test {},
      switchToHttp: () => ({ getRequest: () => ({ admin: { role: 'VIEWER' } }) }) } as unknown as ExecutionContext;
    expect(() => new RoleGuard(reflector).canActivate(context)).toThrowError();
    expect(computeChanges({ maxStayDays: 60, version: 1, id: 'v1' }, { maxStayDays: 90, version: 2, id: 'v1' }))
      .toEqual([{ field: 'maxStayDays', before: 60, after: 90 }]);
  });
});
