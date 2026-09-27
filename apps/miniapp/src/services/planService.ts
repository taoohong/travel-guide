import type { GuideSummary, PlanItemInput } from '@travel-guide/api-client';
import { buildDedupeKey, planFromGuide } from '@travel-guide/core';
import type { PlanItem, PlanItemDraft } from '@travel-guide/types';
import { PlanSourceType } from '@travel-guide/constants';
import { clientApi } from '../api/client';
import { usePlanStore } from '../stores/planStore';

const pending = new Map<string, Promise<PlanItem>>();
const keyOf = (tripId: string, input: PlanItemInput) => `${tripId}:${buildDedupeKey(input) ?? `manual:${input.title}`}`;

export function guideDraft(guide: GuideSummary, countryCode: string, sourceType: PlanSourceType = PlanSourceType.GUIDE): PlanItemDraft | null {
  if (!guide.planMapping) return null;
  return planFromGuide({ id: guide.id, title: String(guide.name ?? guide.nameZh ?? guide.title ?? ''),
    description: guide.description, countryCode, sourceType, planMapping: guide.planMapping });
}
export function matchingPlanItem(items: readonly PlanItem[], tripId: string, draft: PlanItemDraft): PlanItem | undefined {
  const key = buildDedupeKey(draft); return key ? items.find((item) => item.tripId === tripId && (item.dedupeHash || buildDedupeKey(item)) === key) : undefined;
}

export const planService = {
  list: clientApi.planItems,
  async refresh(tripId: string): Promise<PlanItem[]> {
    usePlanStore.getState().start(tripId);
    try { const items = await clientApi.planItems(tripId); usePlanStore.getState().show(tripId, items); return items; }
    catch (error) { usePlanStore.getState().fail(error instanceof Error ? error.message : '计划加载失败'); throw error; }
  },
  add(tripId: string, input: PlanItemInput): Promise<PlanItem> {
    const key = keyOf(tripId, input); const inflight = pending.get(key); if (inflight) return inflight;
    const request = clientApi.createPlanItem(tripId, input).then((result) => { usePlanStore.getState().upsert(result.planItem); return result.planItem; })
      .finally(() => pending.delete(key)); pending.set(key, request); return request;
  },
  async remove(tripId: string, itemId: string): Promise<PlanItem> {
    const result = await clientApi.removePlanItem(tripId, itemId); usePlanStore.getState().remove(itemId); return result.removed;
  },
  async undo(tripId: string, snapshot: PlanItem): Promise<PlanItem> {
    return planService.add(tripId, { title: snapshot.title, description: snapshot.description, stage: snapshot.stage,
      itemType: snapshot.itemType, scope: snapshot.scope, sourceType: snapshot.sourceType, sourceId: snapshot.sourceId,
      sourceCountryCode: snapshot.sourceCountryCode, dedupeKey: snapshot.dedupeKey, sortOrder: snapshot.sortOrder,
      done: snapshot.done, doneAt: snapshot.doneAt, planDate: snapshot.planDate });
  },
  async toggleDone(tripId: string, item: PlanItem): Promise<PlanItem> {
    const done = !item.done; const updated = await clientApi.updatePlanItem(tripId, item.id, { done, doneAt: done ? new Date().toISOString() : null });
    usePlanStore.getState().upsert(updated); return updated;
  },
  async update(tripId: string, id: string, patch: Partial<Pick<PlanItem, 'title' | 'description' | 'planDate' | 'done' | 'doneAt'>>): Promise<PlanItem> {
    const updated = await clientApi.updatePlanItem(tripId, id, patch); usePlanStore.getState().upsert(updated); return updated;
  },
};
