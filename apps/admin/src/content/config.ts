import type { AdminRecord, ManagedEntity } from '@travel-guide/api-client';

export interface Choice { value: string; label: string }
export interface Field { name: string; label: string; kind?: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'array' | 'date' | 'url' | 'country' | 'continent' | 'media';
  required?: boolean; options?: Choice[]; hint?: string }
export interface Filter { name: string; label: string; kind?: 'text' | 'select' | 'country' | 'continent'; options?: Choice[] }
export interface Section { title: string; fields: Field[] }
export interface ContentConfig { title: string; singular: string; columns: Array<{ key: string; title: string }>;
  sections: Section[]; filters?: Filter[]; planMapping?: boolean; linked?: 'country' | 'attraction' | 'visa' }

const f = (name: string, label: string, kind: Field['kind'] = 'text', required = false, hint?: string): Field =>
  ({ name, label, kind, required, hint });
const select = (name: string, label: string, values: string[]): Field => ({ name, label, kind: 'select', options: values.map((value) => ({ value, label: value })) });
const code = f('code', '代码', 'text', true);
const names = [f('nameZh', '中文名', 'text', true), f('nameEn', '英文名', 'text', true)];
const dates: Section = { title: '有效期与核验', fields: [f('effectiveFrom', '生效时间', 'date'),
  f('effectiveTo', '失效时间', 'date'), f('lastVerifiedAt', '最后确认时间', 'date')] };
