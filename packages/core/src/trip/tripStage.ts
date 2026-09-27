import { PlanStage, TripStatus } from "@travel-guide/constants";
import type { Trip } from "@travel-guide/types";

/** 用户确认的状态始终优先于日期；today 只用于未知状态的兜底。 */
export function getCurrentTripStage(trip: Trip | null | undefined, today?: string): PlanStage {
  switch (trip?.status) {
    case TripStatus.COMPLETED:
    case TripStatus.RETURNING:
      return PlanStage.RETURNING;
    case TripStatus.PREPARING:
    case TripStatus.DRAFT:
      return PlanStage.PREPARING;
    case TripStatus.DEPARTING:
      return PlanStage.DEPARTING;
    case TripStatus.TRAVELING:
      return PlanStage.TRAVELING;
  }

  if (!trip || !today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return PlanStage.PREPARING;
  const start = trip.startDate?.slice(0, 10);
  const end = trip.endDate?.slice(0, 10);
  if (!start || today < start) return PlanStage.PREPARING;
  if (today === start) return PlanStage.DEPARTING;
  if (end && today > end) return PlanStage.RETURNING;
  return PlanStage.TRAVELING;
}

const statusOrder = Object.values(TripStatus);

/** 阶段由用户确认推进；相邻阶段可前进或回退。 */
export function canTransitionTripStatus(from: TripStatus, to: TripStatus): boolean {
  const current = statusOrder.indexOf(from);
  const next = statusOrder.indexOf(to);
  return current >= 0 && next >= 0 && Math.abs(next - current) === 1;
}
