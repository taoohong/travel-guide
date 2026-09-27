import { describe, expect, it } from 'vitest';
import { PlanStage } from '@travel-guide/constants';
import type { PlanItem } from '@travel-guide/types';
import { nearestRowForDate, timelineRows, tripDates } from '../src/features/plan/timelineModel';

const item = (id: string, stage: PlanStage, planDate: string | null, sortOrder = 0): PlanItem => ({
  id, tripId: 'trip', title: id, description: null, stage, itemType: 'PACKING_ITEM' as PlanItem['itemType'],
  scope: 'TRIP' as PlanItem['scope'], sourceType: 'USER' as PlanItem['sourceType'], sourceId: null,
  sourceCountryCode: null, dedupeKey: null, dedupeHash: null, sortOrder, done: false, doneAt: null, planDate,
});

describe('plan date strip and centered timeline', () => {
  it('generates every local trip day, including leap day, without squeezing dates', () => {
    expect(tripDates('2028-02-28T00:00:00.000Z', '2028-03-01T00:00:00.000Z'))
      .toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(tripDates('2028-03-01', '2028-02-28')).toEqual([]);
  });
  it('keeps four stage headers and orders same-day items by sortOrder', () => {
    const rows = timelineRows([item('later', PlanStage.TRAVELING, '2028-03-01T10:00:00Z', 2),
      item('first', PlanStage.TRAVELING, '2028-03-01T09:00:00Z', 1)], '2028-02-28', '2028-03-03');
    expect(rows.filter((row) => !row.item)).toHaveLength(4);
    expect(rows.filter((row) => row.item).map((row) => row.key)).toEqual(['first', 'later']);
    expect(nearestRowForDate(rows, '2028-03-01')).toBe(rows.findIndex((row) => row.key === 'first'));
  });
});
