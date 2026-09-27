import { PlanSourceType } from '@travel-guide/constants';
import type { PlanItemDraft, PlanMapping } from '@travel-guide/types';

export interface GuidePlanInput {
  id: string;
  title: string;
  description?: string | null;
  countryCode: string;
  sourceType?: PlanSourceType;
  planMapping: PlanMapping;
}

/** 后台 PlanMapping 是唯一的可执行性与阶段来源。 */
export function planFromGuide(input: GuidePlanInput): PlanItemDraft | null {
  const mapping = input.planMapping;
  if (!mapping.actionable || !input.id.trim() || !input.title.trim()) return null;
  return {
    title: input.title.trim(), description: input.description?.trim() || null,
    stage: mapping.targetStage, itemType: mapping.itemType, scope: mapping.scope,
    sourceType: input.sourceType ?? PlanSourceType.GUIDE, sourceId: input.id,
    sourceCountryCode: input.countryCode.trim().toUpperCase(), dedupeKey: mapping.dedupeKey,
  };
}
