import { useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Collapse, Descriptions, Divider, Input, Space, Tag, Typography, message } from 'antd';
import type { AdminRecord, CountryGuideImportResult } from '@travel-guide/api-client';
import { useAuth, can } from '../app/auth';
import { api, errorText } from '../services/api';

interface CollectorItem {
  section: string; countryCode: string; title: string; content: string; sourceProvider: string;
  sourceUrl: string; externalId: string; retrievedAt: string;
}
interface GuideCandidate { countryCode: string; sourceKey: string; category: string; title: string; content: string;
  sourceProvider: string; sourceUrl: string; importedAt: string; sortOrder: number }
interface VisaCandidate { countryCode: string; title: string; content: string; sourceProvider: string; sourceUrl: string; retrievedAt: string;
  current?: AdminRecord }

const categoryBySource: Record<string, string> = { country: 'COUNTRY_OVERVIEW', visa: 'ENTRY_RESIDENCE', risk: 'TRAVEL_RISK',
  safety: 'SAFETY', transport: 'TRANSPORT', prices: 'PRICE_MEDICAL', practical: 'PRACTICAL_INFO' };
const categoryLabels: Record<string, string> = { COUNTRY_OVERVIEW: '国家概况', ENTRY_RESIDENCE: '入境居留',
  TRAVEL_RISK: '风险与安全', SAFETY: '安全防范', TRANSPORT: '交通出行', PRICE_MEDICAL: '物价医疗', PRACTICAL_INFO: '实用信息' };
const visaLabels: Record<string, string> = { visaRequirement: '签证要求', maxStayDays: '最长停留时间', passportRequired: '是否需要护照',
  passportValidityMonths: '护照有效期（月）', passportValidityRequirement: '护照有效期补充说明', entrySummary: '入境摘要', requirementText: '详细说明' };
const visaRequirementLabels: Record<string, string> = { REQUIRED: '需要签证', VISA_FREE: '免签', VISA_ON_ARRIVAL: '落地签',
  E_VISA: '电子签证', CONDITIONAL: '有条件适用', UNKNOWN: '未明确' };
const valueText = (value: unknown) => value === null || value === undefined || value === '' ? '暂无可靠数据' :
  typeof value === 'boolean' ? value ? '需要' : '不需要' : String(value);
const visaAfter = (item: VisaCandidate) => ({ passportRegion: 'CN', destinationCountryCode: item.countryCode,
  visaType: 'UNKNOWN', visaRequirement: 'UNKNOWN', title: item.title, maxStayDays: null, passportRequired: null,
  passportValidityMonths: null, passportValidityRequirement: null, entrySummary: null, requirementText: item.content,
  sourceProvider: item.sourceProvider, sourceName: item.sourceProvider, sourceUrl: item.sourceUrl, retrievedAt: item.retrievedAt,
  lastVerifiedAt: null });
const visaChangedFields = (item: VisaCandidate): string[] => {
  const next = visaAfter(item) as Record<string, unknown>;
  return ['title', 'visaRequirement', 'maxStayDays', 'passportRequired', 'passportValidityMonths', 'passportValidityRequirement',
    'entrySummary', 'requirementText', 'sourceUrl', 'sourceProvider', 'retrievedAt'].filter((field) =>
    JSON.stringify(item.current?.[field] ?? null) !== JSON.stringify(next[field] ?? null));
};

function readItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const source = value as Record<string, unknown>;
  for (const key of ['items', 'normalized', 'records']) if (Array.isArray(source[key])) return source[key] as unknown[];
  return [];
}

function normalizeCollectorItem(value: unknown, fileName: string): CollectorItem | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const externalId = typeof row.externalId === 'string' ? row.externalId : '';
  const sourceName = typeof row.sourceProvider === 'string' ? row.sourceProvider : typeof row.sourceName === 'string' ? row.sourceName : '';
  const sourceUrl = typeof row.sourceUrl === 'string' ? row.sourceUrl : '';
  const retrievedAt = typeof row.retrievedAt === 'string' ? row.retrievedAt : '';
  const countryCode = typeof row.countryCode === 'string' ? row.countryCode : typeof row.destinationCountryCode === 'string' ? row.destinationCountryCode : '';
  let section = typeof row.section === 'string' ? row.section : '';
  if (!section) {
    const sourceSection = externalId.match(/section-(\d+)$/)?.[1];
    const bySectionNumber: Record<string, string> = { '1': 'country', '2': 'visa', '3': 'safety', '4': 'transport',
      '5': 'prices', '6': 'practical', '7': 'risk' };
    section = fileName.includes('visa') || Array.isArray(row.corePolicy) ? 'visa' :
      fileName.includes('transport') || typeof row.description === 'string' ? 'transport' :
      fileName.includes('country') || typeof row.summary === 'string' ? 'country' :
      bySectionNumber[sourceSection ?? ''] ?? '';
  }
  const content = typeof row.content === 'string' ? row.content : Array.isArray(row.corePolicy) ? row.corePolicy.join('\n\n') :
    typeof row.description === 'string' ? row.description : typeof row.summary === 'string' ? row.summary : '';
  const title = typeof row.title === 'string' ? row.title : typeof row.name === 'string' ? row.name : '';
  if (!categoryBySource[section] && section !== 'visa') return null;
  if (!countryCode || !title || !content || !sourceName || !sourceUrl || !externalId || !retrievedAt) return null;
  return { section, countryCode, title, content, sourceProvider: sourceName, sourceUrl, externalId, retrievedAt };
}

