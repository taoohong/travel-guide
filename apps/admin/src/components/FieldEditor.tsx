import { useEffect, useState } from 'react';
import { Button, Form, Image, Input, InputNumber, Modal, Select, Space, Spin, Switch, Typography } from 'antd';
import type { MediaAsset } from '@travel-guide/api-client';
import type { Field } from '../content/config';
import { api } from '../services/api';

export function toLocalDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function fromLocalDate(value: unknown): string | null | undefined {
  return typeof value === 'string' && value ? new Date(value).toISOString() : value === '' ? null : value as null | undefined;
}

function RemoteSelect({ kind, value, onChange }: { kind: 'country' | 'continent'; value?: string; onChange?: (value: string) => void }) {
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const search = (keyword = '') => {
    setLoading(true);
    const query = keyword ? { keyword, pageSize: 20 } : { pageSize: 20 };
    const request = kind === 'country' ? api.country.list(query) : api.continent.list(query);
    request.then((result) => setOptions(result.items.map((row) => ({ value: String(row.code), label: `${row.nameZh} · ${row.code}` }))))
      .finally(() => setLoading(false));
  };
  useEffect(() => { search(); }, [kind]);
  return <Select showSearch filterOption={false} onSearch={search} value={value} onChange={onChange} loading={loading}
    options={value && !options.some((option) => option.value === value) ? [{ value, label: value }, ...options] : options}
    placeholder={kind === 'country' ? '搜索国家' : '选择大陆'} allowClear />;
}

function MediaPicker({ value, onChange }: { value?: string; onChange?: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.media.list({ pageSize: 24, usage: 'ATTRACTION' }).then((page) => setItems(page.items)).finally(() => setLoading(false));
  }, [open]);
  return <div className="media-field">
    <Input value={value} onChange={(event) => onChange?.(event.target.value)} placeholder="选择已压缩的 WebP 图片" />
    <Button onClick={() => setOpen(true)}>从媒体库选择</Button>
    {value && <Image src={value} width={84} height={60} style={{ objectFit: 'cover', borderRadius: 6 }} />}
    <Modal title="选择景点图片" open={open} onCancel={() => setOpen(false)} footer={null} width={700}>
      {loading ? <Spin /> : <div className="media-picker-grid">{items.map((item) => <button key={item.id} type="button" onClick={() => { onChange?.(item.url); setOpen(false); }}>
        <img src={item.url} alt="已压缩媒体" /><span>{item.width} × {item.height}</span></button>)}</div>}
      {!loading && !items.length && <Typography.Text type="secondary">媒体库为空，请先上传图片。</Typography.Text>}
    </Modal>
  </div>;
}

export function FieldEditor({ field, disabled }: { field: Field; disabled?: boolean }) {
  if (field.kind === 'array') return <Form.List name={field.name}>{(fields, { add, remove }) =>
    <Form.Item label={field.label} tooltip={field.hint} className="field-wide">
      <Space direction="vertical" style={{ width: '100%' }}>{fields.map((entry) => <Space key={entry.key} align="start" style={{ width: '100%' }}>
        <Form.Item name={entry.name} rules={[{ required: true, message: '请填写内容' }]} noStyle>
          <Input disabled={disabled} style={{ width: '100%', minWidth: 0, flex: 1 }} />
        </Form.Item>
        {!disabled && <Button onClick={() => remove(entry.name)}>移除</Button>}
      </Space>)}{!disabled && <Button type="dashed" onClick={() => add()}>＋ 添加{field.label}</Button>}</Space>
    </Form.Item>}</Form.List>;
  const rules = [{ required: field.required, message: `请填写${field.label}` },
    ...(field.kind === 'url' ? [{ type: 'url' as const, message: '请输入有效 URL' }] : [])];
  const control = field.kind === 'textarea' ? <Input.TextArea rows={3} maxLength={10000} disabled={disabled} /> :
    field.kind === 'number' ? <InputNumber style={{ width: '100%' }} disabled={disabled} /> :
    field.kind === 'switch' ? <Switch disabled={disabled} /> :
    field.kind === 'select' ? <Select options={field.options} disabled={disabled} /> :
    field.kind === 'country' || field.kind === 'continent' ? <RemoteSelect kind={field.kind} /> :
    field.kind === 'media' ? <MediaPicker /> :
    <Input type={field.kind === 'date' ? 'datetime-local' : 'text'} placeholder={field.hint} disabled={disabled} />;
  return <Form.Item name={field.name} label={field.label} rules={rules} valuePropName={field.kind === 'switch' ? 'checked' : 'value'}
    tooltip={field.hint} className={field.kind === 'textarea' || field.kind === 'media' ? 'field-wide' : undefined}>{control}</Form.Item>;
}
