import { useEffect, useState } from 'react';
import { Button, Table, Tag, Typography } from 'antd';
import type { AdminRecord } from '@travel-guide/api-client';
import { navigate } from '../app/navigation';
import { api } from '../services/api';

export function CountryAttractions({ countryCode }: { countryCode: string }) {
  const [rows, setRows] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setLoading(true);
    api.attraction.list({ countryCode, page: 1, pageSize: 50 })
      .then((result) => { setRows(result.items); setTotal(result.total); })
      .finally(() => setLoading(false));
  }, [countryCode]);
  return <div>
    <div className="section-title"><span>景点内容 · {total} 条</span>
      <Button type="primary" onClick={() => navigate(`/content/attractions?countryCode=${encodeURIComponent(countryCode)}`)}>管理该国景点</Button></div>
    <Table size="small" rowKey={(row) => String(row.id)} loading={loading} dataSource={rows} pagination={false}
      locale={{ emptyText: '暂无关联景点' }} columns={[
        { title: '景点', dataIndex: 'nameZh', render: (name: string, row: AdminRecord) => <Typography.Text strong>{String(name || row.nameEn || '未命名景点')}</Typography.Text> },
        { title: '城市', dataIndex: 'cityCode', render: (value: unknown) => value ? String(value) : '—' },
        { title: '分类', dataIndex: 'category', render: (value: unknown) => value ? String(value) : '—' },
        { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'PUBLISHED' ? 'green' : 'gold'}>{value}</Tag> },
      ]} />
  </div>;
}