function splitIntoSections(title: string, content: string): Array<{ title: string; content: string }> {
  const blocks = content.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  if (blocks.length < 2) return [{ title, content: content.trim() }];
  const sections: Array<{ title: string; content: string }> = [];
  let currentTitle = title;
  let paragraphs: string[] = [];
  let headings = 0;
  const headingPattern = /^(?:[一二三四五六七八九十]+[、.．]|[（(][一二三四五六七八九十0-9]+[）)]|空中交通|陆路交通|水路交通|市内交通|签证|入出境|居留|安全提醒|风险提示|物产物价|保险医疗|联系方式|气候|通信电源|风俗禁忌)/;
  const flush = () => {
    if (paragraphs.length) sections.push({ title: currentTitle, content: paragraphs.join('\n\n') });
    paragraphs = [];
  };
  for (const block of blocks) {
    const isHeading = block.length <= 72 && !/[。！？!?；;]$/.test(block) && headingPattern.test(block);
    if (isHeading) { flush(); currentTitle = block; headings += 1; }
    else paragraphs.push(block);
  }
  flush();
  return headings ? sections : [{ title, content: content.trim() }];
}

function guideCandidates(items: CollectorItem[]): GuideCandidate[] {
  return items.filter((item) => categoryBySource[item.section]).flatMap((item) => {
    const chunks = splitIntoSections(item.title, item.content);
    return chunks.map((chunk, index) => ({ countryCode: item.countryCode, sourceKey: `${item.externalId}:${index}`.slice(0, 120),
      category: categoryBySource[item.section]!, title: chunk.title, content: chunk.content, sourceProvider: item.sourceProvider,
      sourceUrl: item.sourceUrl, importedAt: item.retrievedAt, sortOrder: index * 10 }));
  });
}

function packagesFor(items: GuideCandidate[]): Array<Record<string, unknown>> {
  const grouped = new Map<string, GuideCandidate[]>();
  items.forEach((item) => grouped.set(item.countryCode, [...(grouped.get(item.countryCode) ?? []), item]));
  return [...grouped.entries()].map(([countryCode, sections]) => ({ countryCode,
    provider: sections[0]!.sourceProvider, sourceUrl: sections[0]!.sourceUrl,
    sections: sections.map(({ sourceKey, ...section }) => ({ key: sourceKey, ...section })) }));
}

function DiffBlock({ label, before, after, changed }: { label: string; before: unknown; after: unknown; changed: boolean }) {
  return <div className={`import-diff-field${changed ? ' is-changed' : ''}`}>
    <Typography.Text strong>{label}{changed && <Tag color="orange">有变化</Tag>}</Typography.Text>
    <div className="import-diff-columns">
      <div><small>当前线上内容</small><p>{valueText(before)}</p></div>
      <div><small>新导入内容</small><p>{valueText(after)}</p></div>
    </div>
  </div>;
}

