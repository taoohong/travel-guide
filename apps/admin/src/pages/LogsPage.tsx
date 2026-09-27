import { useEffect, useState } from 'react';
import { Alert, Button, Input, Select, Table, Typography } from 'antd';
import type { OperationLog, Query } from '@travel-guide/api-client';
import { api, errorText } from '../services/api';

const actions = ['CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'UNPUBLISH', 'LOGIN'];
export function LogsPage() {
  const [items, setItems] = useState<OperationLog[]>([]);
  const [filters, setFilters] = useState<Query>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const reload = () => { setLoading(true); setError(undefined);
    api.operationLog({ ...filters, page, pageSize: 20 }).then((result) => { setItems(result.items); setTotal(result.total); })
      .catch((cause) => setError(errorText(cause))).finally(() => setLoading(false)); };
  useEffect(reload, [page, JSON.stringify(filters)]);
  const filter = (key: string, value?: string) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };
  return <div className="page-stack"><div className="page-heading"><div>
    <Typography.Text className="eyebrow">AUDIT TRAIL / REQUEST ID</Typography.Text><Typography.Title level={2}>操作日志</Typography.Title>
    <Typography.Text type="secondary">追踪内容修改、发布与管理员登录</Typography.Text></div></div>
    <div className="surface"><div className="filter-row">
      <Input placeholder="管理员 ID" onPressEnter={(event) => filter('adminUserId', event.currentTarget.value)} style={{ width: 180 }} />
      <Select placeholder="操作类型" allowClear onChange={(value) => filter('action', value)}
        options={actions.map((value) => ({ value, label: value }))} style={{ width: 145 }} />
      <Input placeholder="目标类型" onPressEnter={(event) => filter('targetType', event.currentTarget.value)} style={{ width: 150 }} />
      <Input type="datetime-local" aria-label="开始时间" onChange={(event) => filter('from', event.target.value ? new Date(event.target.value).toISOString() : undefined)} style={{ width: 190 }} />
      <Input type="datetime-local" aria-label="结束时间" onChange={(event) => filter('to', event.target.value ? new Date(event.target.value).toISOString() : undefined)} style={{ width: 190 }} />
      <Button onClick={reload}>刷新</Button></div>
      {error && <Alert type="error" showIcon message={error} action={<Button onClick={reload}>重试</Button>} />}
      <Table rowKey="id" loading={loading} dataSource={items} locale={{ emptyText: '暂无操作日志' }}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage }} expandable={{ expandedRowRender: (row) =>
          <div className="changes">{Array.isArray(row.changes) && row.changes.length ? row.changes.map((change, index) => <div key={index}>
            <strong>{change.field}</strong><span>{JSON.stringify(change.before) ?? '—'}</span><span>→</span><span>{JSON.stringify(change.after) ?? '—'}</span>
          </div>) : <Typography.Text type="secondary">没有字段差异</Typography.Text>}</div> }}
        columns={[{ title: '时间', dataIndex: 'timestamp', render: (value: string) => new Date(value).toLocaleString('zh-CN') },
          { title: '管理员 ID', dataIndex: 'adminUserId' }, { title: '动作', dataIndex: 'action' },
          { title: '对象', dataIndex: 'targetLabel' }, { title: '目标类型', dataIndex: 'targetType' },
          { title: 'RequestId', dataIndex: 'requestId', render: (value: string) => <Typography.Text copyable>{value ?? '—'}</Typography.Text> }]} />
    </div>
  </div>;
}
