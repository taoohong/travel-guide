import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  ContentModule,
  PlanItemType,
  PlanScope,
  PlanSourceType,
  PlanStage,
  Prisma,
  PrismaClient,
  VisaType,
} from '@prisma/client';

const prisma = new PrismaClient();

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function main(): Promise<void> {
  const policies = await prisma.visaPolicy.findMany({
    where: { OR: [
      { passportRegion: 'CN', destinationCountryCode: 'JP' },
      { passportRegion: 'SG', destinationCountryCode: 'JP' },
      { passportRegion: 'CN', destinationCountryCode: 'KR' },
      { passportRegion: 'CN', destinationCountryCode: 'FR' },
    ] },
  });
  assert.equal(policies.length, 4);
  assert.equal(policies.find((policy) => policy.passportRegion === 'CN' && policy.destinationCountryCode === 'JP')?.visaType, VisaType.VISA_REQUIRED);
  assert.equal(policies.find((policy) => policy.passportRegion === 'SG' && policy.destinationCountryCode === 'JP')?.visaType, VisaType.VISA_FREE);

  const destinations = await prisma.tripDestination.findMany({ where: { tripId: 'seed-trip' }, orderBy: { orderIndex: 'asc' } });
  assert.deepEqual(destinations.map((destination) => destination.countryCode), ['JP', 'KR', 'JP']);
  assert.deepEqual(destinations.map((destination) => destination.orderIndex), [0, 1, 2]);
  await assert.rejects(
    prisma.tripDestination.create({ data: { tripId: 'seed-trip', countryCode: 'FR', continentCode: 'EU', orderIndex: 1 } }),
    isUniqueViolation,
  );

  const passport = await prisma.packingItem.findUniqueOrThrow({ where: { code: 'passport' }, include: { countries: true } });
  assert.equal(passport.dedupeKey, 'passport');
  assert(['JP', 'KR'].every((code) => passport.countries.some((link) => link.countryCode === code)));
  assert.equal(await prisma.packingItem.count({ where: { code: 'universal_power_adapter' } }), 1);

  const modules = await prisma.contentVersion.findMany();
  assert.deepEqual(modules.map((row) => row.module).sort(), Object.values(ContentModule).sort());
  assert(modules.every((row) => row.version >= 0));

  const mediaColumns = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MediaAsset'
  `;
  assert.deepEqual(
    ['path', 'url', 'width', 'height', 'bytes', 'mimeType', 'usage'].filter((name) => !mediaColumns.some((column) => column.column_name === name)),
    [],
  );
  assert(mediaColumns.every((column) => column.data_type !== 'bytea'));

  const suffix = randomUUID();
  const ids = [`verify-plan-1-${suffix}`, `verify-plan-2-${suffix}`, `verify-plan-3-${suffix}`];
  const base = {
    tripId: 'seed-trip',
    stage: PlanStage.PREPARING,
    itemType: PlanItemType.PACKING_ITEM,
    scope: PlanScope.TRIP,
    title: '数据库唯一约束验证',
    sourceType: PlanSourceType.USER,
  };
  try {
    await prisma.planItem.create({ data: { ...base, id: ids[0]!, dedupeHash: `verify:${suffix}` } });
    await assert.rejects(
      prisma.planItem.create({ data: { ...base, id: ids[1]!, dedupeHash: `verify:${suffix}` } }),
      isUniqueViolation,
    );
    await prisma.planItem.create({ data: { ...base, id: ids[1]!, dedupeHash: null } });
    await prisma.planItem.create({ data: { ...base, id: ids[2]!, dedupeHash: null } });
    assert.equal(await prisma.planItem.count({ where: { id: { in: ids } } }), 3);
  } finally {
    await prisma.planItem.deleteMany({ where: { id: { in: ids } } });
  }

  console.log('Verified visa pairs, repeated destinations, packing links, content versions, media metadata, and database uniqueness/null behavior.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
