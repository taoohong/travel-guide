import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanItemType, PlanScope, PlanSourceType, PlanStage } from '@travel-guide/constants';
import type { PlanItem } from '@travel-guide/types';

const api = vi.hoisted(() => ({
  planItems: vi.fn(), createPlanItem: vi.fn(), removePlanItem: vi.fn(), updatePlanItem: vi.fn(),
}));
vi.mock('../src/api/client', () => ({ clientApi: api }));

import { guideDraft, matchingPlanItem, planService } from '../src/services/planService';
import { usePlanStore } from '../src/stores/planStore';

const item: PlanItem = { id: 'p1', tripId: 't1', title: '护照原件', description: null, stage: PlanStage.PREPARING,
  itemType: PlanItemType.VISA_MATERIAL, scope: PlanScope.TRIP, sourceType: PlanSourceType.GUIDE, sourceId: 'jp-passport',
  sourceCountryCode: 'JP', dedupeKey: 'passport', dedupeHash: 'k:passport', sortOrder: 0, done: false, doneAt: null, planDate: null };

describe('攻略 ＋/✓ 与幂等交互', () => {
  beforeEach(() => { vi.clearAllMocks(); usePlanStore.getState().clear(); });
  it('actionable 决定是否生成按钮草稿，已有相同 dedupeKey 时显示同一计划项', () => {
    const draft = guideDraft({ id: 'kr-passport', title: '护照原件', planMapping: { actionable: true,
      targetStage: PlanStage.PREPARING, itemType: PlanItemType.VISA_MATERIAL, scope: PlanScope.TRIP, dedupeKey: 'passport' } }, 'KR');
    expect(draft?.sourceCountryCode).toBe('KR'); expect(matchingPlanItem([item], 't1', draft!)).toEqual(item);
    expect(guideDraft({ id: 'tip', title: '贴士', planMapping: null }, 'JP')).toBeNull();
  });
  it('连续八次加入只发送一次 POST，删除与 Undo 会同步权威 Store', async () => {
    api.createPlanItem.mockResolvedValue({ created: true, planItem: item, toast: '已加入' });
    api.removePlanItem.mockResolvedValue({ removed: item, undoHint: { payload: {} } });
    const input = { title: item.title, description: null, stage: item.stage, itemType: item.itemType, scope: item.scope,
      sourceType: item.sourceType, sourceId: item.sourceId, sourceCountryCode: item.sourceCountryCode, dedupeKey: item.dedupeKey };
    const results = await Promise.all(Array.from({ length: 8 }, () => planService.add('t1', input)));
    expect(api.createPlanItem).toHaveBeenCalledTimes(1); expect(new Set(results.map((entry) => entry.id)).size).toBe(1);
    expect(usePlanStore.getState().items).toEqual([item]);
    const snapshot = await planService.remove('t1', 'p1'); expect(usePlanStore.getState().items).toEqual([]);
    await planService.undo('t1', snapshot); expect(api.createPlanItem).toHaveBeenCalledTimes(2); expect(usePlanStore.getState().items).toEqual([item]);
  });
  it('完成与恢复未完成使用 PATCH 返回值更新 Store', async () => {
    usePlanStore.getState().show('t1', [item]); api.updatePlanItem.mockResolvedValue({ ...item, done: true, doneAt: '2026-10-01T00:00:00.000Z' });
    await planService.toggleDone('t1', item); expect(usePlanStore.getState().items[0]?.done).toBe(true);
  });
});
