import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Country } from '@prisma/client';
import { InMemoryPlanRepository, InMemoryTripInviteRepository, InMemoryTripRepository } from '../src/prisma/in-memory';
import { PlanService } from '../src/modules/plan';
import { TripCollaborationService } from '../src/modules/trip-collaboration';
import { TripService } from '../src/modules/trip';
import type { CityRepository } from '../src/prisma/repositories';

const countries = [{ code: 'JP', continentCode: 'AS', nameZh: '日本' }, { code: 'KR', continentCode: 'AS', nameZh: '韩国' }] as Country[];
const cities: CityRepository = { list: async () => [] };
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

async function setup() {
  const trips = new InMemoryTripRepository(countries);
  const inviteRepo = new InMemoryTripInviteRepository(trips);
  const plans = new InMemoryPlanRepository();
  const trip = await trips.create({ userId: 'user-a', title: '日本旅行', notes: '加入前不可见的私人备注', startDate: new Date('2026-10-01') });
  await trips.addDestination({ tripId: trip.id, countryCode: 'JP', continentCode: 'AS', orderIndex: 0 });
  return { trips, inviteRepo, plans, tripId: trip.id,
    collaboration: new TripCollaborationService(trips, inviteRepo),
    tripService: new TripService(trips, cities), planService: new PlanService(plans, trips) };
}

describe('多人旅行邀请与成员访问', () => {
  it('安全创建邀请、公开预览仅泄漏基础旅行信息，并加入同一旅行', async () => {
    const { collaboration, trips, tripId, planService } = await setup();
    const created = await collaboration.createInvite(tripId, 'user-a') as { token: string; path: string };
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(created.path).toContain(encodeURIComponent(created.token));
    const rawPreview = await collaboration.preview(created.token, 'ip-preview') as Record<string, unknown>;
    expect(rawPreview).not.toHaveProperty('tripId');
    expect(JSON.stringify(rawPreview)).not.toContain('加入前不可见的私人备注');
    expect(rawPreview).toMatchObject({ trip: { title: '日本旅行', destinations: [{ countryCode: 'JP', countryName: '日本' }] },
      owner: { nickname: 'user-a' }, memberCount: 1 });

    const concurrentJoins = await Promise.all(Array.from({ length: 8 }, () => collaboration.join(created.token, 'user-b', 'ip-join')));
    expect(concurrentJoins.filter((result) => !(result as { alreadyJoined: boolean }).alreadyJoined)).toHaveLength(1);
    expect(concurrentJoins.every((result) => (result as { tripId: string }).tripId === tripId)).toBe(true);
    expect(await collaboration.join(created.token, 'user-b', 'ip-join')).toMatchObject({ alreadyJoined: true });
    expect(await trips.membership(tripId, 'user-b')).toMatchObject({ role: 'MEMBER', status: 'ACTIVE' });
    expect((await trips.list('user-b', 1, 10)).items.map((item) => item.id)).toContain(tripId);

    const added = await planService.create('user-b', tripId, { title: '东京塔', stage: 'TRAVELING', itemType: 'ATTRACTION',
      scope: 'COUNTRY', sourceType: 'USER', sourceCountryCode: 'JP' }) as { planItem: { id: string } };
    expect(await planService.list('user-a', tripId)).toMatchObject([expect.objectContaining({ id: added.planItem.id, title: '东京塔' })]);
  });

  it('成员可以读取 Trip 并协作计划；非成员不能读取或写入', async () => {
    const { collaboration, tripService, planService, tripId } = await setup();
    const invite = await collaboration.createInvite(tripId, 'user-a') as { token: string };
    await collaboration.join(invite.token, 'user-b', 'join-b');
    expect(await tripService.get('user-b', tripId)).toMatchObject({ memberRole: 'MEMBER' });
    await expect(tripService.get('outsider', tripId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(planService.create('outsider', tripId, { title: '偷看', stage: 'TRAVELING', itemType: 'ATTRACTION',
      scope: 'TRIP', sourceType: 'USER' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(tripService.update('user-b', tripId, { title: '不允许改旅行名' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(tripService.addDestination('user-b', tripId, { countryCode: 'KR' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('成员可以退出并通过仍有效的邀请重新加入；Owner 可移除成员且不可自行退出', async () => {
    const { collaboration, trips, tripId } = await setup();
    const invite = await collaboration.createInvite(tripId, 'user-a') as { token: string };
    await collaboration.join(invite.token, 'user-b', 'join-b');
    await expect(collaboration.leave(tripId, 'user-a')).rejects.toMatchObject({ code: 'CONFLICT' });
    await collaboration.leave(tripId, 'user-b');
    expect((await trips.list('user-b', 1, 10)).total).toBe(0);
    expect(await collaboration.join(invite.token, 'user-b', 'join-b')).toMatchObject({ alreadyJoined: false });
    await collaboration.removeMember(tripId, 'user-a', 'user-b');
    expect((await trips.list('user-b', 1, 10)).total).toBe(0);
    await expect(collaboration.removeMember(tripId, 'user-a', 'user-a')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('只有 Owner 可以解散旅行', async () => {
    const { tripService, tripId, trips } = await setup();
    await expect(tripService.dissolve('user-b', tripId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(tripService.dissolve('user-a', tripId)).resolves.toEqual({ dissolved: true });
    expect(await trips.find(tripId)).toBeNull();
  });

  it('处理 Owner 重复加入、邀请过期、撤销和次数耗尽', async () => {
    const { collaboration, inviteRepo, tripId } = await setup();
    const own = await collaboration.createInvite(tripId, 'user-a') as { token: string };
    expect(await collaboration.join(own.token, 'user-a', 'owner-repeat')).toMatchObject({ alreadyJoined: true });

    const expired = 'expired-invite-token-000000000000000000000';
    await inviteRepo.create({ tripId, createdByUserId: 'user-a', tokenHash: sha256(expired), expiresAt: new Date(0), maxUses: 20 });
    await expect(collaboration.preview(expired, 'expired-preview')).rejects.toMatchObject({ code: 'INVITE_EXPIRED' });

    const revoked = await collaboration.createInvite(tripId, 'user-a') as { token: string };
    await collaboration.revokeInvites(tripId, 'user-a');
    await expect(collaboration.preview(revoked.token, 'revoked-preview')).rejects.toMatchObject({ code: 'INVITE_REVOKED' });
    await expect(collaboration.preview('missing-invite-token-000000000000000000000', 'missing-preview'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });

    const full = 'exhausted-invite-token-000000000000000000';
    await inviteRepo.create({ tripId, createdByUserId: 'user-a', tokenHash: sha256(full), expiresAt: new Date(Date.now() + 60_000), maxUses: 1 });
    await collaboration.join(full, 'user-c', 'user-c-join');
    await expect(collaboration.join(full, 'user-d', 'user-d-join')).rejects.toMatchObject({ code: 'INVITE_EXHAUSTED' });
  });
});