const status: Filter = { name: 'status', label: '内容状态', kind: 'select', options: ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'].map((value) => ({ value, label: value })) };
const country: Filter = { name: 'countryCode', label: '国家', kind: 'country' };
const keyword: Filter = { name: 'keyword', label: '搜索名称 / 代码' };
const sort = f('sortOrder', '排序序号', 'number');

export const contentConfigs: Record<ManagedEntity, ContentConfig> = {
  continents: { title: '大陆管理', singular: '大陆', columns: [{ key: 'code', title: '代码' }, { key: 'nameZh', title: '中文名' },
    { key: 'nameEn', title: '英文名' }, { key: 'enabled', title: '启用' }, { key: 'sortOrder', title: '排序' }],
    sections: [{ title: '基础信息', fields: [code, ...names, f('enabled', '启用', 'switch'), sort] },
      { title: '地球展示参数', fields: [f('centerLatitude', '默认纬度', 'number'), f('centerLongitude', '默认经度', 'number'),
        f('defaultZoom', '默认缩放', 'number'), f('highlightColor', '高亮颜色')] }, dates], filters: [keyword, status] },
  countries: { title: '国家管理', singular: '国家', columns: [{ key: 'flagUrl', title: '国旗' }, { key: 'code', title: '代码' },
    { key: 'nameZh', title: '国家' }, { key: 'continentCode', title: '大陆' }, { key: 'guideCompleteness', title: 'Guide 完整度' },
    { key: 'guideStatus', title: '资料栏目' }, { key: 'cnVisa', title: 'CN 签证' }, { key: 'online', title: '上线' },
    { key: 'completeness', title: '完整度' }, { key: 'updatedAt', title: '更新' }],
    sections: [{ title: '国家身份', fields: [code, f('continentCode', '所属大陆', 'continent', true), ...names,
      f('flagUrl', '国旗 URL', 'url'), f('summary', '简介', 'textarea')] },
    { title: '位置与旅行资料', fields: [f('latitude', '纬度', 'number', true), f('longitude', '经度', 'number', true),
      f('currencyCode', '货币代码'), f('languages', '语言', 'array'), f('timeZone', '时区'), f('phoneCode', '电话区号'),
      f('online', '上线', 'switch'), f('recommendation', '推荐等级', 'number'), sort] }, dates],
    filters: [keyword, { name: 'continentCode', label: '大陆', kind: 'continent' },
      { name: 'online', label: '上线状态', kind: 'select', options: [{ value: 'true', label: '已上线' }, { value: 'false', label: '未上线' }] }, status], linked: 'country' },
  cities: { title: '城市管理', singular: '城市', columns: [{ key: 'code', title: '代码' }, { key: 'nameZh', title: '城市' },
    { key: 'countryCode', title: '国家' }, { key: 'sortOrder', title: '排序' }],
    sections: [{ title: '城市信息', fields: [f('countryCode', '所属国家', 'country', true), code, ...names,
      f('latitude', '纬度', 'number'), f('longitude', '经度', 'number'), sort] }, dates], filters: [country, keyword, status] },
  visa: { title: '签证政策', singular: '政策', columns: [{ key: 'passportRegion', title: '护照地区' },
    { key: 'destinationCountryCode', title: '目的地' }, { key: 'visaType', title: '结论' }, { key: 'maxStayDays', title: '最长停留' },
    { key: 'lastVerifiedAt', title: '最后确认' }, { key: 'freshness', title: '新鲜度' }],
    sections: [{ title: '匹配关系', fields: [f('passportRegion', '护照地区代码', 'text', true),
      f('destinationCountryCode', '目的地国家', 'country', true), select('visaType', '签证结论', ['UNKNOWN', 'VISA_REQUIRED', 'VISA_FREE']),
      f('title', '政策标题', 'text', true)] },
    { title: '政策细节', fields: [f('corePolicy', '核心政策', 'array'), f('maxStayDays', '最长停留天数', 'number'),
      f('feeAmount', '费用金额', 'number'), f('feeCurrency', '费用币种'), f('feeNote', '费用说明'),
      f('processingTime', '办理时间'), f('notes', '注意事项', 'array')] },
    { title: '信息来源', fields: [f('sourceName', '来源名称'), f('sourceUrl', '来源 URL', 'url')] }, dates],
    filters: [keyword, { name: 'passportRegion', label: '护照地区' },
      { name: 'destinationCountryCode', label: '目的地', kind: 'country' },
      { name: 'visaType', label: '签证类型', kind: 'select', options: ['UNKNOWN', 'VISA_REQUIRED', 'VISA_FREE'].map((value) => ({ value, label: value })) },
      status, { name: 'stale', label: '超过 90 天', kind: 'select', options: [{ value: 'true', label: '需要确认' }] }], linked: 'visa' },
  'visa-requirements': { title: '签证材料', singular: '材料', columns: [{ key: 'title', title: '材料' },
    { key: 'visaPolicyId', title: '政策 ID' }, { key: 'required', title: '必需' }, { key: 'sortOrder', title: '排序' }],
    sections: [{ title: '独立材料', fields: [f('visaPolicyId', '所属政策 ID', 'text', true), f('title', '材料名称', 'text', true),
      f('description', '要求说明', 'textarea'), f('required', '必需', 'switch'), sort] }, dates],
    filters: [{ name: 'visaPolicyId', label: '政策 ID' }, keyword, status], planMapping: true },
  transport: { title: '交通攻略', singular: '交通', columns: [{ key: 'name', title: '名称' }, { key: 'countryCode', title: '国家' },
    { key: 'kind', title: '类型' }, { key: 'sortOrder', title: '排序' }],
    sections: [{ title: '交通分类', fields: [f('countryCode', '国家', 'country', true), f('cityCode', '城市代码'),
      f('name', '名称', 'text', true), f('kind', '交通类型', 'text', true), sort] },
    { title: '旅行信息', fields: [f('description', '说明', 'textarea'), f('paymentMethod', '支付方式'),
      f('priceInfo', '费用说明'), f('operatingHours', '运营时间'), f('notes', '注意事项', 'textarea')] }, dates],
    filters: [country, keyword, status], planMapping: true },
  'country-guides': { title: '国家旅行信息', singular: '信息章节', columns: [{ key: 'countryCode', title: '国家' },
    { key: 'category', title: '分类' }, { key: 'title', title: '二级标题' }, { key: 'sourceProvider', title: '来源平台' }],
    sections: [{ title: '结构化章节', fields: [f('countryCode', '国家代码', 'text', true),
      select('category', '内容分类', ['COUNTRY_OVERVIEW', 'ENTRY_RESIDENCE', 'TRAVEL_RISK', 'SAFETY', 'TRANSPORT', 'PRICE_MEDICAL', 'PRACTICAL_INFO']),
      f('title', '二级标题', 'text', true), f('content', '内容', 'textarea', true), f('sortOrder', '排序', 'number'),
      f('sourceProvider', '来源平台', 'text', true), f('sourceUrl', '来源链接', 'url', true), f('sourceUpdatedAt', '来源更新时间', 'date'),
      f('importedAt', '采集时间', 'date'), f('lastVerifiedAt', '最后审核时间', 'date')] }],
    filters: [country, status] },
  packing: { title: '准备事项库', singular: '准备事项', columns: [{ key: 'code', title: '共享代码' },
    { key: 'name', title: '事项' }, { key: 'category', title: '分类' }, { key: 'universal', title: '通用' }],
    sections: [{ title: '全局事项', fields: [code, f('name', '名称', 'text', true), f('category', '分类'),
      f('description', '说明', 'textarea'), f('universal', '通用事项', 'switch')] }, dates],
    filters: [keyword, status], planMapping: true },
  'travel-apps': { title: '推荐旅行 App', singular: '旅行 App', columns: [{ key: 'code', title: '共享代码' },
    { key: 'name', title: '名称' }, { key: 'purpose', title: '用途' }],
    sections: [{ title: '全局应用', fields: [code, f('name', '名称', 'text', true), f('logoUrl', 'Logo URL', 'url'),
      f('purpose', '用途'), f('recommendation', '推荐说明', 'textarea'), f('iosUrl', 'iOS 链接', 'url'),
      f('androidUrl', 'Android 链接', 'url')] }, dates], filters: [keyword, status], planMapping: true },
  tips: { title: '旅行贴士', singular: '贴士', columns: [{ key: 'title', title: '标题' }, { key: 'countryCode', title: '国家' },
    { key: 'category', title: '分类' }, { key: 'importance', title: '重要度' }],
    sections: [{ title: '结构化贴士', fields: [f('countryCode', '国家', 'country', true), f('cityCode', '城市代码'),
      f('title', '标题', 'text', true), f('category', '分类', 'text', true),
      select('importance', '重要度', ['NORMAL', 'TIP', 'IMPORTANT', 'WARNING']),
      f('content', '具体内容', 'textarea', true), sort] }, dates], filters: [country, keyword, status], planMapping: true },
  attractions: { title: '景点管理', singular: '景点', columns: [{ key: 'nameZh', title: '景点' },
    { key: 'countryCode', title: '国家' }, { key: 'cityCode', title: '城市' }, { key: 'category', title: '分类' },
    { key: 'tags', title: '标签' }],
    sections: [{ title: '景点定位', fields: [f('countryCode', '国家', 'country', true), f('cityCode', '城市代码'),
      f('nameZh', '中文名', 'text', true), f('nameEn', '英文名'), f('latitude', '纬度', 'number'),
      f('longitude', '经度', 'number'), sort] },
    { title: '游览内容', fields: [f('description', '简介', 'textarea'), f('coverUrl', '封面', 'media'),
      f('visitMinutes', '建议游览分钟数', 'number'), f('openingHours', '开放时间'),
      f('ticketInfo', '门票说明'), f('website', '官网', 'url'), f('category', '分类'), f('tags', '标签', 'array'),
      f('recommendation', '推荐等级', 'number')] }, dates],
    filters: [country, { name: 'cityCode', label: '城市代码' }, { name: 'category', label: '分类' },
      { name: 'tag', label: '标签' }, keyword, status], planMapping: true, linked: 'attraction' },
};

export function displayName(entity: ManagedEntity, row: AdminRecord): string {
  if (entity === 'visa') return `${row.passportRegion ?? ''} → ${row.destinationCountryCode ?? ''} · ${row.title ?? ''}`;
  return String(row.nameZh ?? row.name ?? row.title ?? row.code ?? row.id ?? '未命名内容');
}

export function validateMapping(values: Record<string, unknown>): string | null {
  if (!values.actionable) return null;
  return values.targetStage && values.itemType && values.scope ? null : '可加入计划时必须填写阶段、类型和范围';
}
