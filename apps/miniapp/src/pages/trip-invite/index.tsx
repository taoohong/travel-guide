import { useState } from 'react';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { Button, Image, Text, View } from '@tarojs/components';
import { TripStatus } from '@travel-guide/constants';
import type { ClientTripInvitePreview } from '@travel-guide/api-client';
import { clientApi } from '../../api/client';
import { tripService } from '../../services/tripService';
import { useAccountStore } from '../../stores/accountStore';
import { useTripStore } from '../../stores/tripStore';
import { LoadingState } from '../../components/states';
import './index.scss';

const dateLabel = (value: string | null) => value?.slice(0, 10).replaceAll('-', '.') ?? '';

export default function TripInvitePage() {
  const token = String(useRouter().params.token ?? '');
  const profile = useAccountStore((state) => state.profile);
  const [preview, setPreview] = useState<ClientTripInvitePreview | null>(null);
  const [loading, setLoading] = useState(true); const [joining, setJoining] = useState(false); const [error, setError] = useState('');

  const load = async () => {
    if (!token) { setError('邀请链接无效'); setLoading(false); return; }
    setLoading(true); setError('');
    try { setPreview(await clientApi.tripInvitePreview(token)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '邀请暂时无法打开'); }
    finally { setLoading(false); }
  };
  useDidShow(() => { void load(); });

  const join = async () => {
    if (!profile) { void Taro.navigateTo({ url: '/pages/login/index' }); return; }
    if (joining) return; setJoining(true);
    try {
      let selectedBefore = useTripStore.getState().currentTrip;
      if (!selectedBefore || selectedBefore.status === TripStatus.COMPLETED) {
        try { selectedBefore = (await clientApi.trips()).items.find((trip) => trip.status !== TripStatus.COMPLETED) ?? null; }
        catch { selectedBefore = null; }
      }
      const result = await clientApi.joinTripInvite(token);
      await tripService.refresh();
      const openTrip = async () => { await tripService.selectCurrent(result.tripId); await Taro.navigateTo({ url: `/pages/trip-detail/index?tripId=${encodeURIComponent(result.tripId)}` }); };
      if (selectedBefore && selectedBefore.id !== result.tripId && selectedBefore.status !== TripStatus.COMPLETED) {
        await tripService.selectCurrent(selectedBefore.id);
        const choice = await Taro.showModal({ title: '已加入旅行', content: '是否切换到刚加入的旅行？', confirmText: '查看旅行', cancelText: '稍后再看' });
        if (choice.confirm) await openTrip();
        else { await Taro.showToast({ title: '已加入，可在旅行列表中查看', icon: 'success' }); void Taro.reLaunch({ url: '/pages/dashboard/index' }); }
      } else await openTrip();
    } catch (cause) { await Taro.showToast({ title: cause instanceof Error ? cause.message : '加入失败，请重试', icon: 'none' }); }
    finally { setJoining(false); }
  };

  if (loading) return <View className="trip-invite-page"><LoadingState label="正在打开旅行邀请…" /></View>;
  if (error || !preview) return <View className="trip-invite-page is-error"><View className="invite-error-icon">!</View>
    <Text className="invite-title">邀请暂时不可用</Text><Text className="invite-copy">{error || '请检查邀请链接后重试'}</Text>
    <Button className="invite-secondary" onClick={() => void load()}>重新加载</Button></View>;

  const { trip, owner, memberCount } = preview;
  const route = trip.destinations.map((destination) => destination.countryName).join('  →  ');
  const period = [dateLabel(trip.startDate), dateLabel(trip.endDate)].filter(Boolean).join(' — ') || '日期待定';
  return <View className="trip-invite-page">
    <View className="invite-hero"><Text className="invite-eyebrow">TRAVEL TOGETHER</Text>
      <View className="invite-orbit"><View className="invite-orbit-dot" /><View className="invite-orbit-dot" /><View className="invite-orbit-dot" /></View>
      <Text className="invite-hero-caption">一段新的旅程，等你同行</Text></View>
    <View className="invite-trip-card"><Text className="invite-card-kicker">YOUR INVITATION</Text>
      <Text className="invite-trip-title">{trip.title}</Text><Text className="invite-trip-route">{route || '目的地待定'}</Text>
      <View className="invite-card-divider" /><View className="invite-meta-row"><Text>旅行日期</Text><Text>{period}</Text></View>
      <View className="invite-meta-row"><Text>邀请人</Text><View className="invite-owner">{owner.avatarUrl ? <Image src={owner.avatarUrl} mode="aspectFill" /> :
        <View className="invite-owner-fallback"><Text>{owner.nickname.slice(0, 1)}</Text></View>}<Text>{owner.nickname}</Text></View></View>
      <View className="invite-meta-row"><Text>同行人数</Text><Text>{memberCount} 位</Text></View>
      <Text className="invite-private-note">加入后，你可以和同行者共同查看、维护旅行计划。</Text>
    </View>
    <View className="invite-actions"><Button className="invite-primary" loading={joining} disabled={joining} onClick={() => void join()}>
      {profile ? '加入旅行' : '登录并加入旅行'}</Button><Button className="invite-secondary" onClick={() => void Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/dashboard/index' }))}>暂不加入</Button></View>
  </View>;
}
