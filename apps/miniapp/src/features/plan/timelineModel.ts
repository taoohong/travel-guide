import { PlanStage } from '@travel-guide/constants';
import type { PlanItem } from '@travel-guide/types';

export const stages = [PlanStage.PREPARING, PlanStage.DEPARTING, PlanStage.TRAVELING, PlanStage.RETURNING] as const;
export const stageNames: Record<PlanStage, string> = { PREPARING: '准备', DEPARTING: '出发', TRAVELING: '旅行中', RETURNING: '归程' };
export type TimelineRow = { key: string; stage: PlanStage; date: string | null; item?: PlanItem };
export const datePart = (value: string | null | undefined): string | null => value?.slice(0, 10) ?? null;

export function tripDates(start: string | null | undefined, end: string | null | undefined): string[] {
  if (!start || !end) return [];
  const from = Date.parse(`${datePart(start)}T00:00:00Z`); const to = Date.parse(`${datePart(end)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  // ponytail: two-year cap avoids rendering an unbounded date strip; virtualize if multi-year trips become a product need.
  return Array.from({ length: Math.min(731, Math.floor((to - from) / 86_400_000) + 1) }, (_, i) =>
    new Date(from + i * 86_400_000).toISOString().slice(0, 10));
}

export function timelineRows(items: readonly PlanItem[], start: string | null, end: string | null): TimelineRow[] {
  return stages.flatMap((stage) => {
    const fallback = stage === PlanStage.RETURNING ? datePart(end) : datePart(start);
    const stageItems = items.filter((item) => item.stage === stage).sort((a, b) =>
      (a.planDate ?? '').localeCompare(b.planDate ?? '') || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    return [{ key: `stage-${stage}`, stage, date: fallback },
      ...stageItems.map((item) => ({ key: item.id, stage, date: datePart(item.planDate) ?? fallback, item }))];
  });
}

export function nearestRowForDate(rows: readonly TimelineRow[], date: string): number {
  const exact = rows.findIndex((row) => row.item && row.date === date);
  if (exact >= 0) return exact;
  const target = Date.parse(`${date}T00:00:00Z`);
  return rows.reduce((best, row, index) => {
    if (!row.date) return best;
    return Math.abs(Date.parse(`${row.date}T00:00:00Z`) - target) < Math.abs(Date.parse(`${rows[best]?.date ?? date}T00:00:00Z`) - target) ? index : best;
  }, 0);
}
