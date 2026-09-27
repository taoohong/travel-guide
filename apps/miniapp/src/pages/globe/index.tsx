import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { Button, Input, Picker, ScrollView, Text, Textarea, View } from '@tarojs/components';
import { ApiError } from '@travel-guide/api-client';
import type { GlobeCanvasProps } from '../../canvas/globe/GlobeCanvas';
import { globePerformance } from '../../canvas/globe/GlobePerformance';
import { mapService } from '../../services/mapService';
import { tripService } from '../../services/tripService';
import { getStoredAccountToken, useAccountStore } from '../../stores/accountStore';
import { useCountryStore } from '../../stores/countryStore';
import { useTripStore } from '../../stores/tripStore';
import { getNativeMenuButtonLayout } from '../../utils/nativeMenuButton';
import './index.scss';

const toIsoDate = (date: string) => date ? `${date}T00:00:00.000Z` : null;

export default function GlobePage() {
  globePerformance.reactRender('page');
  const { continents, countries } = useCountryStore();
  const currentTrip = useTripStore((state) => state.currentTrip);
  const [continentCode, setContinentCode] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [temporarySelectedDestinations, setTemporarySelectedDestinations] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tripFormOpen, setTripFormOpen] = useState(false);
  const [tripTitle, setTripTitle] = useState('我的旅行');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tripNotes, setTripNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pageActive, setPageActive] = useState(true);
  const [GlobeCanvas, setGlobeCanvas] = useState<ComponentType<GlobeCanvasProps> | null>(null);
  const [menuLayout] = useState(() => getNativeMenuButtonLayout());
  const actionLocked = useRef(false);
  const pageVisible = useRef(true);

  useDidHide(() => { pageVisible.current = false; setPageActive(false); });
  useDidShow(() => { pageVisible.current = true; setPageActive(true); });

  useEffect(() => {
    const onHide = () => { pageVisible.current = false; setPageActive(false); };
    const onShow = () => { pageVisible.current = true; setPageActive(true); };
    Taro.onAppHide(onHide);
    Taro.onAppShow(onShow);
    return () => { Taro.offAppHide(onHide); Taro.offAppShow(onShow); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void import('../../canvas/globe/GlobeCanvas').then((module) => {
      if (!cancelled) setGlobeCanvas(() => module.GlobeCanvas);
    }).catch(() => { if (!cancelled) setError('地球暂时无法加载，请重试'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const tasks: Promise<unknown>[] = [];
      if (!useCountryStore.getState().initialized) {
        tasks.push(mapService.load((value) => useCountryStore.getState().updateContinents(value),
          (value) => useCountryStore.getState().updateCountries(value), () => useCountryStore.getState().markOffline())
          .then((result) => useCountryStore.getState().show(result.continents, result.countries, result.offline)));
      }
      if (!useTripStore.getState().initialized) tasks.push(tripService.refresh());
      try { await Promise.all(tasks); }
      catch { if (!cancelled) setError('目的地加载失败，请重试'); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const back = () => {
    void Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/dashboard/index' }));
  };
  const needsSignIn = () => !useAccountStore.getState().profile || !getStoredAccountToken();
  const openLogin = async () => {
    setError('登录后即可创建旅行，已选目的地会保留');
    try { await Taro.navigateTo({ url: '/pages/login/index' }); }
    catch { setError('请先登录后再创建旅行'); }
  };
  const handleActionError = (cause: unknown, action: '创建' | '添加') => {
    if (cause instanceof ApiError && cause.status === 401) {
      setError('登录状态已失效，请重新登录');
      setSubmitting(false);
      void Taro.navigateTo({ url: '/pages/login/index' }).catch(() => {});
      return;
    }
    const message = cause instanceof ApiError || cause instanceof Error ? cause.message : '';
    setError(message || `${action}旅行失败，请重试`);
  };
  const add = (code: string) => {
    setFocus(code);
    setTemporarySelectedDestinations((selected) => [...selected, code]);
    setError('');
  };
  const toggle = (code: string) => {
    setFocus(code);
    setTemporarySelectedDestinations((selected) => {
      const lastIndex = selected.lastIndexOf(code);
      return lastIndex < 0 ? [...selected, code] : selected.filter((_, index) => index !== lastIndex);
    });
    setError('');
  };
  const removeSelection = (removeIndex: number) => {
    setTemporarySelectedDestinations((selected) => selected.filter((_, index) => index !== removeIndex));
  };
  const cancelSelection = () => {
    if (actionLocked.current) return;
    setSheetOpen(false);
    setTripFormOpen(false);
    setTemporarySelectedDestinations([]);
    setFocus(null);
    setError('');
  };
  const createTrip = async () => {
    if (actionLocked.current || !temporarySelectedDestinations.length) return;
    if (!tripTitle.trim()) { setError('请输入旅行名称'); return; }
    if (startDate && endDate && startDate > endDate) { setError('返程日期不能早于出发日期'); return; }
    actionLocked.current = true;
    if (needsSignIn()) {
      try { await openLogin(); }
      finally { actionLocked.current = false; }
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const trip = await tripService.createWithDestinations(tripTitle.trim(), temporarySelectedDestinations, {
        startDate: toIsoDate(startDate), endDate: toIsoDate(endDate), notes: tripNotes.trim() || null,
      });
      if (!pageVisible.current) return;
      setTemporarySelectedDestinations([]);
      setSheetOpen(false);
      setTripFormOpen(false);
      const url = `/pages/trip-detail/index?tripId=${encodeURIComponent(trip.id)}`;
      try { await Taro.redirectTo({ url }); }
      catch { await Taro.navigateTo({ url }).catch(() => Taro.reLaunch({ url: '/pages/dashboard/index?tab=travel' })); }
    } catch (cause) {
      if (pageVisible.current) handleActionError(cause, '创建');
    } finally {
      actionLocked.current = false;
      if (pageVisible.current) setSubmitting(false);
    }
  };
  const addToCurrentTrip = async () => {
    if (actionLocked.current || !currentTrip || !temporarySelectedDestinations.length) return;
    actionLocked.current = true;
    if (needsSignIn()) {
      try { await openLogin(); }
      finally { actionLocked.current = false; }
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await tripService.addDestinations(currentTrip.id, temporarySelectedDestinations);
      if (!pageVisible.current) return;
      setTemporarySelectedDestinations([]);
      setSheetOpen(false);
      await Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/dashboard/index' }));
    } catch (cause) {
      if (pageVisible.current) handleActionError(cause, '添加');
    } finally {
      actionLocked.current = false;
      if (pageVisible.current) setSubmitting(false);
    }
  };
  const openTripForm = () => {
    setTripTitle('我的旅行'); setStartDate(''); setEndDate(''); setTripNotes(''); setError(''); setTripFormOpen(true);
  };

  const query = countryQuery.trim().toLowerCase();
  const visibleCountries = countries.filter((country) => {
    const matchesContinent = Boolean(query) || !continentCode || country.continentCode === continentCode;
    const matchesQuery = !query || country.name.toLowerCase().includes(query) || country.nameEn.toLowerCase().includes(query);
    return matchesContinent && matchesQuery;
  });
  const countryNames = new Map(countries.map((country) => [country.code, country.name || country.nameEn]));
  const countryName = (code: string) => countryNames.get(code) || '目的地';
  const focused = countries.find((country) => country.code === focus);
  return <View className="full-globe-page">
    <Text className="globe-nav-title" style={{ top: `${menuLayout.top}px`, height: `${menuLayout.height}px` }}>
      Let's Pick!
    </Text>
    <View className="globe-topbar" style={{ paddingTop: `${menuLayout.headerInset}rpx` }}>
      <Text className="globe-back" style={{ top: `${menuLayout.top}px`, height: `${menuLayout.height}px` }}
        onClick={back} aria-label="返回">‹</Text>
      <View className="globe-heading">
        <Text className="globe-title">选择你想去的地方</Text>
      </View>
      <Button className="globe-done" disabled={loading || submitting || temporarySelectedDestinations.length === 0}
        onClick={() => { setError(''); setSheetOpen(true); }}>
        完成{temporarySelectedDestinations.length ? ` · ${temporarySelectedDestinations.length}` : ''}
      </Button>
    </View>

    <View className="full-globe-stage">
      {!GlobeCanvas && <View className="globe-placeholder"><Text>正在绘制地球…</Text></View>}
      {GlobeCanvas && <GlobeCanvas active={pageActive} interactive={pageActive} id="fullscreen-travel-globe"
        continentCode={continentCode} onContinentChange={setContinentCode}
        onCountrySelect={toggle} selectedCountryCodes={temporarySelectedDestinations} focusedCountryCode={focus} />}
    </View>

    <View className="globe-bottom">
      <View className="globe-search-box">
        <View className="globe-search-icon" />
        <Input className="globe-search-input" value={countryQuery} placeholder="搜索国家名称，如日本、France"
          confirmType="search" maxlength={40} onInput={(event) => setCountryQuery(event.detail.value)} aria-label="搜索国家" />
        {countryQuery && <Text className="globe-search-clear" onClick={() => setCountryQuery('')} aria-label="清除搜索">×</Text>}
      </View>
      <View className="globe-focus"><Text>{focused ? `正在查看 · ${focused.name}` : '选择大陆，查看可选国家'}</Text>
        <Text>已选 {temporarySelectedDestinations.length} 个</Text></View>
      <ScrollView scrollX className="globe-continent-scroll"><View className="globe-continent-row">
        {continents.map((item) => <Button key={item.code} className={`continent-pill ${item.code === continentCode ? 'is-active' : ''}`}
          disabled={submitting} onClick={() => setContinentCode(item.code)}>{item.name}</Button>)}
      </View></ScrollView>
      <View className="globe-country-prompt"><Text>选择你想去的国家</Text></View>
      <ScrollView scrollY className="globe-country-scroll" enhanced>
        <View className="globe-country-row">{visibleCountries.map((country) => {
        const count = temporarySelectedDestinations.filter((code) => code === country.code).length;
        return <View className={`globe-country-chip ${count ? 'is-selected' : ''} ${focus === country.code ? 'is-focused' : ''}`} key={country.code}>
          <View onClick={() => toggle(country.code)} role="button" aria-label={`${count ? '取消' : '选择'}${countryName(country.code)}`}>
            <Text>{countryName(country.code)}</Text><Text>{count ? `✓${count > 1 ? ` ${count}` : ''}` : '＋'}</Text></View>
          {count > 0 && <Button aria-label={`再次添加${countryName(country.code)}`} onClick={() => add(country.code)}>＋</Button>}
        </View>;
      })}
          {!loading && countries.length > 0 && visibleCountries.length === 0 &&
            <Text className="globe-empty">{query ? '没有找到匹配的国家' : '当前没有可选国家'}</Text>}
          {!loading && countries.length === 0 && <Text className="globe-empty">目的地暂不可用</Text>}
          {loading && <Text className="globe-loading">正在准备目的地…</Text>}
        </View>
      </ScrollView>
      <View className="globe-route-panel">
        <Text className="globe-route-heading">已选国家</Text>
        {temporarySelectedDestinations.length > 0 ? <ScrollView scrollX className="globe-route-scroll">
          <View className="globe-route-row">{temporarySelectedDestinations.map((code, index) => <View key={`${code}-${index}`} className="globe-route-stop">
          <Text>{countryName(code)}</Text>
          <Text className="globe-route-remove" onClick={() => removeSelection(index)} aria-label={`移除${countryName(code)}`}>×</Text>
          </View>)}</View></ScrollView> : <Text className="globe-route-empty">选择后会显示在这里</Text>}
      </View>
      {error && <Text className="globe-error">{error}</Text>}
    </View>

    {sheetOpen && <View className="globe-sheet-mask" onClick={() => { if (!submitting) { setSheetOpen(false); setTripFormOpen(false); } }}>
      <View className="globe-choice-sheet" onClick={(event) => event.stopPropagation()}>
        <View className="globe-sheet-handle" />
        {!tripFormOpen ? <>
          <Text className="globe-sheet-kicker">DESTINATIONS READY</Text>
          <Text className="globe-sheet-title">如何使用这些目的地？</Text>
          <Text className="globe-sheet-summary">{temporarySelectedDestinations.length} 个地点 · 按选择顺序保存</Text>
          <Button className="globe-sheet-primary" loading={submitting} disabled={submitting} onClick={openTripForm}>创建新旅行</Button>
          {currentTrip && <Button className="globe-sheet-secondary" loading={submitting} disabled={submitting}
            onClick={() => { void addToCurrentTrip(); }}>添加到当前旅行 · {currentTrip.title}</Button>}
        </> : <>
          <Text className="globe-sheet-kicker">NEW JOURNEY</Text>
          <Text className="globe-sheet-title">确认旅行信息</Text>
          <Text className="globe-sheet-summary">{temporarySelectedDestinations.length} 个目的地将按当前顺序加入</Text>
          <Text className="globe-trip-label">旅行名称</Text>
          <Input className="globe-trip-input" value={tripTitle} maxlength={60} placeholder="例如：日本旅行"
            onInput={(event) => setTripTitle(event.detail.value)} />
          <Text className="globe-trip-label">旅行时间</Text>
          <View className="globe-trip-date-row">
            <View><Text className="globe-trip-caption">出发日期</Text><Picker mode="date" value={startDate}
              onChange={(event) => setStartDate(String(event.detail.value))}><View className="globe-trip-input">{startDate || '选择日期'}</View></Picker></View>
            <View><Text className="globe-trip-caption">返程日期</Text><Picker mode="date" value={endDate}
              onChange={(event) => setEndDate(String(event.detail.value))}><View className="globe-trip-input">{endDate || '选择日期'}</View></Picker></View>
          </View>
          <Text className="globe-trip-label">备注信息</Text>
          <Textarea className="globe-trip-textarea" value={tripNotes} maxlength={5000} placeholder="记录这段旅行的其他安排"
            onInput={(event) => setTripNotes(event.detail.value)} />
          <Button className="globe-sheet-primary" loading={submitting} disabled={submitting} onClick={() => { void createTrip(); }}>确认并创建旅行</Button>
          <Button className="globe-sheet-secondary" disabled={submitting} onClick={() => { setError(''); setTripFormOpen(false); }}>返回修改目的地</Button>
        </>}
        {error && <Text className="globe-sheet-error">{error}</Text>}
        <Button className="globe-sheet-cancel" disabled={submitting} onClick={cancelSelection}>{tripFormOpen ? '取消创建' : '取消'}</Button>
      </View>
    </View>}
  </View>;
}
