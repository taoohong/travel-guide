import { PlanItemType, PlanSourceType, PlanStage } from "@travel-guide/constants";
import type { PlanItem } from "@travel-guide/types";
import { normalizeText } from "@travel-guide/utils";

export type PlanDedupeInput = Pick<
  PlanItem,
  | "stage"
  | "itemType"
  | "title"
  | "sourceType"
  | "sourceId"
  | "sourceCountryCode"
  | "dedupeKey"
>;

/** 返回 null 表示信息不足，不能把多个未知事项误判为同一项。 */
export function buildDedupeKey(item: Partial<PlanDedupeInput> | null | undefined): string | null {
  if (!item) return null;
  const configured = normalizeText(item.dedupeKey);
  if (configured) return `k:${configured}`;

  const sourceId = normalizeText(item.sourceId);
  if (sourceId) {
    if (!item.sourceType || !Object.values(PlanSourceType).includes(item.sourceType)) return null;
    const country = item.sourceCountryCode?.trim().toUpperCase() || "*";
    return `s:${item.sourceType}:${country}:${sourceId}`;
  }

  const title = normalizeText(item.title);
  return title && item.itemType && Object.values(PlanItemType).includes(item.itemType) &&
    item.stage && Object.values(PlanStage).includes(item.stage)
    ? `k:${item.itemType}:${item.stage}:${title}`
    : null;
}

export function isDuplicatePlanItem(
  items: readonly PlanItem[] | null | undefined,
  candidate: (PlanDedupeInput & Pick<PlanItem, "tripId">) | null | undefined,
): boolean {
  if (!candidate?.tripId) return false;
  const key = buildDedupeKey(candidate);
  return key !== null && (items ?? []).some(
    (item) => item.tripId === candidate.tripId &&
      (item.dedupeHash || buildDedupeKey(item)) === key,
  );
}
