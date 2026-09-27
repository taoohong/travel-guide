import type { PlanItem } from "@travel-guide/types";

export function calculatePlanProgress(items: readonly Pick<PlanItem, "done">[] | null | undefined): {
  total: number;
  done: number;
  percent: number;
} {
  const total = items?.length ?? 0;
  const done = items?.filter((item) => item.done).length ?? 0;
  return { total, done, percent: total === 0 ? 0 : Math.round(done * 100 / total) };
}
