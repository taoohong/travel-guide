import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Image, ScrollView, Text, View } from '@tarojs/components';
import type { CountryGuideSection, CountrySummary, GuideSummary, VisaLookup } from '@travel-guide/api-client';
import { CountryGuideSectionKey, PlanSourceType, VisaRequirementType, VisaType } from '@travel-guide/constants';
import type { PlanItem, PlanItemDraft } from '@travel-guide/types';
import { ErrorState, LoadingState } from '../../components/states';
import { GuideActionButton } from '../../features/destination/GuideActionButton';
import { TripCreateSheet } from '../../features/destination/TripCreateSheet';
import { attractionService } from '../../services/attractionService';
import { countryService } from '../../services/countryService';
import { countryGuideService } from '../../services/countryGuideService';
import { packingService } from '../../services/packingService';
import { planService } from '../../services/planService';
import { preferenceService } from '../../services/preferenceService';
import { transportService } from '../../services/transportService';
import { travelAppService } from '../../services/travelAppService';
import { travelTipService } from '../../services/travelTipService';
import { tripService } from '../../services/tripService';
import { visaService } from '../../services/visaService';
import { passportRequirementLabel, visaRequirementLabel, visaStayLabel } from '../../features/destination/visaPresentation';
import { useTripStore } from '../../stores/tripStore';
import { useUserStore } from '../../stores/userStore';
import './index.scss';

interface DetailData { country: CountrySummary | null; visa: VisaLookup | null; guide: CountryGuideSection[]; transport: GuideSummary[]; packing: GuideSummary[];
  apps: GuideSummary[]; tips: GuideSummary[]; attractions: GuideSummary[] }
type GuideSectionGroup = [CountryGuideSection, ...CountryGuideSection[]];
const emptyData: DetailData = { country: null, visa: null, guide: [], transport: [], packing: [], apps: [], tips: [], attractions: [] };
const flag = (code: string) => code.replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
const value = (entry: GuideSummary, ...keys: string[]) => keys.map((key) => entry[key]).find((item) => typeof item === 'string' && item) as string | undefined;
const guideTabs = [
  { key: 'overview', title: '概况' }, { key: 'entry', title: '入境' }, { key: 'attractions', title: '景点' },
  { key: 'practical', title: '实用' }, { key: 'safety', title: '安全' }, { key: 'transport', title: '交通' },
  { key: 'life', title: '生活' },
] as const;
const contactGuidePattern = /联系方式|联系电话|重要电话|求助(?:电话|热线)|紧急(?:联系人|电话|联系方式|求助|号码)|报警(?:电话|号码)|急救(?:电话|号码)|消防电话|救援电话|领事保护|领保|使领馆|使馆|领馆|embassy|consulate|consular protection|emergency (?:contact|number)|police number|ambulance number|fire department/i;
const safetyGuidePattern = /风险等级|风险区域|高风险(?:区域|地区)|社会治安|自然灾害|食品(?:卫生|安全)|饮食卫生|饮用水安全|健康风险|卫生防疫|疾病预防|传染病|紧急情况|安全提醒|治安|灾害|疫情|food safety|health risks?|natural disasters|security risk|high-risk areas?/i;

function isContactGuide(section: CountryGuideSection) {
  return contactGuidePattern.test(`${section.title} ${section.subtitle ?? ''} ${section.content}`);
}
function isSafetyGuide(section: CountryGuideSection) {
  const heading = `${section.title} ${section.subtitle ?? ''}`;
  return section.sectionKey === CountryGuideSectionKey.TRAVEL_RISK || section.sectionKey === CountryGuideSectionKey.SAFETY ||
    isContactGuide(section) || safetyGuidePattern.test(`${heading} ${section.content}`);
}
function guideItemText(item: GuideSummary) {
  return ['title', 'name', 'nameZh', 'kind', 'category', 'description', 'content', 'notes', 'purpose', 'recommendation', 'paymentMethod']
    .map((key) => item[key]).filter((part): part is string => typeof part === 'string').join(' ');
}
function isSafetyTip(item: GuideSummary) {
  const heading = [value(item, 'category'), value(item, 'title', 'name', 'nameZh')].filter(Boolean).join(' ');
  const text = guideItemText(item);
  return contactGuidePattern.test(text) || safetyGuidePattern.test(`${heading} ${text}`) || /旅行保险|旅游保险|领事保护|安全建议/.test(text);
}

