import { useState } from 'react';
import Taro from '@tarojs/taro';
import { Button } from '@tarojs/components';
import type { GuideSummary } from '@travel-guide/api-client';
import { PlanSourceType } from '@travel-guide/constants';
import type { PlanItem, PlanItemDraft } from '@travel-guide/types';
import { guideDraft, matchingPlanItem, planService } from '../../services/planService';
import { usePlanStore } from '../../stores/planStore';
import { useTripStore } from '../../stores/tripStore';

export function GuideActionButton({ guide, countryCode, sourceType = PlanSourceType.GUIDE, onNeedTrip, onRemoved }: {
  guide: GuideSummary; countryCode: string; sourceType?: PlanSourceType;
  onNeedTrip(draft: PlanItemDraft): void; onRemoved(item: PlanItem): void;
}) {
  const [submitting, setSubmitting] = useState(false); const trip = useTripStore((state) => state.currentTrip);
  const items = usePlanStore((state) => state.items); const draft = guideDraft(guide, countryCode, sourceType);
  if (!draft) return null;
  const existing = trip ? matchingPlanItem(items, trip.id, draft) : undefined;
  const toggle = async () => {
    if (submitting) return;
    if (!trip) { onNeedTrip(draft); return; }
    setSubmitting(true);
    try {
      if (existing) { const removed = await planService.remove(trip.id, existing.id); onRemoved(removed);
        await Taro.showToast({ title: '已从计划移除', icon: 'none' }); }
      else { await planService.add(trip.id, draft); await Taro.showToast({ title: draft.stage === 'PREPARING' ? '已加入准备计划' : '已加入旅行计划', icon: 'success' }); }
    } catch { await Taro.showToast({ title: existing ? '移除失败，请重试' : '加入失败，请重试', icon: 'none' }); }
    finally { setSubmitting(false); }
  };
  return <Button className={`plan-action ${existing ? 'is-added' : ''}`} loading={submitting} disabled={submitting} onClick={() => { void toggle(); }}>
    {existing ? '✓' : '＋'}
  </Button>;
}
