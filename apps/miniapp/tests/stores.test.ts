import { describe, expect, it } from 'vitest';
import { useCountryStore } from '../src/stores/countryStore';
import { useTripStore } from '../src/stores/tripStore';
import { usePlanStore } from '../src/stores/planStore';

describe('Store 状态隔离', () => {
  it('国家 loading / success / error 不污染 Trip 和 Plan', () => {
    useCountryStore.getState().start(); expect(useCountryStore.getState().loading).toBe(true);
    useCountryStore.getState().show([], [], false); expect(useCountryStore.getState().initialized).toBe(true);
    useCountryStore.getState().fail('offline'); expect(useCountryStore.getState().error).toBe('offline');
    expect(useTripStore.getState().currentTrip).toBeNull();
    expect(usePlanStore.getState().items).toEqual([]);
  });
});