function CountryGuideCard({ sections }: { sections: GuideSectionGroup }) {
  const [expanded, setExpanded] = useState(false);
  const content = sections.map((section) => section.content).join('\n\n');
  const canExpand = content.length > 150;
  return <View className="country-guide-card"><Text className="country-guide-title">{sections[0].title}</Text>
    <Text className={`country-guide-copy${canExpand && !expanded ? ' is-collapsed' : ''}`}>{content}</Text>
    {canExpand && <Button className="expand-button" onClick={() => setExpanded((open) => !open)}>{expanded ? '收起' : '展开'}</Button>}
  </View>;
}

function VisaRequirementFact({ policy, loading, onClick }: {
  policy: NonNullable<VisaLookup['policy']> | null; loading: boolean; onClick(): void;
}) {
  const requirement = policy?.visaRequirement;
  const label = loading ? '加载中' : !policy ? '待确认' :
    requirement === VisaRequirementType.REQUIRED || policy.visaType === VisaType.VISA_REQUIRED ? '需要签证' :
      requirement === VisaRequirementType.VISA_FREE || policy.visaType === VisaType.VISA_FREE ? '符合条件可免签' :
        requirement === VisaRequirementType.VISA_ON_ARRIVAL ? '可办落地签' :
          requirement === VisaRequirementType.E_VISA ? '可申请电子签' :
            requirement === VisaRequirementType.CONDITIONAL ? '需核对条件' : '待确认';
  return <View className="quick-fact visa-quick-fact" role="button" aria-label="查看签证需求详情" onClick={onClick}>
    <Text className="fact-label">签证需求</Text><Text className="fact-value">{label}</Text>
    {policy?.maxStayDays && policy.maxStayDays > 0 ? <Text className="visa-fact-stay">最长停留 {policy.maxStayDays} 天</Text> : null}
  </View>;
}

function GuideSection({ title, empty, items, countryCode, sourceType, onNeedTrip, onRemoved }: { title: string; empty: string;
  items: GuideSummary[]; countryCode: string; sourceType?: PlanSourceType; onNeedTrip(draft: PlanItemDraft): void; onRemoved(item: PlanItem): void }) {
  return <View className="guide-section"><Text className="section-title">{title}</Text>{items.length ? items.map((item) => <View className="guide-row" key={item.id}>
    <View className="guide-main"><Text className="guide-title">{value(item, 'name', 'nameZh', 'title') || '未命名内容'}</Text>
      <Text className="guide-copy">{value(item, 'description', 'purpose', 'content', 'recommendation') || '查看详情与出行提示'}</Text></View>
    <GuideActionButton guide={item} countryCode={countryCode} sourceType={sourceType} onNeedTrip={onNeedTrip} onRemoved={onRemoved} />
  </View>) : <Text className="section-empty">{empty}</Text>}</View>;
}

function AttractionSection({ items, countryCode, onNeedTrip, onRemoved }: { items: GuideSummary[]; countryCode: string;
  onNeedTrip(draft: PlanItemDraft): void; onRemoved(item: PlanItem): void }) {
  return <View className="guide-section"><Text className="section-title">景点推荐</Text>{items.length ? items.map((item) => {
    const images = Array.isArray(item.images) ? item.images as Array<{ url?: string }> : [];
    const image = value(item, 'coverUrl') ?? images[0]?.url; const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
    return <View className="attraction-card" key={item.id}>{image && <Image className="attraction-image" src={image} mode="aspectFill" lazyLoad />}
      <View className="attraction-content"><View className="section-heading"><View><Text className="guide-title">{value(item, 'nameZh', 'name') || '未命名景点'}</Text>
        <Text className="attraction-meta">{value(item, 'cityCode', 'category') || '目的地景点'}{typeof item.visitMinutes === 'number' ? ` · 建议 ${item.visitMinutes} 分钟` : ''}</Text></View>
        <GuideActionButton guide={item} countryCode={countryCode} sourceType={PlanSourceType.ATTRACTION} onNeedTrip={onNeedTrip} onRemoved={onRemoved} /></View>
        <Text className="guide-copy">{item.description || '景点详情正在持续补充'}</Text>{tags.length > 0 && <View className="tag-list">{tags.map((tag) => <Text key={tag}>{tag}</Text>)}</View>}
      </View></View>;
  }) : <Text className="section-empty">该目的地暂未维护景点内容</Text>}</View>;
}

