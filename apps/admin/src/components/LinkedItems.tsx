import { useEffect, useState } from 'react';
import { Alert, Button, Image, InputNumber, Popconfirm, Select, Space, Spin, Typography, message } from 'antd';
import type { AdminRecord, LinkKind } from '@travel-guide/api-client';
import { api, errorText } from '../services/api';

function LinkGroup({ kind, parent, canEdit }: { kind: LinkKind; parent: string; canEdit: boolean }) {
  const [items, setItems] = useState<AdminRecord[]>([]);
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const label = kind === 'country-packing' ? '准备事项' : kind === 'country-apps' ? '推荐 App' :
    kind === 'country-media' ? '国家媒体' : '景点图片';
  const refresh = () => api.links.list(kind, parent).then(setItems).catch((cause) => setError(errorText(cause)));
  useEffect(() => { void refresh(); }, [kind, parent]);
  const search = (keyword = '') => {
    const query = { keyword: keyword || undefined, pageSize: 20 };
    const request = kind === 'country-packing' ? api.packing.list(query) :
      kind === 'country-apps' ? api.travelApp.list(query) : api.media.list({ usage: kind === 'country-media' ? 'CONTENT' : 'ATTRACTION',
        pageSize: 20, keyword: keyword || undefined });
    request.then((page) => setOptions(page.items.map((item) => ({ value: String(item.id),
      label: String('name' in item ? item.name : 'url' in item ? item.path : item.code) }))));
  };
  useEffect(() => { search(); }, [kind]);
  const add = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const body = kind === 'country-packing' ? { countryCode: parent, packingItemId: selected } :
        kind === 'country-apps' ? { countryCode: parent, travelAppId: selected } :
          kind === 'country-media' ? { countryCode: parent, mediaAssetId: selected } : { attractionId: parent, mediaAssetId: selected };
      await api.links.create(kind, body);
      setSelected(undefined);
      await refresh();
      message.success(`${label}已关联`);
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await api.links.remove(kind, id); await refresh(); message.success('关联已移除'); }
    catch (cause) { setError(errorText(cause)); }
  };
  const reorder = async (id: string, sortOrder: number) => {
    try { await api.links.reorder(kind, id, sortOrder); await refresh(); }
    catch (cause) { setError(errorText(cause)); }
  };
  return <section className="link-section">
    <div className="section-title"><span>{label}</span><Typography.Text type="secondary">{kind === 'attraction-images' ? '选择已压缩媒体' : '关联全局内容，不复制条目'}</Typography.Text></div>
    {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => { setError(undefined); void refresh(); }}>重试</Button>} />}
    {canEdit && <Space style={{ width: '100%', marginBottom: 12 }}>
      <Select showSearch filterOption={false} onSearch={search} onFocus={() => search()} options={options}
        value={selected} onChange={setSelected} placeholder={`搜索并选择${label}`} style={{ width: 360 }} allowClear />
      <Button onClick={add} disabled={!selected} loading={busy}>关联</Button>
    </Space>}
    {!items.length && !error && <Typography.Text type="secondary">暂无关联内容</Typography.Text>}
    <div className="link-list">{items.map((item) => <div key={String(item.id)} className="link-row">
      {(kind === 'attraction-images' || kind === 'country-media') && item.url ?
        <Image src={String(item.url)} width={74} height={52} style={{ objectFit: 'cover' }} /> : null}
      <span className="link-name">{String((item.packingItem as AdminRecord | undefined)?.name ??
        (item.travelApp as AdminRecord | undefined)?.name ?? item.alt ?? item.url ?? item.id)}</span>
      <Space><InputNumber min={0} size="small" value={Number(item.sortOrder ?? 0)} disabled={!canEdit}
        onChange={(value) => { if (value !== null) void reorder(String(item.id), value); }} aria-label="排序" />
      {canEdit && <Popconfirm title={`移除${label}关联？`} onConfirm={() => remove(String(item.id))}>
        <Button size="small" danger>移除</Button></Popconfirm>}</Space>
    </div>)}</div>
  </section>;
}

export function LinkedItems({ type, parent, canEdit }: { type: 'country' | 'attraction'; parent: string; canEdit: boolean }) {
  if (!parent) return <Spin />;
  return <div>{type === 'country' ? <>
    <LinkGroup kind="country-packing" parent={parent} canEdit={canEdit} />
    <LinkGroup kind="country-apps" parent={parent} canEdit={canEdit} />
  </> : <LinkGroup kind="attraction-images" parent={parent} canEdit={canEdit} />}</div>;
}

export function CountryMediaManager({ parent, canEdit }: { parent: string; canEdit: boolean }) {
  return parent ? <LinkGroup kind="country-media" parent={parent} canEdit={canEdit} /> : <Spin />;
}
