import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TripStatus } from '@travel-guide/constants';
import type { ClientTrip } from '@travel-guide/api-client';
import type { TripDestination } from '@travel-guide/types';

const api = vi.hoisted(() => ({ trip: vi.fn(), createTrip: vi.fn(), dissolveTrip: vi.fn(),
  addTripDestination: vi.fn(), removeTripDestination: vi.fn() }));
const account = vi.hoisted(() => ({ profile: { id: 'user-a', nickname: '用户 A' } }));
vi.mock('../src/api/client', () => ({ clientApi: api }));
vi.mock('../src/stores/accountStore', () => ({ useAccountStore: { getState: () => account } }));

import { tripService } from '../src/services/tripService';
import { useTripStore } from '../src/stores/tripStore';

const stop = (id: string, countryCode: string, orderIndex: number): TripDestination => ({
  id, tripId: 'trip', countryCode, continentCode: countryCode === 'FR' ? 'EU' : 'AS', cityCode: null,
  orderIndex, arrivalDate: null, departureDate: null, isOrigin: false,
});
const trip = (destinations: TripDestination[]): ClientTrip => ({ id: 'trip', userId: 'seed-user', title: '我的旅行',
  status: TripStatus.DRAFT, startDate: null, endDate: null, destinations });

describe('Globe 目的地提交', () => {
  beforeEach(() => { vi.clearAllMocks(); useTripStore.getState().show(null, []); });

  it('创建旅行时按选择顺序追加目的地，并保留重复国家', async () => {
    let stops: TripDestination[] = [];
    api.createTrip.mockResolvedValue(trip([]));
    api.addTripDestination.mockImplementation(async (_id: string, input: { countryCode: string }) => {
      stops = [...stops, stop(`new-${stops.length}`, input.countryCode, stops.length)];
    });
    api.trip.mockImplementation(async () => trip(stops));

    const created = await tripService.createWithDestinations('我的旅行', ['JP', 'KR', 'JP']);

    expect(api.createTrip).toHaveBeenCalledWith({ title: '我的旅行' });
    expect(api.addTripDestination.mock.calls.map((call) => call[1].countryCode)).toEqual(['JP', 'KR', 'JP']);
    expect(created.destinations.map((item) => item.countryCode)).toEqual(['JP', 'KR', 'JP']);
    expect(useTripStore.getState().currentTrip?.destinations?.map((item) => item.countryCode)).toEqual(['JP', 'KR', 'JP']);
  });

  it('向当前旅行追加成功后才更新 Store，并且可重复选择同一国家', async () => {
    let stops = [stop('existing', 'JP', 0)];
    const current = trip(stops);
    useTripStore.getState().show(current, [current]);
    api.trip.mockImplementation(async () => trip(stops));
    api.addTripDestination.mockImplementation(async (_id: string, input: { countryCode: string }) => {
      expect(useTripStore.getState().currentTrip?.destinations).toHaveLength(1);
      stops = [...stops, stop(`new-${stops.length}`, input.countryCode, stops.length)];
    });

    const updated = await tripService.addDestinations('trip', ['KR', 'JP']);

    expect(updated.destinations.map((item) => item.countryCode)).toEqual(['JP', 'KR', 'JP']);
    expect(useTripStore.getState().currentTrip?.destinations?.map((item) => item.countryCode)).toEqual(['JP', 'KR', 'JP']);
  });

  it('追加中途失败时回滚已追加地点，保留原 Store 数据', async () => {
    let stops = [stop('existing', 'JP', 0)];
    const current = trip(stops);
    useTripStore.getState().show(current, [current]);
    api.trip.mockImplementation(async () => trip(stops));
    api.addTripDestination.mockImplementation(async (_id: string, input: { countryCode: string }) => {
      if (input.countryCode === 'FR') throw new Error('network');
      stops = [...stops, stop('temporary', input.countryCode, stops.length)];
    });
    api.removeTripDestination.mockImplementation(async (_id: string, destinationId: string) => {
      stops = stops.filter((item) => item.id !== destinationId);
    });

    await expect(tripService.addDestinations('trip', ['KR', 'FR'])).rejects.toThrow('network');

    expect(api.removeTripDestination).toHaveBeenCalledWith('trip', 'temporary');
    expect(stops.map((item) => item.countryCode)).toEqual(['JP']);
    expect(useTripStore.getState().currentTrip?.destinations?.map((item) => item.countryCode)).toEqual(['JP']);
  });
});
