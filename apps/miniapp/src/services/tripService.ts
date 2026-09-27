import { TripStatus } from '@travel-guide/constants';
import type { ClientTrip } from '@travel-guide/api-client';
import { clientApi } from '../api/client';
import { useAccountStore } from '../stores/accountStore';
import { useTripStore } from '../stores/tripStore';

const full = async (trip: ClientTrip) => clientApi.trip(trip.id);
let refreshSequence = 0;

function publishTrip(trip: ClientTrip, makeCurrent = false): void {
  const state = useTripStore.getState();
  const trips = state.trips.some((item) => item.id === trip.id)
    ? state.trips.map((item) => item.id === trip.id ? trip : item)
    : [trip, ...state.trips];
  state.show(makeCurrent || state.currentTrip?.id === trip.id ? trip : state.currentTrip, trips);
}

export const tripService = {
  list: clientApi.trips, get: clientApi.trip,
  async refresh(): Promise<ClientTrip | null> {
    const sequence = ++refreshSequence;
    const accountId = useAccountStore.getState().profile?.id ?? null;
    const isCurrentRequest = () => sequence === refreshSequence &&
      (useAccountStore.getState().profile?.id ?? null) === accountId;
    useTripStore.getState().start();
    try {
      if (!accountId) { if (isCurrentRequest()) useTripStore.getState().show(null, []); return null; }
      const page = await clientApi.trips();
      if (!isCurrentRequest()) return useTripStore.getState().currentTrip;
      const previous = useTripStore.getState().currentTrip;
      const detailed = await Promise.all(page.items.map(full));
      if (!isCurrentRequest()) return useTripStore.getState().currentTrip;
      const current = detailed.find((trip) => trip.id === previous?.id) ??
        detailed.find((trip) => trip.status !== TripStatus.COMPLETED) ?? null;
      useTripStore.getState().show(current, detailed); return current;
    } catch (error) {
      if (!isCurrentRequest()) return useTripStore.getState().currentTrip;
      useTripStore.getState().fail(error instanceof Error ? error.message : '旅行加载失败'); throw error;
    }
  },
  async create(input: { title: string; startDate?: string | null; endDate?: string | null; countryCode?: string;
    notes?: string | null; travelers?: string[] }): Promise<ClientTrip> {
    const created = await clientApi.createTrip({ title: input.title,
      startDate: input.startDate, endDate: input.endDate, notes: input.notes, travelers: input.travelers });
    if (input.countryCode) await clientApi.addTripDestination(created.id, { countryCode: input.countryCode });
    const trip = await clientApi.trip(created.id);
    const state = useTripStore.getState();
    state.show(trip, [trip, ...state.trips.filter((item) => item.id !== trip.id)]);
    return trip;
  },
  async createWithDestinations(title: string, countryCodes: readonly string[], details: {
    startDate?: string | null; endDate?: string | null; notes?: string | null;
  } = {}): Promise<ClientTrip> {
    if (!countryCodes.length) throw new Error('请先选择目的地');
    const created = await clientApi.createTrip({ title, ...details });
    try {
      for (const countryCode of countryCodes) {
        await clientApi.addTripDestination(created.id, { countryCode });
      }
      const trip = await clientApi.trip(created.id);
      publishTrip(trip, true);
      return trip;
    } catch (error) {
      try {
        await clientApi.dissolveTrip(created.id);
      } catch {
        try { publishTrip(await clientApi.trip(created.id), true); } catch { /* Preserve the original write error. */ }
      }
      throw error;
    }
  },
  async addDestinations(tripId: string, countryCodes: readonly string[]): Promise<ClientTrip> {
    if (!countryCodes.length) throw new Error('请先选择目的地');
    const before = await clientApi.trip(tripId);
    const originalIds = new Set((before.destinations ?? []).map((destination) => destination.id));
    try {
      for (const countryCode of countryCodes) {
        await clientApi.addTripDestination(tripId, { countryCode });
      }
      const trip = await clientApi.trip(tripId);
      publishTrip(trip);
      return trip;
    } catch (error) {
      try {
        const after = await clientApi.trip(tripId);
        for (const destination of [...(after.destinations ?? [])].reverse()) {
          if (!originalIds.has(destination.id)) await clientApi.removeTripDestination(tripId, destination.id);
        }
        publishTrip(await clientApi.trip(tripId));
      } catch {
        try { publishTrip(await clientApi.trip(tripId)); } catch { /* Preserve the original write error. */ }
      }
      throw error;
    }
  },
  async update(tripId: string, input: Partial<Pick<ClientTrip, 'title' | 'startDate' | 'endDate' | 'notes' | 'travelers'>>): Promise<ClientTrip> {
    await clientApi.updateTrip(tripId, input);
    const trip = await clientApi.trip(tripId);
    const state = useTripStore.getState();
    state.show(state.currentTrip?.id === tripId ? trip : state.currentTrip,
      state.trips.some((item) => item.id === tripId) ? state.trips.map((item) => item.id === tripId ? trip : item) : [trip, ...state.trips]);
    return trip;
  },
  async addDestination(tripId: string, countryCode: string): Promise<ClientTrip> {
    await clientApi.addTripDestination(tripId, { countryCode }); const trip = await clientApi.trip(tripId);
    publishTrip(trip); return trip;
  },
  async removeDestination(tripId: string, destinationId: string): Promise<ClientTrip> {
    await clientApi.removeTripDestination(tripId, destinationId); const trip = await clientApi.trip(tripId);
    publishTrip(trip); return trip;
  },
  async confirmStage(tripId: string, stage: TripStatus): Promise<ClientTrip> {
    await clientApi.confirmTripStage(tripId, stage); const trip = await clientApi.trip(tripId);
    publishTrip(trip); return trip;
  },
  async selectCurrent(tripId: string): Promise<ClientTrip> {
    const trip = await clientApi.trip(tripId);
    const state = useTripStore.getState();
    state.show(trip, state.trips.some((item) => item.id === tripId) ? state.trips.map((item) => item.id === tripId ? trip : item) : [trip, ...state.trips]);
    return trip;
  },
};
