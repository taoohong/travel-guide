import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Drawer, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import type { AdminRecord, ManagedEntity, Query } from '@travel-guide/api-client';
import { ApiError } from '@travel-guide/api-client';
import { useAuth, can } from '../app/auth';
import { navigate } from '../app/navigation';
import { FieldEditor, fromLocalDate, toLocalDate } from '../components/FieldEditor';
import { LinkedItems } from '../components/LinkedItems';
import { CountryMediaManager } from '../components/LinkedItems';
import { CountryGuideEditor } from '../components/CountryGuideEditor';
import { CountryVisaEditor } from '../components/CountryVisaEditor';
import { CountryAttractions } from '../components/CountryAttractions';
import { PlanMappingEditor, validateMapping } from '../components/PlanMappingEditor';
import { contentConfigs, displayName, type Filter } from '../content/config';
import { api, errorText } from '../services/api';

const statusLabels: Record<string, string> = { DRAFT: '草稿', REVIEW: '待审核', PUBLISHED: '已发布', ARCHIVED: '已归档' };
const versionModule: Record<ManagedEntity, string> = { continents: 'country', countries: 'country', cities: 'city',
  'country-guides': 'countryGuide',
  visa: 'visa', 'visa-requirements': 'visa', transport: 'transport', packing: 'packing',
  'travel-apps': 'country', tips: 'travelTip', attractions: 'attraction' };
const dateKeys = new Set(['effectiveFrom', 'effectiveTo', 'lastVerifiedAt']);
export function formValues(row: AdminRecord): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, dateKeys.has(key) ? toLocalDate(value) : value]));
}
export function requestValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
    dateKeys.has(key) ? fromLocalDate(value) : value === '' ? null : value]));
}

function FilterControl({ filter, value, onChange }: { filter: Filter; value?: string; onChange: (value?: string) => void }) {
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  useEffect(() => {
    if (filter.kind === 'country') api.country.list({ pageSize: 100 }).then((page) =>
      setOptions(page.items.map((row) => ({ value: String(row.code), label: `${row.nameZh} · ${row.code}` }))));
    if (filter.kind === 'continent') api.continent.list({ pageSize: 100 }).then((page) =>
      setOptions(page.items.map((row) => ({ value: String(row.code), label: `${row.nameZh} · ${row.code}` }))));
  }, [filter.name]);
  if (filter.kind === 'select' || filter.kind === 'country' || filter.kind === 'continent') return <Select
    allowClear placeholder={filter.label} value={value} onChange={onChange} options={filter.options ?? options}
    style={{ width: filter.kind === 'country' ? 160 : 135 }} />;
  return <Input placeholder={filter.label} value={value} onChange={(event) => onChange(event.target.value || undefined)} style={{ width: 160 }} />;
}

