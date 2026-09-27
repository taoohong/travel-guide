import { describe, expect, it } from 'vitest';
import { PlanItemType, PlanScope, PlanSourceType, PlanStage, TripStatus } from '@travel-guide/constants';
import type { Trip, TripDestination } from '@travel-guide/types';
import { getStageSwitchPrompt, groupTravelLegs, planFromGuide } from '../src/index';

const trip = (status: TripStatus): Trip => ({ id: 't1', userId: 'u1', title: '旅行', status,
  startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-10T00:00:00.000Z' });
const destination = (id: string, countryCode: string, orderIndex: number): TripDestination => ({ id, tripId: 't1', countryCode,
  continentCode: countryCode === 'FR' ? 'EU' : 'AS', cityCode: null, orderIndex, arrivalDate: null, departureDate: null, isOrigin: false });

describe('攻略转计划', () => {
  it('严格采用 PlanMapping，保留来源和跨国去重键', () => {
    expect(planFromGuide({ id: 'jp-passport', title: ' 护照原件 ', countryCode: 'jp', planMapping: {
      actionable: true, targetStage: PlanStage.PREPARING, itemType: PlanItemType.VISA_MATERIAL,
      scope: PlanScope.TRIP, dedupeKey: 'passport' } })).toEqual({ title: '护照原件', description: null,
      stage: PlanStage.PREPARING, itemType: PlanItemType.VISA_MATERIAL, scope: PlanScope.TRIP,
      sourceType: PlanSourceType.GUIDE, sourceId: 'jp-passport', sourceCountryCode: 'JP', dedupeKey: 'passport' });
  });
  it('不可执行内容不生成计划草稿', () => {
    expect(planFromGuide({ id: 'tip', title: '喝水', countryCode: 'JP', planMapping: { actionable: false,
      targetStage: PlanStage.TRAVELING, itemType: PlanItemType.PACKING_ITEM, scope: PlanScope.COUNTRY, dedupeKey: null } })).toBeNull();
  });
});

describe('阶段提示', () => {
  it('日期只产生提示，不修改原 Trip，用户确认状态仍优先', () => {
    const preparing = trip(TripStatus.PREPARING);
    expect(getStageSwitchPrompt(preparing, '2026-10-01')?.to).toBe(TripStatus.DEPARTING);
    expect(preparing.status).toBe(TripStatus.PREPARING);
    expect(getStageSwitchPrompt(trip(TripStatus.TRAVELING), '2026-09-01')).toBeNull();
  });
});

describe('多目的地交通分组', () => {
  it('跨洲且回头行程保持顺序，并分到去程、旅行中、归程', () => {
    const legs = groupTravelLegs([destination('3', 'JP', 2), destination('1', 'JP', 0), destination('2', 'FR', 1)]);
    expect(legs).toEqual([{ from: 'HOME', to: 'JP', stage: PlanStage.DEPARTING },
      { from: 'JP', to: 'FR', stage: PlanStage.TRAVELING }, { from: 'FR', to: 'JP', stage: PlanStage.TRAVELING },
      { from: 'JP', to: 'HOME', stage: PlanStage.RETURNING }]);
  });
});
