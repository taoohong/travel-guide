import { useEffect } from 'react';
import Taro from '@tarojs/taro';
import { Button, Image, Text, View } from '@tarojs/components';
import { sortTripDestinations } from '@travel-guide/core';
import { TripTicket } from '../../components/TripTicket';
import { LoadingState } from '../../components/states';
import { mapService } from '../../services/mapService';
import { tripService } from '../../services/tripService';
import { useCountryStore } from '../../stores/countryStore';
import { useTripStore } from '../../stores/tripStore';
import { openGlobePage } from '../../utils/openGlobePage';
import tumiTravel from '../../assets/tumi/旅行页-mini.png';
import tumiPlane from '../../assets/tumi/tumi坐螺旋桨飞机.jpg';

const countryNames: Record<string, string> = { JP: '日本', KR: '韩国', FR: '法国', HOME: '家' };

export function TravelTabContent({ active }: { active: boolean }) {
  const countries = useCountryStore((state) => state.countries);
  const trips = useTripStore((state) => state.trips);
  const currentTrip = useTripStore((state) => state.currentTrip);
  const loading = useTripStore((state) => state.loading);
  const error = useTripStore((state) => state.error);

  useEffect(() => {
    if (!useCountryStore.getState().initialized) {
      void mapService.load((value) => useCountryStore.getState().updateContinents(value),
        (value) => useCountryStore.getState().updateCountries(value), () => useCountryStore.getState().markOffline())
        .then((result) => useCountryStore.getState().show(result.continents, result.countries, result.offline))
        .catch((cause: unknown) => useCountryStore.getState().fail(cause instanceof Error ? cause.message : '目的地加载失败'));
    }
  }, []);
  useEffect(() => { if (active) void tripService.refresh().catch(() => undefined); }, [active]);

  const openGlobe = () => { void openGlobePage(); };
  const addTrip = () => { void Taro.navigateTo({ url: '/pages/trip-edit/index?mode=create' }); };
  const openTrip = (tripId: string) => { void Taro.navigateTo({ url: `/pages/trip-detail/index?tripId=${encodeURIComponent(tripId)}` }); };
  const list = trips.length ? trips : currentTrip ? [currentTrip] : [];

  return <View className="tab-content travel-tab">
    <View className="travel-header"><View><Text className="travel-kicker">HAVE A NICE TRIP</Text>
      <Text className="travel-title">旅行</Text></View>
      <Image className="travel-header-illustration" src={tumiPlane} mode="aspectFit" />
    </View>
    <View className="travel-list-heading"><Text>我的行程</Text><Text>{list.length} 段</Text></View>
    {loading && !list.length ? <LoadingState label="正在整理你的机票…" /> : error && !list.length ?
      <View className="travel-error"><Text>暂时无法读取旅行</Text><Button onClick={() => { void tripService.refresh(); }}>重试</Button></View> :
      !list.length ? <View className="travel-empty"><Image className="travel-empty-art travel-empty-art--travel" src={tumiTravel} mode="aspectFit" />
        <Text className="travel-empty-title">还没有旅行计划</Text><Text className="travel-empty-copy">去挑选目的地，创建第一张旅行机票。</Text>
        <Button className="travel-empty-button" onClick={openGlobe}>开始一段旅行 <Text>↗</Text></Button></View> :
        <>{list.map((trip, index) => {
          const destinations = sortTripDestinations(trip.destinations ?? []);
          const firstStop = destinations[0];
          const destination = firstStop ? countries.find((country) => country.code === firstStop.countryCode) : undefined;
          const to = destination?.nameEn ?? (firstStop ? countryNames[firstStop.countryCode] ?? firstStop.countryCode : 'DESTINATION');
          return <TripTicket key={trip.id} trip={trip} sequence={index + 1} destination={to}
            destinationCount={destinations.length} onClick={() => openTrip(trip.id)} />;
        })}<Button className="travel-add-trip" onClick={addTrip} aria-label="添加新旅程">＋</Button></>}
  </View>;
}