function textCell(value: unknown, key: string): React.ReactNode {
  if (key === 'flagUrl') return typeof value === 'string' && value ? <img src={value} alt="国旗" className="flag" /> : '—';
  if (key === 'online' || key === 'enabled' || key === 'required' || key === 'universal') return value ? '是' : '否';
  if (key === 'cnVisa') return value ? <Tag color="green">已覆盖</Tag> : <Tag>缺失</Tag>;
  if (key === 'tags') return Array.isArray(value) ? value.join('、') : '—';
  if (key === 'completeness') return `${Number(value ?? 0)}%`;
  if (key === 'guideCompleteness' || key === 'contentCompleteness') return `${Number(value ?? 0)}%`;
  if (key === 'guideStatus' && value && typeof value === 'object') {
    const labels: Record<string, string> = { COUNTRY_OVERVIEW: '概况', ENTRY_RESIDENCE: '入境', TRAVEL_RISK: '风险',
      SAFETY: '安全', TRANSPORT: '交通', PRICE_MEDICAL: '物价医疗', PRACTICAL_INFO: '实用' };
    const statuses = value as Record<string, boolean>;
    return <Space wrap size={[4, 4]}>{Object.entries(statuses).map(([category, complete]) =>
      <Tag key={category} color={complete ? 'green' : 'default'}>{labels[category] ?? category} {complete ? '✓' : '—'}</Tag>)}</Space>;
  }
  if (key === 'freshness') return value && typeof value === 'object' && 'expired' in value ?
    (value.expired ? <Tag color="orange">待确认</Tag> : <Tag color="green">有效</Tag>) : '—';
  if (key === 'updatedAt' || key === 'lastVerifiedAt') return value ? new Date(String(value)).toLocaleDateString('zh-CN') : '—';
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function ContentManager({ entity }: { entity: ManagedEntity }) {
  const config = contentConfigs[entity];
  const { admin } = useAuth();
  const [form] = Form.useForm();
  const initialQuery = new URLSearchParams(location.search);
  const [filters, setFilters] = useState<Query>(() => Object.fromEntries(initialQuery.entries()));
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<AdminRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const canEdit = can(admin?.role, 'edit');
  const canPublish = can(admin?.role, 'publish');
  const reload = () => {
    setLoading(true); setError(undefined);
    api.content.list(entity, { ...filters, page, pageSize: 20 }).then((result) => { setItems(result.items); setTotal(result.total); })
      .catch((cause) => setError(errorText(cause))).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [entity, page, JSON.stringify(filters)]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const updateFilter = (name: string, value?: string) => {
    setPage(1); setFilters((current) => ({ ...current, [name]: value }));
  };
  const openEditor = async (row?: AdminRecord) => {
    setDirty(false);
    if (!row) {
      const defaults: Record<string, unknown> = entity === 'visa-requirements' && filters.visaPolicyId ? { visaPolicyId: filters.visaPolicyId } : {};
      form.resetFields(); form.setFieldsValue(defaults); setSelected(null); setOpen(true); return;
    }
    const key = String(row.id ?? row.code);
    try {
      const detail = await api.content.get(entity, key);
      setSelected(detail);
      form.resetFields(); form.setFieldsValue(formValues(detail)); setOpen(true);
    } catch (cause) { message.error(errorText(cause)); }
  };
  const closeEditor = () => {
    if (dirty) Modal.confirm({ title: '有尚未保存的更改', content: '离开后这些更改将丢失。', okText: '离开', cancelText: '继续编辑',
      onOk: () => { setOpen(false); setDirty(false); } });
    else setOpen(false);
  };
  const save = async (values: Record<string, unknown>) => {
    if (saving) return;
    const mappingError = config.planMapping ? validateMapping(values) : null;
    if (mappingError) { message.error(mappingError); return; }
    setSaving(true);
    try {
      const body = requestValues(values);
      const key = selected ? String(selected.id ?? selected.code) : null;
      const result = key ? await api.content.update(entity, key, body) : await api.content.create(entity, body);
      setSelected(result); setDirty(false); form.setFieldsValue(formValues(result)); reload();
      message.success(result.draftPending ? '草稿已保存，发布后客户端才会更新' : '保存成功');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'VALIDATION_FAILED' && Array.isArray(cause.details.issues)) {
        form.setFields((cause.details.issues as Array<{ path: string; message: string }>).map((issue) =>
          ({ name: issue.path, errors: [issue.message] })));
      }
      message.error(errorText(cause));
    } finally { setSaving(false); }
  };
  const publish = async (action: 'publish' | 'unpublish') => {
    if (!selected) return;
    const key = String(selected.id ?? selected.code);
    try {
      const result = await api.content[action](entity, key);
      setSelected(result); form.setFieldsValue(formValues(result)); setDirty(false); reload();
      const versions = await api.contentVersion();
      const module = versionModule[entity];
      message.success(`${action === 'publish' ? '发布' : '下线'}成功 · ${module} 版本 v${versions[module] ?? '—'}`);
    } catch (cause) { message.error(errorText(cause)); }
  };
  const archive = (row: AdminRecord) => {
    const key = String(row.id ?? row.code);
    Modal.confirm({ title: `确认归档“${displayName(entity, row)}”？`, content: '归档后客户端将不再展示该内容。', okText: '归档', okButtonProps: { danger: true },
      onOk: async () => { try { await api.content.archive(entity, key); reload(); message.success('已归档'); }
        catch (cause) { message.error(errorText(cause)); } } });
  };
  const columns = [
    ...config.columns.map((column) => ({ title: column.title, dataIndex: column.key, key: column.key,
      render: (value: unknown) => textCell(value, column.key) })),
    { title: '状态', key: 'status', render: (_: unknown, row: AdminRecord) => <Space>
      <Tag color={row.status === 'PUBLISHED' ? 'green' : row.status === 'ARCHIVED' ? 'default' : 'gold'}>{statusLabels[row.status ?? ''] ?? row.status}</Tag>
      {row.draftPending && <Tag color="blue">待发布修改</Tag>}</Space> },
    { title: '操作', key: 'action', fixed: 'right' as const, render: (_: unknown, row: AdminRecord) => <Space>
      <Button type="link" onClick={() => openEditor(row)}>{canEdit ? '编辑' : '查看'}</Button>
      {canEdit && row.status !== 'ARCHIVED' && <Button type="link" danger onClick={() => archive(row)}>归档</Button>}</Space> },
  ];
  const editorForm = <Form form={form} layout="vertical" disabled={!canEdit} onFinish={save} onValuesChange={() => setDirty(true)}>
    {config.sections.map((section) => <section className="form-section" key={section.title}>
      <div className="section-title"><span>{section.title}</span></div><div className="field-grid">
        {section.fields.map((field) => <FieldEditor key={field.name} field={field}
          disabled={!canEdit || Boolean(selected && ['code', 'passportRegion', 'destinationCountryCode'].includes(field.name))} />)}
      </div></section>)}
    {config.planMapping && <PlanMappingEditor form={form} />}
  </Form>;
  const guideCategories = [
    ['COUNTRY_OVERVIEW', '国家概况'], ['ENTRY_RESIDENCE', '入境居留'], ['TRAVEL_RISK', '风险与安全'],
    ['SAFETY', '安全防范'], ['TRANSPORT', '交通出行'], ['PRICE_MEDICAL', '物价医疗'], ['PRACTICAL_INFO', '实用信息'],
  ];
  const countryDetails = selected && entity === 'countries' ? <Tabs className="country-detail-tabs" items={[
    { key: 'basic', label: '基础信息', children: editorForm },
    ...guideCategories.map(([category, label]) => ({ key: category!, label: label!,
      children: <CountryGuideEditor countryCode={String(selected.code)} category={category!} /> })),
    { key: 'visa', label: '签证结构化信息', children: <CountryVisaEditor countryCode={String(selected.code)}
      countryName={String(selected.nameZh ?? selected.nameEn ?? selected.code)} /> },
    { key: 'attractions', label: '景点', children: <CountryAttractions countryCode={String(selected.code)} /> },
    { key: 'media', label: '媒体', children: <><CountryMediaManager parent={String(selected.code)} canEdit={canEdit} />
      <LinkedItems type="country" parent={String(selected.code)} canEdit={canEdit} /></> },
  ]} /> : <>
    {editorForm}
    {selected && config.linked === 'country' && <LinkedItems type="country" parent={String(selected.code)} canEdit={canEdit} />}
    {selected && config.linked === 'attraction' && <LinkedItems type="attraction" parent={String(selected.id)} canEdit={canEdit} />}
    {selected && config.linked === 'visa' && <section className="form-section"><div className="section-title"><span>签证材料</span></div>
      <Typography.Paragraph type="secondary">每条材料独立维护，可配置 Plan Mapping 与排序。</Typography.Paragraph>
      <Button onClick={() => { setOpen(false); navigate(`/content/visa-requirements?visaPolicyId=${selected.id}`); }}>管理该政策材料 →</Button></section>}
  </>;
  return <div className="page-stack">
    <div className="page-heading"><div><Typography.Text className="eyebrow">KNOWLEDGE BASE / {entity.toUpperCase()}</Typography.Text>
      <Typography.Title level={2}>{config.title}</Typography.Title><Typography.Text type="secondary">结构化维护 · 保存草稿 · 审核发布</Typography.Text></div>
      {canEdit && <Button type="primary" size="large" onClick={() => openEditor()}>新增{config.singular}</Button>}</div>
    <div className="surface"><div className="filter-row">{config.filters?.map((filter) => filter.name === 'keyword' ?
      <Input key={filter.name} placeholder={filter.label} allowClear style={{ width: 220 }}
        onChange={(event) => { const value = event.target.value; clearTimeout(debounce.current);
          debounce.current = setTimeout(() => updateFilter(filter.name, value || undefined), 300); }} /> :
      <FilterControl key={filter.name} filter={filter} value={String(filters[filter.name] ?? '') || undefined}
        onChange={(value) => updateFilter(filter.name, value)} />)}
      <Button onClick={reload}>重试 / 刷新</Button></div>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} action={<Button size="small" onClick={reload}>重试</Button>} />}
      <Table rowKey={(row) => String(row.id ?? row.code)} columns={columns} dataSource={items} loading={loading}
        scroll={{ x: 880 }} locale={{ emptyText: '暂无内容，使用右上角按钮新增' }}
        pagination={{ current: page, pageSize: 20, total, showTotal: (count) => `共 ${count} 条`, onChange: setPage }} />
    </div>
    <Drawer title={selected ? displayName(entity, selected) : `新增${config.singular}`} width={entity === 'countries' ? 1040 : 820} open={open} onClose={closeEditor}
      destroyOnClose extra={<Space>{selected && selected.status === 'PUBLISHED' && <Tag color="green">线上版本 v{selected.version}</Tag>}
        {selected?.draftPending && <Tag color="blue">草稿待发布</Tag>}</Space>}
      footer={<div className="drawer-footer"><Typography.Text type="secondary">{selected?.draftPending ? '当前编辑未影响客户端' : '先保存，再发布'}</Typography.Text>
        <Space>{canEdit && <Button type="primary" loading={saving} onClick={() => form.submit()}>保存草稿</Button>}
          {canPublish && selected && selected.status !== 'PUBLISHED' && <Button onClick={() => publish('publish')}>发布</Button>}
          {canPublish && selected?.draftPending && <Button onClick={() => publish('publish')}>发布修改</Button>}
          {canPublish && selected?.status === 'PUBLISHED' && !selected.draftPending && <Button onClick={() => publish('unpublish')}>下线</Button>}</Space></div>}>
      {selected?.draftPending && <Alert type="info" showIcon message="已发布内容的修改暂存在草稿，点击“发布修改”后才会更新客户端。" style={{ marginBottom: 16 }} />}
      {countryDetails}
    </Drawer>
  </div>;
}
