import type { TripDestination } from "@travel-guide/types";

/** 只按行程序号排序；同一国家再次出现时仍保留为独立目的地。 */
export function sortTripDestinations(
  destinations: readonly TripDestination[] | null | undefined,
): TripDestination[] {
  return [...(destinations ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
}
