import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Space, Table, Tag, Typography, message } from 'antd';
import type { AdminRecord } from '@travel-guide/api-client';
import { useAuth, can } from '../app/auth';
import { fromLocalDate, toLocalDate } from './FieldEditor';
import { api, errorText } from '../services/api';

const statuses: Record<string, string> = { DRAFT: '草稿', REVIEW: '待审核', PUBLISHED: '已发布', ARCHIVED: '已归档' };

export function CountryGuideEditor({ countryCode, category }: { countryCode: string; category: string }) {
  const { admin } = useAuth();
  const canEdit = can(admin?.role, 'edit');
  const canPublish = can(admin?.role, 'publish');
  const [form] = Form.useForm();
  const [rows, setRows] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<AdminRecord>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const reload = () => {
    setLoading(true); setError(undefined);
    api.content.list('country-guides', { countryCode, category, page: 1, pageSize: 100 })
      .then(async (result) => setRows(await Promise.all(result.items.map((row) => row.draftPending && row.id ?
        api.content.get('country-guides', String(row.id)) : row))))
      .catch((cause) => setError(errorText(cause)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [countryCode, category]);

  const edit = (row?: AdminRecord) => {
    setCurrent(row);
    form.resetFields();
    if (row) form.setFieldsValue({ ...row, sourceUpdatedAt: toLocalDate(row.sourceUpdatedAt),
      importedAt: toLocalDate(row.importedAt), lastVerifiedAt: toLocalDate(row.lastVerifiedAt) });
    else form.setFieldsValue({ countryCode, category, sortOrder: rows.length * 10 });
    setOpen(true);
  };
  const save = async (values: Record<string, unknown>) => {
    setSaving(true);
    const body = { ...values, countryCode, category,
      sourceUpdatedAt: fromLocalDate(values.sourceUpdatedAt), importedAt: fromLocalDate(values.importedAt),
      lastVerifiedAt: fromLocalDate(values.lastVerifiedAt) };
    try {
      if (current?.id) await api.content.update('country-guides', String(current.id), body);
      else await api.content.create('country-guides', body);
      setOpen(false); reload(); message.success('指南草稿已保存');
    } catch (cause) { message.error(errorText(cause)); }
    finally { setSaving(false); }
  };
  const publish = async (row: AdminRecord) => {
    if (!row.id) return;
    try { await api.content.publish('country-guides', String(row.id)); reload(); message.success('已审核并发布'); }
    catch (cause) { message.error(errorText(cause)); }
  };
  const columns = [
    { title: '二级标题', dataIndex: 'title', width: 180, render: (value: string, row: AdminRecord) => <Space direction="vertical" size={2}>
      <Typography.Text strong>{value}</Typography.Text>{row.draftPending && <Tag color="blue">待发布修改</Tag>}</Space> },
    { title: '内容', dataIndex: 'content', ellipsis: true, render: (value: string) => <Typography.Text type="secondary">{value}</Typography.Text> },
    { title: '来源平台', dataIndex: 'sourceProvider', width: 190 },
    { title: '来源链接', dataIndex: 'sourceUrl', width: 120, render: (value: string) => value ? <Button type="link" href={value} target="_blank" rel="noreferrer">查看原始来源</Button> : '—' },
    { title: '采集时间', dataIndex: 'importedAt', width: 145, render: (value: string) => value ? new Date(value).toLocaleString('zh-CN') : '暂无可靠数据' },
    { title: '最后审核', dataIndex: 'lastVerifiedAt', width: 145, render: (value: string) => value ? new Date(value).toLocaleString('zh-CN') : '未明确' },
    { title: '状态', dataIndex: 'status', width: 90, render: (value: string) => <Tag color={value === 'PUBLISHED' ? 'green' : 'gold'}>{statuses[value] ?? value}</Tag> },
    { title: '操作', key: 'actions', width: 180, render: (_: unknown, row: AdminRecord) => <Space>
      <Button type="link" onClick={() => edit(row)}>{canEdit ? '编辑' : '查看'}</Button>
      {canPublish && (row.status !== 'PUBLISHED' || row.draftPending) && <Button type="link" onClick={() => publish(row)}>审核并发布</Button>}
    </Space> },
  ];

  return <div className="guide-editor">
    <div className="section-title"><span>结构化分节</span><Space>
      <Typography.Text type="secondary">每个二级标题独立保存、审核和发布</Typography.Text>
      {canEdit && <Button type="primary" onClick={() => edit()}>新增小节</Button>}
    </Space></div>
    {error && <Alert type="error" showIcon message={error} action={<Button onClick={reload}>重试</Button>} />}
    <Table size="small" rowKey={(row) => String(row.id)} columns={columns} dataSource={rows} loading={loading}
      pagination={false} scroll={{ x: 1180 }} locale={{ emptyText: '此分类暂无小节，可新增或从国家资料导入' }} />
    <Modal title={current ? '编辑指南小节' : '新增指南小节'} open={open} onCancel={() => setOpen(false)} footer={null}
      width={760} destroyOnClose>
      <Form form={form} layout="vertical" disabled={!canEdit} onFinish={save}>
        <Form.Item name="title" label="二级标题" rules={[{ required: true, whitespace: true }]}><Input maxLength={200} /></Form.Item>
        <Form.Item name="content" label="内容" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={8} maxLength={50000} showCount /></Form.Item>
        <Form.Item name="sortOrder" label="排序"><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
        <div className="section-title"><span>来源与审核信息</span></div>
        <div className="field-grid">
          <Form.Item name="sourceProvider" label="来源平台" rules={[{ required: true, whitespace: true }]}><Input maxLength={200} /></Form.Item>
          <Form.Item name="sourceUrl" label="来源链接" rules={[{ required: true }, { type: 'url' }]}><Input /></Form.Item>
          <Form.Item name="importedAt" label="采集时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="sourceUpdatedAt" label="来源更新时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="lastVerifiedAt" label="最后审核时间"><Input type="datetime-local" /></Form.Item>
        </div>
        <Form.Item><Space><Button onClick={() => setOpen(false)}>取消</Button>
          <Button type="primary" htmlType="submit" loading={saving} disabled={!canEdit}>保存草稿</Button></Space></Form.Item>
      </Form>
    </Modal>
  </div>;
}
