import { ContentModule, ContentStatus, PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password';
import { countries } from './countries.seed';

const prisma = new PrismaClient();
const continents = [
  { code: 'AS', nameZh: '亚洲', nameEn: 'Asia', sortOrder: 1, centerLatitude: 34, centerLongitude: 105 },
  { code: 'EU', nameZh: '欧洲', nameEn: 'Europe', sortOrder: 2, centerLatitude: 52, centerLongitude: 13 },
  { code: 'NA', nameZh: '北美洲', nameEn: 'North America', sortOrder: 3, centerLatitude: 42, centerLongitude: -100 },
  { code: 'AF', nameZh: '非洲', nameEn: 'Africa', sortOrder: 4, centerLatitude: 5, centerLongitude: 20 },
  { code: 'SA', nameZh: '南美洲', nameEn: 'South America', sortOrder: 5, centerLatitude: -15, centerLongitude: -60 },
  { code: 'OC', nameZh: '大洋洲', nameEn: 'Oceania', sortOrder: 6, centerLatitude: -25, centerLongitude: 135 },
];

async function main(): Promise<void> {
  for (const continent of continents) {
    await prisma.continent.upsert({ where: { code: continent.code }, create: { ...continent, status: ContentStatus.PUBLISHED }, update: { ...continent, status: ContentStatus.PUBLISHED } });
  }

  for (const country of countries) {
    await prisma.country.upsert({ where: { code: country.code }, create: { ...country, status: ContentStatus.PUBLISHED, online: true }, update: { ...country, status: ContentStatus.PUBLISHED, online: true } });
  }

  for (const city of [
    { id: 'seed-city-tokyo', countryCode: 'JP', code: 'TYO', nameZh: '东京', nameEn: 'Tokyo' },
    { id: 'seed-city-seoul', countryCode: 'KR', code: 'SEL', nameZh: '首尔', nameEn: 'Seoul' },
    { id: 'seed-city-paris', countryCode: 'FR', code: 'PAR', nameZh: '巴黎', nameEn: 'Paris' },
  ]) {
    await prisma.city.upsert({ where: { id: city.id }, create: { ...city, status: ContentStatus.PUBLISHED },
      update: { status: ContentStatus.PUBLISHED } });
  }

  for (const passport of [
    { code: 'CN', nameZh: '中国大陆', nameEn: 'Mainland China' },
    { code: 'SG', nameZh: '新加坡', nameEn: 'Singapore' },
    { code: '*', nameZh: '所有护照地区', nameEn: 'All passport regions' },
  ]) {
    await prisma.passportRegion.upsert({ where: { code: passport.code }, create: passport, update: passport });
  }

  for (const policy of [
    { passportRegion: 'CN', destinationCountryCode: 'JP', visaType: 'VISA_REQUIRED' as const, title: '中国大陆护照赴日本', corePolicy: ['出行前核对并办理适用签证'] },
    { passportRegion: 'SG', destinationCountryCode: 'JP', visaType: 'VISA_FREE' as const, title: '新加坡护照赴日本', corePolicy: ['以出行时官方政策为准'] },
    { passportRegion: 'CN', destinationCountryCode: 'KR', visaType: 'VISA_REQUIRED' as const, title: '中国大陆护照赴韩国', corePolicy: ['出行前核对并办理适用签证'] },
    { passportRegion: 'CN', destinationCountryCode: 'FR', visaType: 'VISA_REQUIRED' as const, title: '中国大陆护照赴法国', corePolicy: ['出行前核对并办理适用签证'] },
  ]) {
    await prisma.visaPolicy.upsert({
      where: { passportRegion_destinationCountryCode: { passportRegion: policy.passportRegion, destinationCountryCode: policy.destinationCountryCode } },
      create: { ...policy, status: ContentStatus.PUBLISHED },
      update: { status: ContentStatus.PUBLISHED },
    });
  }
  const jpPolicy = await prisma.visaPolicy.findUniqueOrThrow({ where: { passportRegion_destinationCountryCode: {
    passportRegion: 'CN', destinationCountryCode: 'JP' } } });
  await prisma.visaRequirement.upsert({ where: { id: 'seed-visa-passport-jp' },
    create: { id: 'seed-visa-passport-jp', visaPolicyId: jpPolicy.id, title: '护照原件', required: true,
      actionable: true, targetStage: 'PREPARING', itemType: 'VISA_MATERIAL', scope: 'TRIP', dedupeKey: 'passport',
      status: ContentStatus.PUBLISHED }, update: { status: ContentStatus.PUBLISHED } });

  for (const item of [
    { code: 'passport', name: '护照', universal: true, dedupeKey: 'passport' },
    { code: 'universal_power_adapter', name: '转换插头', universal: true, dedupeKey: 'universal_power_adapter' },
  ]) {
    const saved = await prisma.packingItem.upsert({ where: { code: item.code }, create: { ...item, status: ContentStatus.PUBLISHED }, update: { status: ContentStatus.PUBLISHED } });
    for (const countryCode of ['JP', 'KR']) {
      await prisma.countryPacking.upsert({
        where: { countryCode_packingItemId: { countryCode, packingItemId: saved.id } },
        create: { countryCode, packingItemId: saved.id },
        update: {},
      });
    }
  }

  await prisma.transportOption.upsert({ where: { id: 'seed-jp-rail' }, create: { id: 'seed-jp-rail', countryCode: 'JP',
    name: '铁路', kind: 'LOCAL', description: '出行前核对线路与票价', status: ContentStatus.PUBLISHED },
    update: { status: ContentStatus.PUBLISHED } });
  await prisma.travelTip.upsert({ where: { id: 'seed-jp-tip' }, create: { id: 'seed-jp-tip', countryCode: 'JP',
    title: '出行提醒', content: '以当地官方公告为准', category: 'GENERAL', status: ContentStatus.PUBLISHED },
    update: { status: ContentStatus.PUBLISHED } });
  await prisma.attraction.upsert({ where: { id: 'seed-jp-attraction' }, create: { id: 'seed-jp-attraction', countryCode: 'JP',
    cityCode: 'TYO', nameZh: '示例景点', description: '用于本地 API 验证', actionable: true, targetStage: 'TRAVELING',
    itemType: 'ATTRACTION', scope: 'COUNTRY', status: ContentStatus.PUBLISHED }, update: { status: ContentStatus.PUBLISHED } });
  const travelApp = await prisma.travelApp.upsert({ where: { code: 'seed_navigation' }, create: { code: 'seed_navigation',
    name: '示例导航工具', purpose: '本地 API 验证', status: ContentStatus.PUBLISHED }, update: { status: ContentStatus.PUBLISHED } });
  await prisma.countryTravelApp.upsert({ where: { countryCode_travelAppId: { countryCode: 'JP', travelAppId: travelApp.id } },
    create: { countryCode: 'JP', travelAppId: travelApp.id }, update: {} });

  await prisma.user.upsert({
    where: { id: 'seed-user' },
    create: { id: 'seed-user', nickname: '本地验证用户', passportRegion: 'CN' },
    update: {},
  });
  const seedTrip = await prisma.trip.upsert({
    where: { id: 'seed-trip' },
    create: { id: 'seed-trip', userId: 'seed-user', title: '日本 → 韩国 → 日本' },
    update: {},
  });
  await prisma.tripMember.upsert({ where: { tripId_userId: { tripId: seedTrip.id, userId: 'seed-user' } },
    create: { tripId: seedTrip.id, userId: 'seed-user', role: 'OWNER', status: 'ACTIVE' },
    update: { role: 'OWNER', status: 'ACTIVE' } });
  for (const destination of [
    { id: 'seed-destination-0', countryCode: 'JP', continentCode: 'AS', orderIndex: 0 },
    { id: 'seed-destination-1', countryCode: 'KR', continentCode: 'AS', orderIndex: 1 },
    { id: 'seed-destination-2', countryCode: 'JP', continentCode: 'AS', orderIndex: 2 },
  ]) {
    await prisma.tripDestination.upsert({
      where: { id: destination.id },
      create: { ...destination, tripId: 'seed-trip' },
      update: {},
    });
  }

  for (const module of Object.values(ContentModule)) {
    await prisma.contentVersion.upsert({ where: { module }, create: { module, version: 0 }, update: {} });
  }

  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (password) {
    await prisma.adminUser.upsert({ where: { username: 'local-admin' },
      create: { username: 'local-admin', passwordHash: await hashPassword(password), role: 'SUPER_ADMIN' },
      update: { passwordHash: await hashPassword(password), role: 'SUPER_ADMIN', isActive: true } });
  }

  console.log(`Seeded ${continents.length} continents, ${countries.length} countries, demo content, and content versions.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
