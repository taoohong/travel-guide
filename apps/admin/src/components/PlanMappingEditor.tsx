import { Form, Input, Select, Space, Switch, Typography, type FormInstance } from 'antd';
import { validateMapping } from '../content/config';

const stages = ['PREPARING', 'DEPARTING', 'TRAVELING', 'RETURNING'];
const types = ['VISA_MATERIAL', 'PACKING_ITEM', 'ATTRACTION'];
const scopes = ['TRIP', 'COUNTRY', 'DESTINATION'];

export function PlanMappingEditor({ form }: { form: FormInstance }) {
  const actionable = Form.useWatch('actionable', form);
  return <section className="form-section">
    <div className="section-title"><span>计划映射</span><Typography.Text type="secondary">决定客户端能否加入旅行计划及去重方式</Typography.Text></div>
    <Form.Item name="actionable" label="允许加入计划" valuePropName="checked"><Switch /></Form.Item>
    {actionable && <Space wrap className="mapping-grid" size={16}>
      <Form.Item name="targetStage" label="目标阶段" rules={[{ required: true, message: '请选择目标阶段' }]}>
        <Select options={stages.map((value) => ({ value, label: value }))} style={{ width: 180 }} /></Form.Item>
      <Form.Item name="itemType" label="计划类型" rules={[{ required: true, message: '请选择计划类型' }]}>
        <Select options={types.map((value) => ({ value, label: value }))} style={{ width: 180 }} /></Form.Item>
      <Form.Item name="scope" label="作用范围" rules={[{ required: true, message: '请选择作用范围' }]}>
        <Select options={scopes.map((value) => ({ value, label: value }))} style={{ width: 180 }} /></Form.Item>
      <Form.Item name="dedupeKey" label="跨来源去重键" tooltip="如 passport；相同键在一次 Trip 中只保留一条">
        <Input placeholder="例如 passport" style={{ width: 230 }} /></Form.Item>
    </Space>}
  </section>;
}

export { validateMapping };