export default function DestinationDetail() {
  const countryCode = String(useRouter().params.countryCode ?? '').toUpperCase(); const passport = useUserStore((state) => state.passportRegion);
  const { showPlanAddGuide, hydrated, guideDialogOpen } = useUserStore(); const trip = useTripStore((state) => state.currentTrip);
  const [data, setData] = useState<DetailData>(emptyData); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [guideLoading, setGuideLoading] = useState(true); const [guideError, setGuideError] = useState('');
  const [visaLoading, setVisaLoading] = useState(true); const [visaError, setVisaError] = useState(false);
  const [activeTab, setActiveTab] = useState<(typeof guideTabs)[number]['key']>('overview');
  const [visaExpanded, setVisaExpanded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<PlanItemDraft | null>(null); const [undo, setUndo] = useState<PlanItem | null>(null);
  const update = <K extends keyof DetailData>(key: K, item: DetailData[K]) => setData((current) => ({ ...current, [key]: item }));
  const load = async () => {
    if (!/^[A-Z]{2}$/.test(countryCode)) { setError('国家代码不合法'); setLoading(false); return; }
    setLoading(true); setError(''); setGuideLoading(true); setGuideError('');
    const tasks = await Promise.allSettled([
      countryService.country(countryCode, (fresh) => update('country', fresh)),
      countryGuideService.get(countryCode, (fresh) => update('guide', fresh)),
      transportService.get(countryCode, (fresh) => update('transport', fresh)), packingService.get(countryCode, (fresh) => update('packing', fresh)),
      travelAppService.get(countryCode, (fresh) => update('apps', fresh)), travelTipService.get(countryCode, (fresh) => update('tips', fresh)),
      attractionService.get(countryCode, (fresh) => update('attractions', fresh)),
    ]);
    const [country, guide, transport, packing, apps, tips, attractions] = tasks;
    if (country.status === 'rejected') setError(country.reason instanceof Error ? country.reason.message : '目的地加载失败');
    else update('country', country.value.data);
    if (guide.status === 'fulfilled') update('guide', guide.value.data);
    else setGuideError(guide.reason instanceof Error ? guide.reason.message : '国家指南加载失败');
    if (transport.status === 'fulfilled') update('transport', transport.value.data);
    if (packing.status === 'fulfilled') update('packing', packing.value.data);
    if (apps.status === 'fulfilled') update('apps', apps.value.data);
    if (tips.status === 'fulfilled') update('tips', tips.value.data);
    if (attractions.status === 'fulfilled') update('attractions', attractions.value.data);
    setGuideLoading(false); setLoading(false);
  };
  const retryGuide = async () => {
    setGuideLoading(true); setGuideError('');
    try { const result = await countryGuideService.get(countryCode, (fresh) => update('guide', fresh)); update('guide', result.data); }
    catch (reason) { setGuideError(reason instanceof Error ? reason.message : '国家指南加载失败'); }
    finally { setGuideLoading(false); }
  };
  const retryVisa = async () => {
    setVisaLoading(true); setVisaError(false); update('visa', null);
    try { const result = await visaService.get(passport, countryCode, (fresh) => update('visa', fresh)); update('visa', result.data); }
    catch { setVisaError(true); }
    finally { setVisaLoading(false); }
  };
  useEffect(() => { if (!useUserStore.getState().hydrated) void preferenceService.hydrate(); void tripService.refresh().then((current) => current && planService.refresh(current.id)); }, []);
  useEffect(() => { setData(emptyData); setActiveTab('overview'); void load(); }, [countryCode]);
  useEffect(() => { void retryVisa(); }, [countryCode, passport]);
  useEffect(() => { if (hydrated && showPlanAddGuide) useUserStore.getState().openGuideDialog(); }, [hydrated]);
  const needTrip = (draft: PlanItemDraft) => { setPendingDraft(draft); setCreateOpen(true); };
  const created = async (createdTrip: NonNullable<typeof trip>) => {
    let added = false;
    if (pendingDraft) try { await planService.add(createdTrip.id, pendingDraft); added = true; }
    catch { await Taro.showToast({ title: '旅行已创建，计划加入失败，请重试', icon: 'none' }); }
    setCreateOpen(false); setPendingDraft(null);
    if (!pendingDraft || added) await Taro.showToast({ title: added ? '旅行已创建并加入计划' : '旅行已创建', icon: 'success' });
  };
  const restore = async () => { if (!trip || !undo) return; const snapshot = undo; setUndo(null);
    try { await planService.undo(trip.id, snapshot); await Taro.showToast({ title: '已恢复', icon: 'success' }); }
    catch { await Taro.showToast({ title: '撤销失败，请重试', icon: 'none' }); } };

  if (loading && !data.country) return <View className="detail-page"><LoadingState /></View>;
  if (error && !data.country) return <View className="detail-page"><ErrorState message={error} onRetry={() => { void load(); }} /></View>;
  const country = data.country!; const policy = data.visa?.policy;
  const requirements: GuideSummary[] = policy?.requirements.map((item) => ({ id: item.id, title: item.title,
    description: item.description, planMapping: item.planMapping })) ?? [];
  const keyMap: Partial<Record<(typeof guideTabs)[number]['key'], CountryGuideSectionKey[]>> = {
    overview: [CountryGuideSectionKey.COUNTRY_OVERVIEW], entry: [CountryGuideSectionKey.ENTRY_RESIDENCE],
    transport: [CountryGuideSectionKey.TRANSPORT],
  };
  const visibleGuide = data.guide.filter((section) => {
    if (isSafetyGuide(section)) return activeTab === 'safety';
    if (section.sectionKey === CountryGuideSectionKey.PRACTICAL_INFO || section.sectionKey === CountryGuideSectionKey.PRICE_MEDICAL)
      return activeTab === 'life';
    return keyMap[activeTab]?.includes(section.sectionKey) ?? false;
  });
  const orderedGuide = activeTab === 'safety' ? [...visibleGuide].sort((left, right) => {
    const contactsLast = Number(isContactGuide(left)) - Number(isContactGuide(right));
    return contactsLast || Number(right.sectionKey === CountryGuideSectionKey.TRAVEL_RISK) - Number(left.sectionKey === CountryGuideSectionKey.TRAVEL_RISK);
  }) : visibleGuide;
  const groupedGuide = orderedGuide.reduce<GuideSectionGroup[]>((groups, section) => {
    const group = groups.find((items) => items[0].title === section.title && isContactGuide(items[0]) === isContactGuide(section));
    if (group) group.push(section); else groups.push([section]);
    return groups;
  }, []);
  const safetyTips = data.tips.filter(isSafetyTip);
  const practicalTips = data.tips.filter((item) => !isSafetyTip(item));
  const safetyContacts = data.transport.filter((item) => contactGuidePattern.test(guideItemText(item)));
  const transportOptions = data.transport.filter((item) => !contactGuidePattern.test(guideItemText(item)));
  const openSource = (url?: string | null) => {
    if (url) void Taro.navigateTo({ url: `/pages/source/index?url=${encodeURIComponent(url)}` });
  };
  const guideSource = data.guide.find((section) => section.sourceUrl) ?? data.guide[0];
  const verifiedAt = data.guide.map((section) => section.lastVerifiedAt || section.sourceUpdatedAt || section.importedAt)
    .filter((date): date is string => !!date).sort().at(-1)?.slice(0, 10);
  return <View className="detail-page">
    <View className="country-hero"><View className="hero-topline"><View><Text className="hero-kicker">COUNTRY GUIDE · {country.code}</Text>
        <Text className="hero-title">{country.name}</Text><Text className="hero-english">{country.nameEn}</Text></View><Text className="hero-flag">{flag(country.code)}</Text></View>
      {country.summary && <Text className="hero-summary">{country.summary}</Text>}
      <View className="quick-facts">{country.capitalCity && <View className="quick-fact"><Text className="fact-label">首都</Text><Text className="fact-value">{country.capitalCity}</Text></View>}
        {country.languages?.length ? <View className="quick-fact"><Text className="fact-label">语言</Text><Text className="fact-value">{country.languages.join('、')}</Text></View> : null}
        {country.currencyCode && <View className="quick-fact"><Text className="fact-label">货币</Text><Text className="fact-value">{country.currencyCode}</Text></View>}
        {country.riskLevel && <View className="quick-fact"><Text className="fact-label">风险等级</Text><Text className="fact-value risk-value">{country.riskLevel}</Text></View>}
        <VisaRequirementFact policy={policy ?? null} loading={visaLoading} onClick={() => setActiveTab('entry')} />
      </View>
    </View>
    <ScrollView className="category-tabs-scroll" scrollX scrollWithAnimation scrollIntoView={`guide-tab-${activeTab}`}>
      <View className="category-tabs">{guideTabs.map((tab) => <Button id={`guide-tab-${tab.key}`} key={tab.key}
        className={`category-tab${activeTab === tab.key ? ' is-active' : ''}`} onClick={() => setActiveTab(tab.key)}>{tab.title}</Button>)}</View>
    </ScrollView>

    {activeTab === 'safety' && country.riskLevel && <View className="guide-section safety-risk-card">
      <View><Text className="eyebrow">TRAVEL RISK</Text><Text className="section-title">风险等级</Text></View>
      <Text className="safety-risk-value">{country.riskLevel}</Text>
    </View>}

    {activeTab === 'entry' && <View className="guide-section visa-card"><View className="visa-card-heading"><View><Text className="eyebrow">VISA POLICY</Text>
          <Text className="section-title">{passport === 'CN' ? '中国大陆护照' : `${passport} 护照`}</Text></View>
        <Button className="text-link" onClick={() => { void Taro.navigateTo({ url: '/pages/settings/index' }); }}>切换</Button></View>
        {visaLoading ? <Text className="section-empty">正在加载签证政策…</Text> : visaError ? <View className="visa-error"><Text>签证信息暂不可用，其他国家指南仍可查看</Text>
          <Button className="retry-link" onClick={() => { void retryVisa(); }}>重试</Button></View> : !data.visa?.available || !policy ? <Text className="section-empty">当前暂未维护该护照地区的签证政策</Text> : <>
          <View className="visa-summary-row"><Text className="visa-result">{visaRequirementLabel(policy)}</Text><Text className="visa-pill">{policy.title}</Text></View>
          {policy.entrySummary && <Text className="visa-intro">{policy.entrySummary}</Text>}
          <View className="visa-facts"><View><Text className="fact-label">最长停留</Text><Text className="fact-value">{visaStayLabel(policy.maxStayDays)}</Text></View>
            <View><Text className="fact-label">护照要求</Text><Text className="fact-value">{passportRequirementLabel(policy)}</Text></View></View>
          <View className="visa-source"><Text>最后核验：{policy.lastVerifiedAt?.slice(0, 10) || policy.retrievedAt?.slice(0, 10) || '未提供'}</Text>
            <Text>来源：{policy.sourceProvider || policy.sourceName || '中国领事服务网 / 官方来源'}</Text></View>
          <Button className="visa-detail-button" onClick={() => setVisaExpanded((open) => !open)}>{visaExpanded ? '收起详细入境规定' : '查看详细入境规定'}</Button>
          {visaExpanded && <View className="visa-details">{policy.requirementText && <Text className="visa-detail-copy">{policy.requirementText}</Text>}
            {policy.corePolicy.map((text, index) => <Text className="visa-detail-copy" key={`${index}-${text}`}>{text}</Text>)}
            {requirements.map((item) => <View className="guide-row" key={item.id}><View className="guide-main"><Text className="guide-title">{item.title}</Text>
              <Text className="guide-copy">{item.description || '按官方规定准备'}</Text></View>
              <GuideActionButton guide={item} countryCode={countryCode} onNeedTrip={needTrip} onRemoved={setUndo} /></View>)}
            {policy.sourceUrl && <Button className="text-link" onClick={() => openSource(policy.sourceUrl)}>查看签证官方来源</Button>}</View>}
        </>}
      </View>}
    {activeTab !== 'attractions' && activeTab !== 'practical' && <>
      {guideLoading && data.guide.length === 0 ? <View className="guide-section"><LoadingState label="正在加载国家指南…" /></View> :
        guideError && data.guide.length === 0 ? <View className="guide-section"><ErrorState message="国家指南暂时无法加载" onRetry={() => { void retryGuide(); }} /></View> :
        groupedGuide.length ? groupedGuide.map((sections) => <CountryGuideCard key={sections[0].id} sections={sections} />) :
          activeTab !== 'entry' && <View className="guide-section"><Text className="section-empty">该目的地暂未维护此类国家信息</Text></View>}
      {activeTab === 'transport' && <GuideSection title="交通补充信息" empty="暂无交通补充信息" items={transportOptions} countryCode={countryCode} onNeedTrip={needTrip} onRemoved={setUndo} />}
    </>}
    {activeTab === 'practical' && <>
      <GuideSection title="行前准备" empty="暂无准备事项" items={data.packing} countryCode={countryCode} onNeedTrip={needTrip} onRemoved={setUndo} />
      <View className="guide-section"><Text className="section-title">旅行工具</Text>{data.apps.length ? data.apps.map((item) => <View className="guide-row" key={item.id}>
        {typeof item.logoUrl === 'string' && item.logoUrl && <Image className="app-logo" src={item.logoUrl} mode="aspectFill" lazyLoad />}
        <View className="guide-main"><Text className="guide-title">{value(item, 'name') || '旅行工具'}</Text><Text className="guide-copy">{value(item, 'purpose', 'recommendation') || '目的地实用工具'}</Text></View>
        <GuideActionButton guide={item} countryCode={countryCode} onNeedTrip={needTrip} onRemoved={setUndo} />
      </View>) : <Text className="section-empty">暂无旅行工具</Text>}</View>
      <GuideSection title="旅行贴士" empty="暂无旅行贴士" items={practicalTips} countryCode={countryCode} onNeedTrip={needTrip} onRemoved={setUndo} />
    </>}
    {activeTab === 'safety' && safetyTips.length > 0 && <GuideSection title="安全与应急贴士" empty="暂无安全贴士" items={safetyTips} countryCode={countryCode} onNeedTrip={needTrip} onRemoved={setUndo} />}
    {activeTab === 'safety' && safetyContacts.length > 0 && <GuideSection title="紧急联系方式" empty="暂无紧急联系方式" items={safetyContacts} countryCode={countryCode} onNeedTrip={needTrip} onRemoved={setUndo} />}
    {activeTab === 'attractions' && <AttractionSection items={data.attractions} countryCode={countryCode} onNeedTrip={needTrip} onRemoved={setUndo} />}
    {!!data.guide.length && <View className="guide-source-footer"><Text className="guide-source-title">信息来源：{guideSource?.sourceProvider || '中国领事服务网'}</Text>
      <Text className="guide-source-date">最后核验：{verifiedAt || '未提供'}</Text>
    </View>}
    {undo && <View className="undo-bar"><Text>已从计划移除</Text><Button onClick={() => { void restore(); }}>撤销</Button></View>}
    {guideDialogOpen && <View className="guide-dialog-mask"><View className="guide-dialog"><Text className="dialog-icon">＋ → ✓</Text>
      <Text className="dialog-title">把攻略变成你的计划</Text><Text className="dialog-copy">签证材料、准备事项、景点等可执行内容旁有「＋」，点击即可加入当前旅行计划；加入后会变为「✓」。</Text>
      <Button className="dialog-primary" onClick={() => useUserStore.getState().dismissGuideDialog()}>确认</Button>
      <Button className="dialog-secondary" onClick={() => { void preferenceService.update({ showPlanAddGuide: false }); useUserStore.getState().dismissGuideDialog(); }}>以后不再提示</Button>
    </View></View>}
    {createOpen && <TripCreateSheet countryCode={countryCode} countryName={country.name} onCancel={() => { setCreateOpen(false); setPendingDraft(null); }} onCreated={created} />}
  </View>;
}
