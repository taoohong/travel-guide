import { describe, expect, it } from 'vitest';
import type { Country } from '@prisma/client';
import { InMemoryPlanRepository, InMemoryTripRepository } from '../src/prisma/in-memory';
import { PlanService } from '../src/modules/plan';
import { TripService } from '../src/modules/trip';
import type { CityRepository } from '../src/prisma/repositories';

const countries = [
  { code: 'JP', continentCode: 'AS' }, { code: 'KR', continentCode: 'AS' }, { code: 'FR', continentCode: 'EU' },
] as Country[];
const cities: CityRepository = { list: async () => [] };
const item = { title: '护照原件', stage: 'PREPARING', itemType: 'VISA_MATERIAL', scope: 'TRIP', sourceType: 'GUIDE', dedupeKey: 'passport' };

async function setup(): Promise<{ trips: InMemoryTripRepository; plans: InMemoryPlanRepository; tripId: string; plan: PlanService; trip: TripService }> {
  const trips = new InMemoryTripRepository(countries);
  const plans = new InMemoryPlanRepository();
  const row = await trips.create({ userId: 'u1', title: '东亚旅行' });
  return { trips, plans, tripId: row.id, plan: new PlanService(plans, trips), trip: new TripService(trips, cities) };
}

describe('PlanService 与数据库等价的内存仓储', () => {
  it('跨国家 passport 共用 Core 去重键，8 次并发只有一次创建', async () => {
    const { plan, plans, tripId } = await setup();
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      plan.create('u1', tripId, { ...item, sourceCountryCode: index % 2 ? 'JP' : 'KR' }) as Promise<{ created: boolean }>));
    expect(responses.filter((response) => response.created)).toHaveLength(1);
    expect((await plans.list(tripId)).map((row) => row.dedupeHash)).toEqual(['k:passport']);
  });

  it('来源键和标题分别回退，USER 无有效业务键时保留多个 null', async () => {
    const { plan, plans, tripId } = await setup();
    await plan.create('u1', tripId, { title: '浅草寺', stage: 'TRAVELING', itemType: 'ATTRACTION', scope: 'COUNTRY',
      sourceType: 'ATTRACTION', sourceId: 'sensoji', sourceCountryCode: 'JP' });
    await plan.create('u1', tripId, { title: '转换插头', stage: 'PREPARING', itemType: 'PACKING_ITEM', scope: 'TRIP', sourceType: 'GUIDE' });
    await plan.create('u1', tripId, { title: '自由安排', stage: 'TRAVELING', itemType: 'ATTRACTION', scope: 'TRIP', sourceType: 'USER' });
    await plan.create('u1', tripId, { title: '自由安排', stage: 'TRAVELING', itemType: 'ATTRACTION', scope: 'TRIP', sourceType: 'USER' });
    expect((await plans.list(tripId)).map((row) => row.dedupeHash)).toEqual(expect.arrayContaining([
      's:ATTRACTION:JP:sensoji', 'k:PACKING_ITEM:PREPARING:转换插头', null, null,
    ]));
    expect(await plans.list(tripId)).toHaveLength(4);
  });

  it('删除后可重新加入，仓储返回深拷贝', async () => {
    const { plan, plans, tripId } = await setup();
    const created = await plan.create('u1', tripId, item) as { planItem: { id: string } };
    const first = (await plans.list(tripId))[0]!;
    first.title = '污染本地副本';
    expect((await plans.list(tripId))[0]!.title).toBe('护照原件');
    await plan.remove('u1', tripId, created.planItem.id);
    expect((await plan.create('u1', tripId, item) as { created: boolean }).created).toBe(true);
  });

  it('COUNTRY 缺国家代码返回校验错误', async () => {
    const { plan, tripId } = await setup();
    await expect(plan.create('u1', tripId, { ...item, scope: 'COUNTRY' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('TripService', () => {
  it('创建、列出、读取和用户确认相邻阶段', async () => {
    const { trip, tripId } = await setup();
    expect((await trip.list('u1', {}) as { total: number }).total).toBe(1);
    expect((await trip.get('u1', tripId) as { currentStage: string }).currentStage).toBe('PREPARING');
    await expect(trip.confirm('u1', tripId, { stage: 'COMPLETED' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await trip.confirm('u1', tripId, { stage: 'PREPARING' }) as { status: string }).status).toBe('PREPARING');
  });

  it('日本→韩国→日本允许重复；跨大陆后删除中间节点会连续重排', async () => {
    const { trip, trips, tripId } = await setup();
    await trip.addDestination('u1', tripId, { countryCode: 'JP' });
    const middle = await trip.addDestination('u1', tripId, { countryCode: 'KR' }) as { id: string };
    await trip.addDestination('u1', tripId, { countryCode: 'JP' });
    await trip.addDestination('u1', tripId, { countryCode: 'FR' });
    expect((await trips.find(tripId))!.destinations.map((row) => row.countryCode)).toEqual(['JP', 'KR', 'JP', 'FR']);
    await trip.removeDestination('u1', tripId, middle.id);
    expect((await trips.find(tripId))!.destinations.map((row) => row.orderIndex)).toEqual([0, 1, 2]);
  });

  it('编辑旅行名称、日期、人员和备注，未提交的日期保持不变', async () => {
    const trips = new InMemoryTripRepository(countries);
    const row = await trips.create({ userId: 'u1', title: '日本旅行', startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-07T00:00:00.000Z'), travelers: ['小明'] });
    const service = new TripService(trips, cities);
    await service.update('u1', row.id, { title: '东京秋日旅行', travelers: ['小明', '小红'], notes: '带相机' });
    const updated = await trips.find(row.id);
    expect(updated).toMatchObject({ title: '东京秋日旅行', travelers: ['小明', '小红'], notes: '带相机',
      startDate: new Date('2026-10-01T00:00:00.000Z'), endDate: new Date('2026-10-07T00:00:00.000Z') });
    await service.update('u1', row.id, { startDate: null, endDate: null });
    expect(await trips.find(row.id)).toMatchObject({ startDate: null, endDate: null });
  });
});
