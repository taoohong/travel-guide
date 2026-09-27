import { useEffect, useRef, useState } from 'react';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Button, Image, Input, Picker, ScrollView, Text, Textarea, View } from '@tarojs/components';
import { getCurrentTripStage, groupTravelLegs, sortTripDestinations } from '@travel-guide/core';
import { PlanItemType, PlanScope, PlanSourceType, PlanStage, TripStatus } from '@travel-guide/constants';
import type { PlanItem } from '@travel-guide/types';
import type { ClientTripMember } from '@travel-guide/api-client';
import { clientApi } from '../../api/client';
import { ErrorState, LoadingState } from '../../components/states';
import { planService } from '../../services/planService';
import { tripService } from '../../services/tripService';
import { usePlanStore } from '../../stores/planStore';
import { useTripStore } from '../../stores/tripStore';
import { SwipeablePlanItem } from './SwipeablePlanItem';
import { TripExpenseContent } from './TripExpenseContent';
import { datePart, nearestRowForDate, stageNames, timelineRows, tripDates } from './timelineModel';
import tumiExpect from '../../assets/tumi/tumi期待.jpg';

const countryNames: Record<string, string> = { JP: '日本', KR: '韩国', FR: '法国', HOME: '家' };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const weekday = (date: string) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${date}T00:00:00Z`).getUTCDay()];
const rowHeight = () => Taro.getSystemInfoSync().windowWidth * 148 / 750;
const timelineCardScale = (index: number, offset: number, height: number) =>
  Math.max(0.72, 1 - Math.abs(index - ((offset + height / 2) / rowHeight() - 0.5)) * 0.05);
const statusByStage: Record<PlanStage, TripStatus> = {
  PREPARING: TripStatus.PREPARING, DEPARTING: TripStatus.DEPARTING,
  TRAVELING: TripStatus.TRAVELING, RETURNING: TripStatus.RETURNING,
};
const statusOrder = [TripStatus.DRAFT, TripStatus.PREPARING, TripStatus.DEPARTING,
  TripStatus.TRAVELING, TripStatus.RETURNING, TripStatus.COMPLETED] as const;

export function PlanTabContent({ active, onStartTrip, onAddDestination }: {
  active: boolean; onStartTrip: () => void; onAddDestination(): void;
}) {
  const { currentTrip: trip, trips, loading: tripLoading, error: tripError } = useTripStore();
  const { items, loading, error } = usePlanStore();
  const [section, setSection] = useState<'plan' | 'expenses'>('plan');
  const [selectedDate, setSelectedDate] = useState(''); const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0); const [openId, setOpenId] = useState<string | null>(null);
  const [timelineOffset, setTimelineOffset] = useState(0); const [timelineHeight, setTimelineHeight] = useState(0);
  const [timelineScrolling, setTimelineScrolling] = useState(false);
  const [adding, setAdding] = useState(false); const [title, setTitle] = useState(''); const [notes, setNotes] = useState('');
  const [tripSwitcherOpen, setTripSwitcherOpen] = useState(false); const [switchingTrip, setSwitchingTrip] = useState(false);
  const [planDate, setPlanDate] = useState(''); const [submitting, setSubmitting] = useState(false); const [undo, setUndo] = useState<PlanItem | null>(null);
  const [collaborationOpen, setCollaborationOpen] = useState(false); const [members, setMembers] = useState<ClientTripMember[]>([]);
  const [memberRole, setMemberRole] = useState<'OWNER' | 'MEMBER'>('MEMBER'); const [inviteToken, setInviteToken] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(); const selectedIndexRef = useRef(0);
  const touchingTimeline = useRef(false); const userScrolledTimeline = useRef(false); const switchingStage = useRef(false);
  useShareAppMessage(() => ({ title: `邀请你加入「${trip?.title ?? '我的旅行'}」`,
    path: inviteToken ? `/pages/trip-invite/index?token=${encodeURIComponent(inviteToken)}` : '/pages/dashboard/index' }));
  const refresh = async () => { const current = await tripService.refresh(); if (current) await planService.refresh(current.id); else usePlanStore.getState().clear(); };
  const selectTrip = async (tripId: string) => {
    setTripSwitcherOpen(false);
    if (tripId === trip?.id || switchingTrip) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    setOpenId(null); setUndo(null); userScrolledTimeline.current = false; touchingTimeline.current = false;
    setSwitchingTrip(true); usePlanStore.getState().clear();
    try { const selected = await tripService.selectCurrent(tripId); await planService.refresh(selected.id); }
    catch {
      const current = useTripStore.getState().currentTrip;
      if (current && usePlanStore.getState().tripId !== current.id) await planService.refresh(current.id).catch(() => undefined);
      await Taro.showToast({ title: '切换旅行失败，请重试', icon: 'none' });
    }
    finally { setSwitchingTrip(false); }
  };
  useEffect(() => { if (active) void refresh(); }, [active]);
  useEffect(() => () => { if (scrollTimer.current) clearTimeout(scrollTimer.current); }, []);
  useEffect(() => {
    if (!trip) return; const dates = tripDates(trip.startDate, trip.endDate);
    const next = dates.includes(today()) ? today() : dates[0] ?? '';
    setSelectedDate(next); const index = next ? nearestRowForDate(timelineRows(items, trip.startDate, trip.endDate), next) : 0;
    selectedIndexRef.current = index; setSelectedIndex(index); setScrollTop(index * rowHeight());
  }, [trip?.id]);
  useEffect(() => {
    if (!trip || !items.length || selectedIndexRef.current !== 0) return;
    const next = nearestRowForDate(timelineRows(items, trip.startDate, trip.endDate), selectedDate || today());
    if (next > 0) { selectedIndexRef.current = next; setSelectedIndex(next); setScrollTop(next * rowHeight()); }
  }, [trip?.id, items.length, selectedDate]);
  useEffect(() => {
    if (!trip || section !== 'plan') return;
    Taro.nextTick(() => {
      const query = Taro.createSelectorQuery();
      query.select('.timeline-shell').boundingClientRect((result) => {
        const rect = Array.isArray(result) ? result[0] : result;
        if (rect) setTimelineHeight(rect.height);
      });
      query.exec();
    });
  }, [trip?.id, section]);
  if ((tripLoading || loading) && !trip) return <View className="tab-content plan-tab"><LoadingState /></View>;
  if (tripError && !trip) return <View className="tab-content plan-tab"><ErrorState message={tripError} onRetry={() => { void refresh(); }} /></View>;
  if (!trip) return <View className="tab-content plan-tab">
    <Text className="tab-eyebrow">YOUR JOURNEY</Text>
    <Text className="tab-title">旅行计划</Text>
    <View className="travel-empty plan-empty">
      <Image className="travel-empty-art" src={tumiExpect} mode="aspectFit" />
      <Text className="travel-empty-title">还没有旅行计划</Text>
      <Text className="travel-empty-copy">去挑选目的地，创建第一张旅行机票。</Text>
      <Button className="travel-empty-button" onClick={onStartTrip}>开始一段旅行 <Text>↗</Text></Button>
    </View>
  </View>;
  const dates = tripDates(trip.startDate, trip.endDate); const rows = timelineRows(items, trip.startDate, trip.endDate);
  const currentStage = getCurrentTripStage(trip); const destinations = sortTripDestinations(trip.destinations);
  const legs = groupTravelLegs(destinations);
  const chooseDate = (date: string) => { setSelectedDate(date); const index = nearestRowForDate(rows, date);
    selectedIndexRef.current = index; setSelectedIndex(index); setScrollTop(index * rowHeight()); setOpenId(null); };
  const switchToStage = async (stage: PlanStage) => {
    const current = useTripStore.getState().currentTrip;
    if (!current || switchingStage.current) return;
    const targetIndex = statusOrder.indexOf(statusByStage[stage]); let currentIndex = statusOrder.indexOf(current.status);
    if (currentIndex === targetIndex) return;
    switchingStage.current = true;
    try {
      while (currentIndex !== targetIndex) {
        currentIndex += currentIndex < targetIndex ? 1 : -1;
        await tripService.confirmStage(current.id, statusOrder[currentIndex]!);
      }
      await planService.refresh(current.id);
    } catch { await Taro.showToast({ title: '阶段切换失败，请重试', icon: 'none' }); }
    finally { switchingStage.current = false; }
  };
  const settleTimelineScroll = () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      if (touchingTimeline.current) return;
      setTimelineScrolling(false);
      const index = selectedIndexRef.current;
      setScrollTop(index * rowHeight());
      if (userScrolledTimeline.current) {
        userScrolledTimeline.current = false;
        const stage = rows[index]?.stage;
        if (stage) void switchToStage(stage);
      }
    }, 110);
  };
  const scrollTimeline = (offset: number) => {
    setTimelineOffset(offset); setTimelineScrolling(true);
    const index = Math.max(0, Math.min(rows.length - 1, Math.round(offset / rowHeight())));
    if (selectedIndexRef.current !== index) { selectedIndexRef.current = index; setSelectedIndex(index);
      if (rows[index]?.date && dates.includes(rows[index]!.date!)) setSelectedDate(rows[index]!.date!); }
    settleTimelineScroll();
  };
  const saveManual = async () => {
    if (!title.trim()) { await Taro.showToast({ title: '请输入事项标题', icon: 'none' }); return; }
    setSubmitting(true); try { await planService.add(trip.id, { title: title.trim(), description: notes.trim() || null, stage: currentStage,
      itemType: PlanItemType.PACKING_ITEM, scope: PlanScope.TRIP, sourceType: PlanSourceType.USER, sourceId: null,
      sourceCountryCode: null, dedupeKey: null, planDate: planDate ? `${planDate}T00:00:00.000Z` : null });
      setTitle(''); setNotes(''); setPlanDate(''); setAdding(false); }
    catch { await Taro.showToast({ title: '添加失败，请重试', icon: 'none' }); } finally { setSubmitting(false); }
  };
  const remove = async (item: PlanItem) => { setOpenId(null); try { setUndo(await planService.remove(trip.id, item.id));
      await Taro.showToast({ title: '已删除，可点击撤销', icon: 'none' }); }
    catch { await Taro.showToast({ title: '删除失败，请重试', icon: 'none' }); } };
  const openCollaboration = async () => {
    setInviteToken(''); setCollaborationOpen(true);
    try { const result = await clientApi.tripMembers(trip.id); setMembers(result.items); setMemberRole(result.role); }
    catch { await Taro.showToast({ title: '成员加载失败，请重试', icon: 'none' }); }
  };
  const prepareInvite = async () => {
    if (inviteLoading) return; setInviteLoading(true);
    try { const invite = await clientApi.createTripInvite(trip.id); setInviteToken(invite.token);
      const result = await clientApi.tripMembers(trip.id); setMembers(result.items); setMemberRole(result.role); }
    catch { await Taro.showToast({ title: '邀请生成失败，请重试', icon: 'none' }); }
    finally { setInviteLoading(false); }
  };
  const copyInvite = async () => {
    let token = inviteToken;
    if (!token) { const invite = await clientApi.createTripInvite(trip.id); token = invite.token; setInviteToken(token); }
    await Taro.setClipboardData({ data: `邀请你加入「${trip.title}」一起旅行：pages/trip-invite/index?token=${token}` });
    await Taro.showToast({ title: '邀请信息已复制', icon: 'success' });
  };
  const removeMember = async (member: ClientTripMember) => {
    const result = await Taro.showModal({ title: '移除同行者', content: `确定移除 ${member.nickname}？` });
    if (!result.confirm) return;
    try { await clientApi.removeTripMember(trip.id, member.userId); setMembers((rows) => rows.filter((row) => row.userId !== member.userId)); }
    catch { await Taro.showToast({ title: '移除失败，请重试', icon: 'none' }); }
  };
  const leaveTrip = async () => {
    const result = await Taro.showModal({ title: '退出旅行', content: '退出后，这段旅行将从你的旅行列表中移除。' });
    if (!result.confirm) return;
    try { await clientApi.leaveTrip(trip.id); setCollaborationOpen(false); usePlanStore.getState().clear(); await tripService.refresh(); }
    catch { await Taro.showToast({ title: '退出失败，请重试', icon: 'none' }); }
  };
  return <View className="tab-content plan-tab">
    <View className="plan-top">
      <View className="plan-title-block"><Text className="tab-eyebrow">YOUR JOURNEY</Text><View className="plan-heading-row">
        <Text className="plan-heading">{trip.title}</Text>
        {trips.length > 1 && <Button className="plan-trip-switch" disabled={switchingTrip} onClick={() => setTripSwitcherOpen(true)}>
          {switchingTrip ? '切换中…' : '切换 ▾'}</Button>}
      </View></View>
      <View className="plan-top-actions">
        <View className="plan-header-members" onClick={() => void openCollaboration()} role="button" aria-label="查看同行成员">
          <View className="plan-participant-stack">{(trip.members ?? []).slice(0, 4).map((member) => <View className="plan-participant-avatar" key={member.userId}>
            {member.avatarUrl ? <Image src={member.avatarUrl} mode="aspectFill" /> : <Text>{member.nickname.slice(0, 1)}</Text>}</View>)}</View>
          <View className="plan-participant-count"><Text>+{trip.members?.length ?? 1}</Text></View>
        </View>
        <Button className="plan-invite-add" onClick={() => void openCollaboration()} aria-label="邀请同行">＋</Button>
      </View>
    </View>
    <ScrollView scrollX className="plan-route-scroll"><View className="plan-route">
      {destinations.map((destination) => <View className="plan-route-stop" key={destination.id}>
        <Text>{countryNames[destination.countryCode] ?? destination.countryCode}</Text></View>)}
      {trip.memberRole === 'OWNER' && <Button className="route-add" onClick={onAddDestination}>＋ 添加目的地</Button>}</View></ScrollView>
    <PlanSectionTabs section={section} onChange={setSection} />
    {section === 'expenses' ? <TripExpenseContent key={trip.id} trip={trip} /> : <>
    {dates.length ? <ScrollView scrollX scrollIntoView={selectedDate ? `date-${selectedDate}` : undefined} className="date-strip">
      <View className="date-strip-inner">{dates.map((date) => <View id={`date-${date}`} key={date}
        className={`date-cell ${selectedDate === date ? 'is-selected' : ''}`} onClick={() => chooseDate(date)} role="button" aria-label={`选择${date}`}>
        <Text>{weekday(date)}</Text><Text>{date.slice(8)}</Text>{date === today() && <View className="today-dot" />}</View>)}
        <Button className="date-add-item" onClick={() => setAdding(true)}>＋ 事项</Button></View>
    </ScrollView> : <View className="date-strip-empty"><Text>设置旅行日期后，可按天浏览计划</Text>
      <Button className="date-add-item" onClick={() => setAdding(true)}>＋ 添加事项</Button></View>}
    <View className="timeline-shell">
      <ScrollView scrollY enhanced showScrollbar={false} className="timeline-scroll" scrollTop={scrollTop}
        onTouchStart={() => { touchingTimeline.current = true; userScrolledTimeline.current = true; }}
        onTouchEnd={() => { touchingTimeline.current = false; settleTimelineScroll(); }}
        onScroll={(event) => scrollTimeline(event.detail.scrollTop)}>
        <View className="timeline-list">{rows.map((row, index) => <View key={row.key}
          className={`timeline-row ${row.item ? 'has-item' : 'is-stage'}`}>
          <View className="timeline-axis"><Text className="timeline-time">{row.item?.planDate ? row.item.planDate.slice(11, 16) : row.item && row.date ? row.date.slice(5) : ''}</Text>
            <View className={`timeline-node ${row.item ? 'item-node' : 'stage-node'} stage-${row.stage.toLowerCase()} ${row.item?.done ? 'is-done' : ''}`}>{row.item?.done ? '✓' : ''}</View></View>
          <View className="timeline-entry" style={row.item ? { transform: `scale(${timelineScrolling && timelineHeight ? timelineCardScale(index, timelineOffset, timelineHeight) : 1})` } : undefined}>
            {row.item ? <SwipeablePlanItem item={row.item} selected={index === selectedIndex} open={openId === row.item.id}
            onOpen={() => setOpenId(row.item!.id)} onClose={() => setOpenId(null)}
            onToggle={() => { void planService.toggleDone(trip.id, row.item!); }}
            onEdit={() => { void Taro.navigateTo({ url: `/pages/plan-item-edit/index?planItemId=${row.item!.id}` }); }}
            onRemove={() => { void remove(row.item!); }} /> : <View className="timeline-stage-marker">
            <View><Text className="stage-name">{stageNames[row.stage]}</Text>
              <Text className="stage-caption">{row.stage === currentStage ? '当前阶段' : row.date ? `${datePart(row.date)} · ${items.filter((item) => item.stage === row.stage).length} 项` : '旅程阶段'}</Text></View>
            {row.stage === currentStage && <Text className={`stage-current-tag stage-${row.stage.toLowerCase()}`}>正在进行</Text>}
          </View>}</View>
        </View>)}</View>
      </ScrollView>
    </View>
    {legs.length > 0 && <Text className="plan-footer-route">{legs.map((leg) => `${countryNames[leg.from] ?? leg.from} → ${countryNames[leg.to] ?? leg.to}`).join('   ·   ')}</Text>}
    {error && <Text className="form-error">{error}</Text>}
    {adding && <View className="sheet-mask" onClick={() => setAdding(false)}><View className="trip-sheet" onClick={(event) => event.stopPropagation()}>
      <Text className="sheet-kicker">NEW PLAN ITEM</Text><Text className="sheet-title">添加计划事项</Text>
      <Input className="trip-input" value={title} placeholder="要做什么？" onInput={(event) => setTitle(event.detail.value)} />
      <Textarea className="manual-textarea" value={notes} placeholder="备注（选填）" maxlength={500} onInput={(event) => setNotes(event.detail.value)} />
      <Picker mode="date" value={planDate} onChange={(event) => setPlanDate(String(event.detail.value))}><View className="trip-input">{planDate || '计划日期（选填）'}</View></Picker>
      <View className="sheet-actions"><Button className="sheet-secondary" onClick={() => setAdding(false)}>取消</Button>
        <Button className="sheet-primary" loading={submitting} disabled={submitting} onClick={() => { void saveManual(); }}>保存</Button></View>
    </View></View>}
    {collaborationOpen && <View className="sheet-mask" onClick={() => setCollaborationOpen(false)}><View className="trip-sheet collaboration-sheet" onClick={(event) => event.stopPropagation()}>
      <Text className="sheet-kicker">TRAVEL TOGETHER</Text><Text className="sheet-title">同行成员</Text>
      <Text className="collaboration-caption">所有同行者共同维护同一份旅行计划</Text>
      <View className="collaboration-members">{members.map((member) => <View className="collaboration-member" key={member.userId}>
        <View className="collaboration-avatar">{member.avatarUrl ? <Image src={member.avatarUrl} mode="aspectFill" /> : <Text>{member.nickname.slice(0, 1)}</Text>}</View>
        <View className="collaboration-member-copy"><Text>{member.nickname}</Text><Text>{member.role === 'OWNER' ? '旅行创建者' : '同行成员'}</Text></View>
        {memberRole === 'OWNER' && member.role === 'MEMBER' && <Text className="collaboration-remove" onClick={() => void removeMember(member)}>移除</Text>}
      </View>)}</View>
      {memberRole === 'OWNER' ? <><Button className="collaboration-primary" loading={inviteLoading} onClick={() => void prepareInvite()}>
        {inviteToken ? '重新生成邀请' : '生成微信邀请'}</Button>
        {inviteToken && <Button className="collaboration-share" openType="share">发送给微信好友</Button>}
        <Button className="collaboration-secondary" onClick={() => void copyInvite()}>复制邀请信息</Button>
        {inviteToken && <Button className="collaboration-danger" onClick={async () => { await clientApi.revokeTripInvites(trip.id); setInviteToken('');
          await Taro.showToast({ title: '邀请已撤销', icon: 'success' }); }}>撤销当前邀请</Button>}</> :
        <Button className="collaboration-danger" onClick={() => void leaveTrip()}>退出这段旅行</Button>}
      <Button className="collaboration-secondary" onClick={() => setCollaborationOpen(false)}>完成</Button>
    </View></View>}
    {tripSwitcherOpen && <View className="sheet-mask" onClick={() => setTripSwitcherOpen(false)}><View className="trip-sheet plan-trip-switch-sheet" onClick={(event) => event.stopPropagation()}>
      <Text className="sheet-kicker">YOUR JOURNEYS</Text><Text className="sheet-title">切换旅行</Text>
      <ScrollView scrollY enhanced showScrollbar={false} className="plan-trip-switch-list" style={{ height: `${Math.min(trips.length * 88, 520)}rpx` }}>
        {trips.map((option) => <View key={option.id} className={`plan-trip-option ${option.id === trip.id ? 'is-current' : ''}`}
          onClick={() => { void selectTrip(option.id); }} role="button" aria-current={option.id === trip.id ? 'true' : 'false'}>
          <View className="plan-trip-option-copy"><Text>{option.title}</Text>
            <Text>{sortTripDestinations(option.destinations).map((destination) => countryNames[destination.countryCode] ?? destination.countryCode).join(' → ') || '尚未添加目的地'}</Text></View>
          {option.id === trip.id && <Text className="plan-trip-option-check">✓</Text>}
        </View>)}
      </ScrollView>
      <Button className="collaboration-secondary plan-trip-switch-close" onClick={() => setTripSwitcherOpen(false)}>完成</Button>
    </View></View>}
    {undo && <View className="undo-bar"><Text>计划事项已删除</Text><Button onClick={() => { const snapshot = undo; setUndo(null);
      void planService.undo(trip.id, snapshot).catch(() => { setUndo(snapshot); void Taro.showToast({ title: '撤销失败，请重试', icon: 'none' }); }); }}>撤销</Button></View>}
  </>}</View>;
}

function PlanSectionTabs({ section, onChange }: { section: 'plan' | 'expenses'; onChange(section: 'plan' | 'expenses'): void }) {
  return <View className="plan-section-tabs" role="tablist" aria-label="旅行页面">
    <View className={`plan-section-tab ${section === 'plan' ? 'is-active' : ''}`} role="tab" aria-selected={section === 'plan'}
      onClick={() => onChange('plan')}>旅行计划</View>
    <View className={`plan-section-tab ${section === 'expenses' ? 'is-active' : ''}`} role="tab" aria-selected={section === 'expenses'}
      onClick={() => onChange('expenses')}>旅行记账</View>
  </View>;
}
