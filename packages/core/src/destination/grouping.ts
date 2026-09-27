import { PlanStage } from '@travel-guide/constants';
import type { TripDestination } from '@travel-guide/types';
import { sortTripDestinations } from '../trip/tripDestination';

export interface TravelLeg { from: string; to: string; stage: PlanStage }

export function groupTravelLegs(destinations: readonly TripDestination[], home = 'HOME'): TravelLeg[] {
  const ordered = sortTripDestinations(destinations).filter((item) => !item.isOrigin);
  if (!ordered.length) return [];
  const legs: TravelLeg[] = [{ from: home, to: ordered[0]!.countryCode, stage: PlanStage.DEPARTING }];
  for (let index = 1; index < ordered.length; index++) legs.push({
    from: ordered[index - 1]!.countryCode, to: ordered[index]!.countryCode, stage: PlanStage.TRAVELING,
  });
  legs.push({ from: ordered.at(-1)!.countryCode, to: home, stage: PlanStage.RETURNING });
  return legs;
}
