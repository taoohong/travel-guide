import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Select, Space, Tag, Typography, message } from 'antd';
import type { AdminRecord } from '@travel-guide/api-client';
import { useAuth, can } from '../app/auth';
import { fromLocalDate, toLocalDate } from './FieldEditor';
import { api, errorText } from '../services/api';

const requirements = [
  { value: 'REQUIRED', label: '需要签证' }, { value: 'VISA_FREE', label: '免签' },
  { value: 'VISA_ON_ARRIVAL', label: '落地签' }, { value: 'E_VISA', label: '电子签证' },
  { value: 'CONDITIONAL', label: '有条件适用' }, { value: 'UNKNOWN', label: '未明确' },
];
const statusLabel: Record<string, string> = { DRAFT: '草稿', REVIEW: '待审核', PUBLISHED: '已发布' };

export function CountryVisaEditor({ countryCode, countryName }: { countryCode: string; countryName: string }) {
  const { admin } = useAuth();
  const canEdit = can(admin?.role, 'edit');
  const canPublish = can(admin?.role, 'publish');
  const [form] = Form.useForm();
  const [policy, setPolicy] = useState<AdminRecord>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const reload = () => {
    setLoading(true); setError(undefined);
    api.content.list('visa', { passportRegion: 'CN', destinationCountryCode: countryCode, page: 1, pageSize: 20 })
      .then((result) => {
        const online = result.items[0];
        if (!online?.id) { setPolicy(undefined); form.resetFields(); form.setFieldsValue({
          passportRegion: 'CN', destinationCountryCode: countryCode, visaType: 'UNKNOWN', visaRequirement: 'UNKNOWN',
          title: `中国大陆护照 · ${countryName} 入境政策`, maxStayDays: null, passportRequired: null, passportValidityMonths: null,
        }); return; }
        const loadDetail = online.draftPending ? api.content.get('visa', String(online.id)) : Promise.resolve(online);
        return loadDetail.then((next) => {
        setPolicy(next);
        form.resetFields();
        form.setFieldsValue({ ...next, retrievedAt: toLocalDate(next.retrievedAt) });
        });
      })
      .catch((cause) => setError(errorText(cause)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [countryCode]);
  const save = async (values: Record<string, unknown>) => {
    setSaving(true);
    const body = { ...values, passportRegion: 'CN', destinationCountryCode: countryCode,
      visaType: 'UNKNOWN', visaRequirement: values.visaRequirement ?? 'UNKNOWN',
      maxStayDays: values.maxStayDays ?? null, passportRequired: values.passportRequired ?? null,
      passportValidityMonths: values.passportValidityMonths ?? null,
      sourceProvider: values.sourceProvider || null, sourceName: values.sourceName || values.sourceProvider || null,
      retrievedAt: fromLocalDate(values.retrievedAt), lastVerifiedAt: null };
    try {
      if (policy?.id) await api.content.update('visa', String(policy.id), body);
      else await api.content.create('visa', body);
      message.success('签证信息已保存为草稿');
      reload();
    } catch (cause) { message.error(errorText(cause)); }
    finally { setSaving(false); }
  };
  const publish = async () => {
    if (!policy?.id) return;
    try { await api.content.publish('visa', String(policy.id)); message.success('签证信息已审核发布'); reload(); }
    catch (cause) { message.error(errorText(cause)); }
  };
  const nullHint = '暂无可靠数据';
  return <div className="country-visa-editor">
    <div className="section-title"><span>中国大陆护照 → {countryName}</span>
      {policy && <Tag color={policy.status === 'PUBLISHED' ? 'green' : 'gold'}>{statusLabel[String(policy.status)] ?? policy.status}</Tag>}</div>
    <Alert type="info" showIcon message="签证结论采用结构化字段维护；空值显示为“未明确 / 暂无可靠数据”，不要求补填天数。" />
    {error && <Alert type="error" showIcon message={error} action={<Button onClick={reload}>重试</Button>} style={{ marginTop: 12 }} />}
    <Form form={form} layout="vertical" onFinish={save} disabled={!canEdit || loading}>
      <div className="field-grid country-visa-grid">
        <Form.Item name="visaRequirement" label="签证要求"><Select options={requirements} /></Form.Item>
        <Form.Item name="maxStayDays" label="最长停留时间（天）" extra="不明确时留空，发布后显示“暂无可靠数据”。">
          <InputNumber min={1} precision={0} placeholder={nullHint} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="passportRequired" label="是否需要护照"><Select allowClear placeholder="未明确" options={[
          { value: true, label: '需要' }, { value: false, label: '不需要' }]} /></Form.Item>
        <Form.Item name="passportValidityMonths" label="护照有效期要求（月）">
          <InputNumber min={1} precision={0} placeholder={nullHint} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="passportValidityRequirement" label="护照有效期补充说明" className="span-two"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="entrySummary" label="入境摘要" className="span-two"><Input.TextArea rows={3} maxLength={5000} showCount /></Form.Item>
        <Form.Item name="requirementText" label="详细说明" className="span-two"><Input.TextArea rows={8} maxLength={20000} showCount /></Form.Item>
      </div>
      <div className="section-title"><span>来源与审核</span></div>
      <div className="field-grid">
        <Form.Item name="sourceProvider" label="来源平台"><Input placeholder="例如：中国领事服务网（外交部领事司）" /></Form.Item>
        <Form.Item name="sourceUrl" label="来源链接"><Input placeholder="https://…" /></Form.Item>
        <Form.Item name="retrievedAt" label="采集时间"><Input type="datetime-local" /></Form.Item>
        <div className="form-source-meta"><Typography.Text type="secondary">最后审核时间</Typography.Text>
          <Typography.Text>{typeof policy?.lastVerifiedAt === 'string' ? new Date(policy.lastVerifiedAt).toLocaleString('zh-CN') : '未明确'}</Typography.Text>
        </div>
      </div>
      <Space wrap>
        {typeof policy?.sourceUrl === 'string' && policy.sourceUrl && <Button href={policy.sourceUrl} target="_blank" rel="noreferrer">查看原始来源</Button>}
        {canEdit && <Button type="primary" htmlType="submit" loading={saving}>{policy?.draftPending ? '保存草稿修改' : '保存草稿'}</Button>}
        {canPublish && policy && (policy.status !== 'PUBLISHED' || policy.draftPending) &&
          <Button onClick={publish} loading={loading}>审核并发布</Button>}
      </Space>
    </Form>
  </div>;
}
