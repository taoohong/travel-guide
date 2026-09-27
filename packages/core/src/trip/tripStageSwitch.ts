import { TripStatus } from '@travel-guide/constants';
import type { Trip } from '@travel-guide/types';

export interface StageSwitchPrompt { from: TripStatus; to: TripStatus; message: string }

/** 日期只产生向前提示；状态改变仍必须由用户确认 API 完成。 */
export function getStageSwitchPrompt(trip: Trip | null | undefined, today: string): StageSwitchPrompt | null {
  if (!trip || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const start = trip.startDate?.slice(0, 10); const end = trip.endDate?.slice(0, 10);
  if (trip.status === TripStatus.DRAFT) return { from: trip.status, to: TripStatus.PREPARING, message: '开始准备这段旅行？' };
  if (trip.status === TripStatus.PREPARING && start && today >= start)
    return { from: trip.status, to: TripStatus.DEPARTING, message: '看起来已经到出发阶段了，是否切换？' };
  if (trip.status === TripStatus.DEPARTING && start && today > start)
    return { from: trip.status, to: TripStatus.TRAVELING, message: '已经抵达目的地了吗？切换到旅行中阶段。' };
  if (trip.status === TripStatus.TRAVELING && end && today >= end)
    return { from: trip.status, to: TripStatus.RETURNING, message: '旅程接近尾声，是否切换到归程？' };
  if (trip.status === TripStatus.RETURNING && end && today > end)
    return { from: trip.status, to: TripStatus.COMPLETED, message: '已经平安到家？完成这段旅行。' };
  return null;
}
