import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { ContentModule, CountryGuideSectionCategory, Prisma, PrismaClient, VisaRequirementType } from '@prisma/client';

const models = Prisma.dmmf.datamodel.models;
const enumValues = (name: string) => Prisma.dmmf.datamodel.enums.find((item) => item.name === name)?.values.map((value) => value.name);

describe('国家指南与签证 Prisma 模型', () => {
  it('国家指南章节通过国家外键关联，并允许同类别多条标题', () => {
    const section = models.find((item) => item.name === 'CountryGuideSection');
    expect(section?.fields.map((field) => field.name)).toEqual(expect.arrayContaining([
      'countryCode', 'category', 'title', 'content', 'sortOrder', 'sourceProvider', 'sourceUrl',
      'sourceUpdatedAt', 'importedAt', 'lastVerifiedAt', 'contentHash', 'status',
    ]));
    expect(section?.fields.find((field) => field.name === 'country')?.relationName).toBeTruthy();
    expect(models.find((item) => item.name === 'Country')?.fields.find((field) => field.name === 'guideSections')?.kind).toBe('object');
    expect(enumValues('CountryGuideSectionCategory')).toEqual([
      'COUNTRY_OVERVIEW', 'ENTRY_RESIDENCE', 'TRAVEL_RISK', 'SAFETY', 'TRANSPORT', 'PRICE_MEDICAL', 'PRACTICAL_INFO',
    ]);

    const sections: Prisma.CountryGuideSectionCreateManyInput[] = [
      { countryCode: 'IE', category: CountryGuideSectionCategory.TRANSPORT, title: '空中交通', content: '航班资料', sourceProvider: '中国领事服务网', sourceUrl: 'https://cs.mfa.gov.cn/' },
      { countryCode: 'IE', category: CountryGuideSectionCategory.TRANSPORT, title: '陆路交通', content: '陆路资料', sourceProvider: '中国领事服务网', sourceUrl: 'https://cs.mfa.gov.cn/' },
    ];
    expect(sections.map((item) => item.title)).toEqual(['空中交通', '陆路交通']);
  });

  it('签证字段保留 CN → IE 的 REQUIRED 与未知停留期 null 表达', () => {
    expect(enumValues('VisaRequirementType')).toEqual([
      'REQUIRED', 'VISA_FREE', 'VISA_ON_ARRIVAL', 'E_VISA', 'CONDITIONAL', 'UNKNOWN',
    ]);
    const policy: Prisma.VisaPolicyCreateInput = {
      passport: { connect: { code: 'CN' } }, destinationCountryCode: 'IE',
      visaRequirement: VisaRequirementType.REQUIRED, title: '爱尔兰签证政策', maxStayDays: null,
      passportRequired: null, passportValidityMonths: null,
      sourceProvider: '中国领事服务网', sourceUrl: 'https://cs.mfa.gov.cn/',
    };
    expect(policy).toMatchObject({ destinationCountryCode: 'IE', visaRequirement: 'REQUIRED', maxStayDays: null });
    expect(models.find((item) => item.name === 'VisaPolicy')?.fields.map((field) => field.name)).toEqual(expect.arrayContaining([
      'passportRegion', 'destinationCountryCode', 'visaRequirement', 'maxStayDays', 'passportRequired',
      'passportValidityMonths', 'entrySummary', 'requirementText', 'sourceProvider', 'sourceUrl', 'lastVerifiedAt',
    ]));
  });

  it('CountryGuide 和 visa 是互相独立的内容版本模块', () => {
    expect(enumValues('ContentModule')).toContain(ContentModule.countryGuide);
    expect(models.find((item) => item.name === 'ContentVersion')?.fields.find((field) => field.name === 'module')?.isId).toBe(true);
  });
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) describe('国家指南 PostgreSQL 持久化', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl! } } });
  afterAll(async () => { await prisma.$disconnect(); });

  it('保存多条同类别章节、CN → IE 签证来源与彼此独立的版本', async () => {
    const suffix = randomUUID().replaceAll('-', '');
    const continentCode = `TG${suffix}`;
    const countryCode = `TG${suffix}`;
    const rollback = new Error('rollback test transaction');

    await expect(prisma.$transaction(async (tx) => {
      await tx.continent.create({ data: { code: continentCode, nameZh: '测试洲', nameEn: 'Test continent' } });
      await tx.country.create({ data: { code: countryCode, continentCode, nameZh: '测试国', nameEn: 'Test country', latitude: 0, longitude: 0 } });
      if (!await tx.passportRegion.findUnique({ where: { code: 'CN' } })) {
        await tx.passportRegion.create({ data: { code: 'CN', nameZh: '中国大陆护照', nameEn: 'Chinese mainland passport' } });
      }

      const sourceUrl = 'https://cs.mfa.gov.cn/';
      const sourceUpdatedAt = new Date('2026-09-20T00:00:00.000Z');
      await tx.countryGuideSection.createMany({ data: [
        { countryCode, category: CountryGuideSectionCategory.TRANSPORT, title: '空中交通', content: '航班资料', sourceProvider: '中国领事服务网', sourceUrl, sourceUpdatedAt, contentHash: 'air-hash' },
        { countryCode, category: CountryGuideSectionCategory.TRANSPORT, title: '陆路交通', content: '陆路资料', sourceProvider: '中国领事服务网', sourceUrl, sourceUpdatedAt, contentHash: 'land-hash' },
      ] });
      const sections = await tx.countryGuideSection.findMany({ where: { countryCode }, orderBy: { title: 'asc' } });
      expect(sections.map(({ category, title }) => [category, title])).toEqual([
        ['TRANSPORT', '空中交通'], ['TRANSPORT', '陆路交通'],
      ]);
      expect(sections[0]).toMatchObject({ sourceProvider: '中国领事服务网', sourceUrl, contentHash: 'air-hash' });
      expect(sections[0]?.sourceUpdatedAt?.toISOString()).toBe(sourceUpdatedAt.toISOString());

      const pair = { passportRegion: 'CN', destinationCountryCode: 'IE' };
      const priorPolicy = await tx.visaPolicy.findUnique({ where: { passportRegion_destinationCountryCode: pair } });
      if (priorPolicy) await tx.visaPolicy.delete({ where: { passportRegion_destinationCountryCode: pair } });
      const policy = await tx.visaPolicy.create({ data: {
        ...pair, visaRequirement: VisaRequirementType.REQUIRED, title: '爱尔兰签证政策', maxStayDays: null,
        passportRequired: null, passportValidityMonths: null, entrySummary: '需提前申请签证',
        requirementText: '请以官方政策为准', sourceProvider: '中国领事服务网', sourceUrl,
      } });
      expect(policy).toMatchObject({ ...pair, visaRequirement: 'REQUIRED', maxStayDays: null,
        passportRequired: null, passportValidityMonths: null, sourceProvider: '中国领事服务网', sourceUrl });

      const guideModule = ContentModule.countryGuide;
      const visaModule = ContentModule.visa;
      await tx.contentVersion.upsert({ where: { module: guideModule }, create: { module: guideModule, version: 10 }, update: { version: 10 } });
      await tx.contentVersion.upsert({ where: { module: visaModule }, create: { module: visaModule, version: 20 }, update: { version: 20 } });
      await tx.contentVersion.update({ where: { module: guideModule }, data: { version: { increment: 1 } } });
      expect(await tx.contentVersion.findUnique({ where: { module: visaModule } })).toMatchObject({ version: 20 });
      await tx.contentVersion.update({ where: { module: visaModule }, data: { version: { increment: 1 } } });
      expect(await tx.contentVersion.findUnique({ where: { module: guideModule } })).toMatchObject({ version: 11 });

      throw rollback;
    })).rejects.toBe(rollback);
  });
});