export function CountryImportPage() {
  const { admin } = useAuth();
  const [fileName, setFileName] = useState('');
  const [items, setItems] = useState<CollectorItem[]>([]);
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const [guides, setGuides] = useState<CountryGuideImportResult>();
  const [visas, setVisas] = useState<VisaCandidate[]>([]);
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedMessage, setAppliedMessage] = useState<string>();
  const canImport = can(admin?.role, 'edit');
  const guideData = useMemo(() => guideCandidates(items), [items]);
  const packages = useMemo(() => packagesFor(guideData), [guideData]);

  const parseFiles = async (fileList?: FileList | null) => {
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    setFileName(files.map((file) => file.name).join('、')); setGuides(undefined); setVisas([]); setIgnored(new Set()); setAppliedMessage(undefined);
    const allItems: CollectorItem[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const payload: unknown = JSON.parse(await file.text());
        const raw = readItems(payload);
        if (!raw.length) { errors.push(`${file.name}：应为 info-collector 导出的资料数组或 normalized.json。`); continue; }
        raw.forEach((value, index) => {
          const item = normalizeCollectorItem(value, file.name.toLowerCase());
          if (item) allItems.push(item);
          else errors.push(`${file.name} 第 ${index + 1} 项缺少可识别的国家、分类、内容或来源信息。`);
        });
      } catch { errors.push(`${file.name}：JSON 格式无法读取，请确认文件内容完整。`); }
    }
    setItems(allItems); setLocalErrors(errors);
    if (!allItems.length && !errors.length) setLocalErrors(['文件中没有可导入的国家资料。']);
  };

  const createPreview = async () => {
    setPreviewing(true); setAppliedMessage(undefined);
    try {
      const result = await api.countryGuideImport({ apply: false, packages });
      setGuides(result);
      const visaItems = items.filter((item) => item.section === 'visa');
      const uniqueByCountry = new Map<string, CollectorItem>();
      visaItems.forEach((item) => uniqueByCountry.set(item.countryCode, item));
      const nextVisas = await Promise.all([...uniqueByCountry.values()].map(async (item) => {
        const page = await api.content.list('visa', { passportRegion: 'CN', destinationCountryCode: item.countryCode, page: 1, pageSize: 20 });
        return { countryCode: item.countryCode, title: item.title, content: item.content, sourceProvider: item.sourceProvider,
          sourceUrl: item.sourceUrl, retrievedAt: item.retrievedAt, current: page.items.find((row) => row.status === 'PUBLISHED') ?? page.items[0] };
      }));
      setVisas(nextVisas);
      const names = await Promise.all([...new Set(items.map((item) => item.countryCode))].map(async (code) => {
        try { const country = await api.country.get(code); return [code, String(country.nameZh ?? country.nameEn ?? code)] as const; }
        catch { return [code, code] as const; }
      }));
      setCountryNames(Object.fromEntries(names));
      message.success('导入预览已生成；内容尚未保存');
    } catch (cause) { message.error(errorText(cause)); }
    finally { setPreviewing(false); }
  };

  const toggleIgnore = (key: string, ignore: boolean) => setIgnored((current) => {
    const next = new Set(current);
    if (ignore) next.add(key); else next.delete(key);
    return next;
  });
  const applyDrafts = async () => {
    setApplying(true); setAppliedMessage(undefined);
    let guideApplied = false;
    let visaApplied = false;
    try {
      const guideChanges = guides?.items.some((item) => item.kind !== 'UNCHANGED' && !ignored.has(`${item.countryCode}:${item.key}`));
      if (guideChanges) {
        const result = await api.countryGuideImport({ apply: true, packages,
          ignoredKeys: [...ignored].filter((key) => !key.startsWith('visa:')) });
        if (result.errors.length) throw new Error(result.errors.map((item) => item.message).join('；'));
        guideApplied = result.applied;
      }
      for (const item of visas) {
        if (ignored.has(`visa:${item.countryCode}`)) continue;
        const current = item.current;
        const body = visaAfter(item);
        if (!visaChangedFields(item).length) continue;
        if (current?.id) await api.content.update('visa', String(current.id), body);
        else await api.content.create('visa', body);
        visaApplied = true;
      }
      setAppliedMessage(guideApplied || visaApplied ? '所选内容已导入为草稿。已发布内容保持在线，需 Reviewer 或 SUPER_ADMIN 审核发布。' : '没有选择需要导入的修改。');
      if (guideApplied || visaApplied) message.success('已导入为草稿');
    } catch (cause) {
      const detail = guideApplied || visaApplied ? '部分内容已成功保存为草稿；请根据错误信息检查剩余项目。' : errorText(cause);
      setAppliedMessage(`${detail} ${errorText(cause)}`);
    } finally { setApplying(false); }
  };

  const guideItems = guides?.items ?? [];
  const counts = {
    added: guideItems.filter((item) => item.kind === 'ADDED').length + visas.filter((item) => !item.current).length,
    changed: guideItems.filter((item) => item.kind === 'CHANGED').length + visas.filter((item) => !!item.current && visaChangedFields(item).length > 0).length,
    unchanged: guideItems.filter((item) => item.kind === 'UNCHANGED').length + visas.filter((item) => !!item.current && visaChangedFields(item).length === 0).length,
    errors: localErrors.length + (guides?.errors.length ?? 0),
  };
  const guideGroups = Object.keys(categoryLabels);
  const hasSelectableChanges = guideItems.some((item) => item.kind !== 'UNCHANGED' && !ignored.has(`${item.countryCode}:${item.key}`)) ||
    visas.some((item) => visaChangedFields(item).length > 0 && !ignored.has(`visa:${item.countryCode}`));

  return <div className="page-stack country-import-page">
    <div className="page-heading"><div><Typography.Text className="eyebrow">CONTENT IMPORT / COUNTRY MATERIAL</Typography.Text>
      <Typography.Title level={2}>国家资料导入</Typography.Title>
      <Typography.Text type="secondary">上传 info-collector 的 JSON，在预览并逐项审核后导入为草稿。</Typography.Text></div></div>
    <Card className="surface import-source-card">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text strong>选择本地 JSON 文件</Typography.Text>
        <Space wrap><Input type="file" multiple disabled={!canImport} accept=".json,application/json" onChange={(event) => void parseFiles(event.target.files)}
          aria-label="选择国家资料 JSON" />{fileName && <Tag>{fileName}</Tag>}
          {items.length > 0 && <Button type="primary" disabled={!canImport} loading={previewing} onClick={createPreview}>生成 Import Preview</Button>}
          {guides && <Button onClick={() => { setFileName(''); setItems([]); setGuides(undefined); setVisas([]); setLocalErrors([]); setIgnored(new Set()); }}>取消并清空</Button>}</Space>
      <Typography.Text type="secondary">文件在当前浏览器本地解析，不会自动访问来源网页，也不会直接保存或发布。</Typography.Text>
      </Space>
    </Card>
    {!canImport && <Alert type="info" showIcon message="国家资料导入仅对 SUPER_ADMIN 与 CONTENT_ADMIN 开放。" />}
    {localErrors.length > 0 && <Alert type="warning" showIcon message={`本地读取发现 ${localErrors.length} 个问题`}
      description={<ul>{localErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>} />}
    {guides?.errors.length ? <Alert type="error" showIcon message={`导入校验失败：${guides.errors.length} 项`}
      description={<ul>{guides.errors.map((error, index) => <li key={`${error.path}-${index}`}>{error.path}：{error.message}</li>)}</ul>} /> : null}
    {appliedMessage && <Alert type={appliedMessage.startsWith('所选') || appliedMessage.startsWith('没有') ? 'success' : 'warning'} showIcon message={appliedMessage} />}
    {guides && <>
      <Card className="surface import-summary" title="Import Preview">
        <Typography.Title level={4}>{[...new Set(items.map((item) => item.countryCode))].map((code) => `${countryNames[code] ?? code}（${code}）`).join('、') || '未识别国家'}</Typography.Title>
        <Space wrap><Tag color="green">新增：{counts.added}</Tag><Tag color="orange">修改：{counts.changed}</Tag>
          <Tag>无变化：{counts.unchanged}</Tag><Tag color={counts.errors ? 'red' : 'default'}>错误：{counts.errors}</Tag></Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>导入只保存草稿。Reviewer 或 SUPER_ADMIN 后续审核发布。</Typography.Paragraph>
      </Card>
      {guideGroups.map((category) => {
        const rows = guideItems.filter((item) => item.after.category === category);
        return <Card key={category} className="surface import-category-card" title={categoryLabels[category] ?? category}
          extra={<Space><Tag color="green">新增 {rows.filter((item) => item.kind === 'ADDED').length}</Tag>
            <Tag color="orange">修改 {rows.filter((item) => item.kind === 'CHANGED').length}</Tag>
            <Tag>无变化 {rows.filter((item) => item.kind === 'UNCHANGED').length}</Tag></Space>}>
          {rows.length ? <Collapse items={rows.map((item) => {
            const key = `${item.countryCode}:${item.key}`;
            const before = item.before as AdminRecord | null;
            const after = item.after as AdminRecord;
            const changed = new Set(item.changedFields);
            return { key, label: <Space><Tag color={item.kind === 'ADDED' ? 'green' : item.kind === 'CHANGED' ? 'orange' : 'default'}>{item.kind}</Tag>
              <Typography.Text strong>{String(after.title ?? '未命名小节')}</Typography.Text></Space>,
              extra: item.kind !== 'UNCHANGED' ? <Checkbox checked={!ignored.has(key)} onClick={(event) => event.stopPropagation()}
                onChange={(event) => toggleIgnore(key, !event.target.checked)}>导入此项</Checkbox> : null,
              children: <><Descriptions size="small" column={2} items={[
                { key: 'provider', label: '来源平台', children: String(after.sourceProvider ?? '—') },
                { key: 'url', label: '来源链接', children: after.sourceUrl ? <Button type="link" href={String(after.sourceUrl)} target="_blank" rel="noreferrer">查看原始来源</Button> : '—' },
                { key: 'captured', label: '采集时间', children: valueText(after.importedAt) },
                { key: 'reviewed', label: '最后审核', children: valueText(before?.lastVerifiedAt) },
              ]} />
              <DiffBlock label="二级标题" before={before?.title} after={after.title} changed={changed.has('title')} />
              <DiffBlock label="内容" before={before?.content} after={after.content} changed={changed.has('content')} />
              </>,
            };
          })} /> : <Typography.Text type="secondary">暂无此分类内容</Typography.Text>}
        </Card>;
      })}
      {visas.length > 0 && <Card className="surface import-category-card" title="签证" extra={<Space>
        <Tag color="green">新增 {visas.filter((item) => !item.current).length}</Tag>
        <Tag color="orange">修改 {visas.filter((item) => !!item.current && visaChangedFields(item).length > 0).length}</Tag>
        <Tag>无变化 {visas.filter((item) => !!item.current && visaChangedFields(item).length === 0).length}</Tag>
      </Space>}>
        {visas.map((item) => {
          const key = `visa:${item.countryCode}`;
          const current = item.current;
          const visaDiff = {
            visaRequirement: current?.visaRequirement ?? 'UNKNOWN', maxStayDays: current?.maxStayDays,
            passportRequired: current?.passportRequired, passportValidityMonths: current?.passportValidityMonths,
            passportValidityRequirement: current?.passportValidityRequirement, entrySummary: current?.entrySummary,
            requirementText: current?.requirementText,
          };
          const newVisa = { visaRequirement: 'UNKNOWN', maxStayDays: null, passportRequired: null, passportValidityMonths: null,
            passportValidityRequirement: null, entrySummary: null, requirementText: item.content };
          return <div className="visa-import-diff" key={key}>
            <div className="section-title"><span>{countryNames[item.countryCode] ?? item.countryCode} · {item.title}</span>
              <Tag color={!current ? 'green' : visaChangedFields(item).length ? 'orange' : 'default'}>
                {!current ? '新增' : visaChangedFields(item).length ? '修改' : '无变化'}</Tag></div>
            <Space wrap style={{ marginBottom: 8 }}><Typography.Text>来源平台：{item.sourceProvider}</Typography.Text>
              <Button type="link" href={item.sourceUrl} target="_blank" rel="noreferrer">查看原始来源</Button>
              <Typography.Text type="secondary">采集时间：{new Date(item.retrievedAt).toLocaleString('zh-CN')}</Typography.Text>
              <Typography.Text type="secondary">最后审核：{valueText(current?.lastVerifiedAt)}</Typography.Text></Space>
            {Object.keys(visaLabels).map((field) => <DiffBlock key={field} label={visaLabels[field]!}
              before={field === 'visaRequirement' && current ? visaRequirementLabels[String(visaDiff[field] ?? 'UNKNOWN')] : visaDiff[field as keyof typeof visaDiff]}
              after={field === 'visaRequirement' ? visaRequirementLabels.UNKNOWN : newVisa[field as keyof typeof newVisa]}
              changed={(visaDiff[field as keyof typeof visaDiff] ?? null) !== (newVisa[field as keyof typeof newVisa] ?? null)} />)}
            <Checkbox disabled={visaChangedFields(item).length === 0} checked={!ignored.has(key)}
              onChange={(event) => toggleIgnore(key, !event.target.checked)}>导入此签证草稿</Checkbox>
            {current?.status === 'PUBLISHED' && <Tag color="blue">线上版本保持不变，修改将保存为草稿</Tag>}
            <Divider />
          </div>;
        })}
      </Card>}
      {(guideItems.length > 0 || visas.length > 0) && <div className="import-actions">
        <Button onClick={() => { setGuides(undefined); setVisas([]); setAppliedMessage(undefined); }}>取消预览</Button>
        <Button type="primary" loading={applying} disabled={!hasSelectableChanges || Boolean(guides.errors.length) ||
          appliedMessage?.startsWith('所选内容已导入') === true} onClick={applyDrafts}>导入所选为草稿</Button>
      </div>}
    </>}
  </div>;
}
