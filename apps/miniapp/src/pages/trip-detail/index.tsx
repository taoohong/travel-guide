import { useEffect, useRef, useState } from 'react';
import Taro, { useDidShow, useRouter, useShareAppMessage } from '@tarojs/taro';
import { Button, Image, Text, View } from '@tarojs/components';
import { TripStatus } from '@travel-guide/constants';
import { sortTripDestinations } from '@travel-guide/core';
import type { ClientTrip } from '@travel-guide/api-client';
import { ErrorState, LoadingState } from '../../components/states';
import { clientApi } from '../../api/client';
import { destinationThemeByCode, destinationVisuals } from '../../features/travel/destinationVisuals';
import { mapService } from '../../services/mapService';
import { tripService } from '../../services/tripService';
import { usePlanStore } from '../../stores/planStore';
import { useCountryStore } from '../../stores/countryStore';
import { openGlobePage } from '../../utils/openGlobePage';
import './index.scss';

const countryNames: Record<string, string> = { JP: '日本', KR: '韩国', FR: '法国', HOME: '家' };
const statusNames: Record<TripStatus, string> = {
  DRAFT: '待规划', PREPARING: '待出发', DEPARTING: '即将出发', TRAVELING: '旅行中', RETURNING: '返程中', COMPLETED: '已完成',
};

type TouchPoint = { pageX?: number; pageY?: number; clientX?: number; clientY?: number; x?: number; y?: number };
const touchPosition = (touch?: TouchPoint) => touch && ({
  x: touch.pageX ?? touch.clientX ?? touch.x ?? 0,
  y: touch.pageY ?? touch.clientY ?? touch.y ?? 0,
});

function SwipeableDestinationCard({ name, englishName, caption, index, total, visual, theme, open,
  canDelete, onOpen, onClose, onNavigate, onDelete }: {
  name: string; englishName: string; caption: string; index: number; total: number;
  visual?: (typeof destinationVisuals)[string]; theme: string; open: boolean; canDelete: boolean;
  onOpen(): void; onClose(): void; onNavigate(): void; onDelete(): void;
}) {
  const start = useRef<{ x: number; y: number }>();
  const suppressClick = useRef(false);
  return <View className={`destination-stop ${open ? 'is-open' : ''}`} onTouchStart={(event) => {
    start.current = touchPosition((event as unknown as { touches?: TouchPoint[] }).touches?.[0]);
  }} onTouchEnd={(event) => {
    const point = touchPosition((event as unknown as { changedTouches?: TouchPoint[] }).changedTouches?.[0]);
    const origin = start.current;
    start.current = undefined;
    if (!point || !origin) return;
    const dx = point.x - origin.x; const dy = point.y - origin.y;
    if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 350);
    if (dx < 0 && canDelete) onOpen(); else onClose();
  }} onTouchCancel={() => { start.current = undefined; }}>
    {canDelete && <View className="destination-swipe-actions"><Button className="destination-swipe-delete"
      onClick={(event) => { event.stopPropagation(); onDelete(); }}>删除</Button></View>}
    <View className={`destination-swipe-face ${open ? 'is-open' : ''}`} onClick={(event) => {
      event.stopPropagation();
      if (suppressClick.current) { suppressClick.current = false; return; }
      if (open) { onClose(); return; }
      onNavigate();
    }} role="button" aria-label={`查看${name}攻略`}>
      <View className={`destination-card theme-${theme}`}>
        <View className="destination-card-glow" />
        <Text className="destination-index">{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</Text>
        <Text className="destination-name">{name}</Text>
        <Text className="destination-english">{englishName}</Text>
        <Text className="destination-caption">{caption}</Text>
        <Text className="destination-arrow">↗</Text>
      </View>
      {visual ? <Image className="destination-landmark" src={visual.asset} mode="aspectFit"
        style={{ width: visual.heroWidth, height: visual.heroHeight, top: visual.heroTop, right: visual.heroRight }} /> :
        <View className="destination-fallback-art"><View /><View /><View /></View>}
    </View>
  </View>;
}

