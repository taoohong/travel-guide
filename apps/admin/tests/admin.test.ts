import { describe, expect, it } from 'vitest';
import { ApiError } from '@travel-guide/api-client';
import { can, type Role } from '../src/app/auth';
import { contentConfigs, displayName, validateMapping } from '../src/content/config';
import { formValues, requestValues } from '../src/pages/ContentManager';
import { errorText } from '../src/services/api';

describe('CMS 权限与结构化内容', () => {
  it('四种角色只显示其允许的操作，未登录不能读取', () => {
    const cases: Array<[Role, boolean, boolean, boolean]> = [
      ['SUPER_ADMIN', true, true, true], ['CONTENT_ADMIN', true, false, true],
      ['REVIEWER', false, true, true], ['VIEWER', false, false, false],
    ];
    for (const [role, edit, publish, upload] of cases) {
      expect(can(role, 'read')).toBe(true);
      expect(can(role, 'edit')).toBe(edit);
      expect(can(role, 'publish')).toBe(publish);
      expect(can(role, 'upload')).toBe(upload);
    }
    expect(can(undefined, 'read')).toBe(false);
  });

  it('每种内容都有结构化表单，国家和签证有独立筛选', () => {
    expect(Object.keys(contentConfigs)).toHaveLength(11);
    for (const config of Object.values(contentConfigs)) expect(config.sections.flatMap((section) => section.fields).length).toBeGreaterThan(2);
    expect(contentConfigs.countries.filters?.map((item) => item.name)).toEqual(expect.arrayContaining(['keyword', 'continentCode', 'online']));
    expect(contentConfigs.visa.filters?.map((item) => item.name)).toEqual(expect.arrayContaining(['passportRegion', 'destinationCountryCode', 'visaType', 'stale']));
  });

  it('护照地区和目的地共同识别签证记录，材料映射必填项校验', () => {
    expect(displayName('visa', { passportRegion: 'CN', destinationCountryCode: 'JP', title: '需签证' }))
      .not.toBe(displayName('visa', { passportRegion: 'SG', destinationCountryCode: 'JP', title: '免签' }));
    expect(validateMapping({ actionable: false })).toBeNull();
    expect(validateMapping({ actionable: true, targetStage: 'PREPARING', itemType: 'VISA_MATERIAL', scope: 'TRIP', dedupeKey: 'passport' })).toBeNull();
    expect(validateMapping({ actionable: true, targetStage: 'PREPARING' })).toContain('阶段、类型和范围');
  });

  it('表单只转换日期与空值，数组和布尔值保持结构', () => {
    const form = formValues({ id: 'a', effectiveFrom: '2026-09-22T00:00:00.000Z', corePolicy: ['政策'], online: false });
    expect(form.effectiveFrom).toMatch(/^2026-09-22T/);
    expect(form.corePolicy).toEqual(['政策']);
    expect(requestValues({ ...form, summary: '' })).toMatchObject({ corePolicy: ['政策'], online: false, summary: null });
  });

  it('401 与 403 有不同文案，500 隐藏内部信息但保留请求编号', () => {
    expect(errorText(new ApiError('HTTP', 'UNAUTHORIZED', 'x', 401))).toContain('登录已失效');
    expect(errorText(new ApiError('HTTP', 'FORBIDDEN', 'x', 403))).toContain('无权限');
    const text = errorText(new ApiError('HTTP', 'INTERNAL_ERROR', 'SQL secret', 500, {}, 'request-1'));
    expect(text).toContain('request-1');
    expect(text).not.toContain('secret');
  });
});
