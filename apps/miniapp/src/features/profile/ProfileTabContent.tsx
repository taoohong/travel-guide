import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Image, Text, View } from '@tarojs/components';
import { TripStatus } from '@travel-guide/constants';
import { sortTripDestinations } from '@travel-guide/core';
import { ErrorState, LoadingState } from '../../components/states';
import { tripService } from '../../services/tripService';
import { useTripStore } from '../../stores/tripStore';
import { useUserStore } from '../../stores/userStore';
import { useAccountStore } from '../../stores/accountStore';
import { accountService } from '../../services/accountService';
import travelMemory from '../../assets/tumi/旅行回忆.png';

const names: Record<string, string> = { JP: '日本', KR: '韩国', FR: '法国' };
export function ProfileTabContent({ active }: { active: boolean }) {
  const passport = useUserStore((state) => state.passportRegion); const { trips, loading, error } = useTripStore();
  const profile = useAccountStore((state) => state.profile);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => { if (active) { void tripService.refresh(); if (profile) void accountService.refresh().catch(() => {}); } }, [active, profile?.id]);
  const history = trips.filter((trip) => trip.status === TripStatus.COMPLETED);
  const visited = new Set(trips.flatMap((trip) => trip.destinations?.map((item) => item.countryCode) ?? [])).size;
  return <View className="tab-content profile-tab"><View className="account-card">
      {profile?.avatarUrl ? <Image className="account-avatar" src={profile.avatarUrl} mode="aspectFill" /> :
        <View className="account-avatar account-avatar-fallback"><Text>{profile?.nickname?.slice(0, 1) || '旅'}</Text></View>}
      <View className="account-copy"><Text className="account-name">{profile?.nickname || '登录以保存旅程'}</Text></View>
      <Button className="account-action" onClick={() => { void Taro.navigateTo({ url: '/pages/login/index' }); }}>{profile ? '编辑' : '微信登录'}</Button>
    </View>
    <View className="profile-summary"><View><Text>{trips.length}</Text><Text>全部旅行</Text></View><View><Text>{visited}</Text><Text>目的地国家</Text></View>
      <View><Text>{history.length}</Text><Text>已完成</Text></View></View>
    {loading && !trips.length ? <LoadingState /> : error && !trips.length ? <ErrorState message={error} onRetry={() => { void tripService.refresh(); }} /> : <>
      <View className={`content-card profile-history-card ${history.length ? '' : 'is-empty'}`}><Text className="card-heading">历史旅行</Text>
        {history.length ? <><View className="history-summary" role="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>
          <Text>您已完成<Text className="history-count">{history.length}次</Text>旅行，点击查看回忆</Text></View>
          {historyOpen && history.map((trip) => <View className="history-trip" key={trip.id}>
            <Text className="profile-trip-title">{trip.title}</Text><Text className="card-muted">{trip.startDate?.slice(0, 10) || '日期待定'} — {trip.endDate?.slice(0, 10) || '日期待定'}</Text>
            <Text className="card-muted">{sortTripDestinations(trip.destinations).map((item) => names[item.countryCode] ?? item.countryCode).join(' → ')}</Text>
          </View>)}</> : <View className="history-empty"><Image src={travelMemory} mode="aspectFit" />
        <Text>还没有完成过旅行</Text></View>}</View></>}
    <View className="content-card"><Text className="card-heading">护照所属国家 / 地区</Text>
      <View className="passport-value" role="button" aria-label="编辑护照所属国家或地区"
        onClick={() => { void Taro.navigateTo({ url: '/pages/settings/index' }); }}>{passport === 'CN' ? '中国大陆' : passport === 'SG' ? '新加坡' : passport}</View></View>
  </View>;
}