export default function TripDetailPage() {
  const tripId = String(useRouter().params.tripId ?? '');
  const countries = useCountryStore((state) => state.countries);
  const [trip, setTrip] = useState<ClientTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [openDestinationId, setOpenDestinationId] = useState('');
  const [removingDestinationId, setRemovingDestinationId] = useState('');
  useShareAppMessage(() => ({ title: `邀请你加入「${trip?.title ?? '我的旅行'}」一起旅行`,
    path: inviteToken ? `/pages/trip-invite/index?token=${encodeURIComponent(inviteToken)}` : '/pages/dashboard/index' }));

  const load = async () => {
    if (!tripId) { setError('旅行编号无效'); setLoading(false); return; }
    setLoading(true); setError('');
    try { setTrip(await tripService.get(tripId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '旅行加载失败'); }
    finally { setLoading(false); }
  };
  useDidShow(() => { void load(); });
  useEffect(() => {
    if (useCountryStore.getState().initialized) return;
    void mapService.load((value) => useCountryStore.getState().updateContinents(value),
      (value) => useCountryStore.getState().updateCountries(value), () => useCountryStore.getState().markOffline())
      .then((result) => useCountryStore.getState().show(result.continents, result.countries, result.offline))
      .catch((cause: unknown) => useCountryStore.getState().fail(cause instanceof Error ? cause.message : '目的地加载失败'));
  }, []);

  if (loading && !trip) return <View className="trip-detail-page"><LoadingState label="正在加载旅行目的地…" /></View>;
  if (error && !trip) return <View className="trip-detail-page"><ErrorState message={error} onRetry={() => { void load(); }} /></View>;
  if (!trip) return <View className="trip-detail-page"><ErrorState message="没有找到这段旅行" onRetry={() => { void load(); }} /></View>;

  const destinations = sortTripDestinations(trip.destinations ?? []);
  const route = destinations.map((stop) => countries.find((country) => country.code === stop.countryCode)?.name ?? countryNames[stop.countryCode] ?? stop.countryCode);
  const canEdit = trip.memberRole === 'OWNER' && trip.status !== TripStatus.COMPLETED;
  const addDestination = async () => {
    if (!canEdit) return;
    try {
      await tripService.selectCurrent(trip.id);
      await openGlobePage();
    } catch { await Taro.showToast({ title: '暂时无法打开目的地选择', icon: 'none' }); }
  };
  const removeDestination = async (destinationId: string, name: string) => {
    if (!canEdit || removingDestinationId) return;
    setOpenDestinationId('');
    setRemovingDestinationId(destinationId);
    try {
      const result = await Taro.showModal({ title: '删除目的地', content: `确定从这段旅行中删除“${name}”吗？` });
      if (!result.confirm) return;
      setTrip(await tripService.removeDestination(trip.id, destinationId));
    }
    catch { await Taro.showToast({ title: '删除失败，请重试', icon: 'none' }); }
    finally { setRemovingDestinationId(''); }
  };
  const createInvite = async () => {
    if (inviteLoading || trip.memberRole !== 'OWNER') return;
    setInviteLoading(true);
    try { const invite = await clientApi.createTripInvite(trip.id); setInviteToken(invite.token); setInviteOpen(true); }
    catch { await Taro.showToast({ title: '邀请生成失败，请重试', icon: 'none' }); }
    finally { setInviteLoading(false); }
  };
  const copyInvite = async () => {
    if (!inviteToken) return;
    await Taro.setClipboardData({ data: `邀请你加入「${trip.title}」一起旅行：pages/trip-invite/index?token=${inviteToken}` });
    await Taro.showToast({ title: '邀请信息已复制', icon: 'success' });
  };
  const dissolveTrip = async () => {
    const result = await Taro.showModal({ title: '解散旅行', content: '这会永久删除旅行、目的地、共享计划和账单，同行者也会失去访问权限。' });
    if (!result.confirm) return;
    try { await clientApi.dissolveTrip(trip.id); }
    catch { await Taro.showToast({ title: '解散失败，请重试', icon: 'none' }); return; }
    setInviteOpen(false); usePlanStore.getState().clear(); await tripService.refresh().catch(() => undefined);
    await Taro.navigateBack();
  };
  const editTrip = () => { void Taro.navigateTo({ url: `/pages/trip-edit/index?tripId=${encodeURIComponent(trip.id)}` }); };
  const openPlan = async () => { await tripService.selectCurrent(trip.id); void Taro.reLaunch({ url: '/pages/dashboard/index?tab=plan' }); };

  return <View className="trip-detail-page">
    <View className="trip-detail-hero" onClick={canEdit ? editTrip : undefined} role={canEdit ? 'button' : undefined} aria-label={canEdit ? '编辑旅行信息' : undefined}><Text className="trip-detail-kicker">YOUR DESTINATIONS · {statusNames[trip.status]}</Text>
      <View className="trip-detail-title-row"><Text className="trip-detail-title">{trip.title}</Text>
        <View className="trip-detail-collaboration" aria-label="旅行同行成员">
          <View className="trip-detail-avatar-stack">{(trip.members ?? []).slice(0, 4).map((member) => <View className="trip-detail-avatar" key={member.userId}>
            {member.avatarUrl ? <Image src={member.avatarUrl} mode="aspectFill" /> : <Text>{member.nickname.slice(0, 1)}</Text>}</View>)}
            <View className="trip-detail-member-count"><Text>+{trip.members?.length ?? 1}</Text></View>
          </View>
          {canEdit && <Button className="trip-detail-invite-add" loading={inviteLoading} onClick={(event) => { event.stopPropagation(); void createInvite(); }} aria-label="邀请同行">＋</Button>}
        </View>
      </View>
      <Text className="trip-detail-route">{route.length ? route.join('  →  ') : '这段旅行还没有目的地'}</Text>
      <View className="trip-detail-meta"><Text>{trip.startDate?.slice(0, 10) || '日期待定'}{trip.endDate ? ` — ${trip.endDate.slice(0, 10)}` : ''}</Text>
        <Text>{destinations.length} 个目的地</Text></View>
    </View>
    <Button className="trip-detail-open-plan" onClick={() => void openPlan()}>查看这段旅行的计划</Button>
    <View className="destination-route">
      {destinations.length ? destinations.map((stop, index) => {
        const country = countries.find((item) => item.code === stop.countryCode);
        const visual = destinationVisuals[stop.countryCode];
        const name = country?.name ?? countryNames[stop.countryCode] ?? stop.countryCode;
        return <SwipeableDestinationCard key={stop.id} name={name}
          englishName={country?.nameEn ?? stop.countryCode} caption={visual?.caption ?? '下一站，去发现新的风景'}
          index={index} total={destinations.length} visual={visual}
          theme={destinationThemeByCode[stop.countryCode] ?? 'fallback'} open={openDestinationId === stop.id}
          canDelete={canEdit} onOpen={() => setOpenDestinationId(stop.id)} onClose={() => setOpenDestinationId('')}
          onNavigate={() => { void Taro.navigateTo({ url: `/pages/destination-detail/index?countryCode=${stop.countryCode}` }); }}
          onDelete={() => { void removeDestination(stop.id, name); }} />;
      }) : <View className="destination-empty"><Text>目的地还在等待加入</Text>{canEdit && <Button onClick={addDestination}>去选择目的地</Button>}</View>}
      {canEdit && destinations.length > 0 && <Button className="destination-add" onClick={addDestination}>＋ 继续添加目的地</Button>}
    </View>
    {inviteOpen && <View className="trip-detail-invite-mask" onClick={() => setInviteOpen(false)}><View className="trip-detail-invite-sheet" onClick={(event) => event.stopPropagation()}>
      <Text className="trip-detail-invite-kicker">TRAVEL TOGETHER</Text><Text className="trip-detail-invite-title">邀请同行</Text>
      <Text className="trip-detail-invite-copy">分享给旅伴，一起查看和维护这段旅行计划。</Text>
      <Button className="trip-detail-share-button" openType="share">发送给微信好友</Button>
      <Button className="trip-detail-copy-button" onClick={() => { void copyInvite(); }}>复制邀请信息</Button>
      {trip.memberRole === 'OWNER' && <Button className="trip-detail-copy-button trip-detail-danger-button" onClick={() => void dissolveTrip()}>解散这段旅行</Button>}
      <Button className="trip-detail-copy-button" onClick={() => setInviteOpen(false)}>完成</Button>
    </View></View>}
  </View>;
}
