import { useEffect, useState } from 'react';
import { Alert, Button, Image, Input, Select, Table, Tag, Typography, Upload, message } from 'antd';
import type { MediaAsset } from '@travel-guide/api-client';
import { useAuth, can } from '../app/auth';
import { api, errorText } from '../services/api';

const usageOptions = [{ value: 'ATTRACTION', label: '景点' }, { value: 'CONTENT', label: '内容' }, { value: 'MEMORY', label: '旅行记录' }];
const uploadUsageOptions = [{ value: 'ATTRACTION_COVER', label: '景点图片' }, { value: 'CONTENT_IMAGE', label: '攻略图片' },
  { value: 'MEMORY_PHOTO', label: '旅行记录图片' }];
export function MediaPage() {
  const { admin } = useAuth();
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [usage, setUsage] = useState<string>();
  const [uploadUsage, setUploadUsage] = useState('ATTRACTION_COVER');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const [lastUpload, setLastUpload] = useState<MediaAsset>();
  const reload = () => {
    setLoading(true); setError(undefined);
    api.media.list({ page, pageSize: 20, usage, keyword: keyword || undefined }).then((result) => {
      setItems(result.items); setTotal(result.total);
    }).catch((cause) => setError(errorText(cause))).finally(() => setLoading(false));
  };
  useEffect(reload, [page, usage, keyword]);
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const asset = await api.media.upload(file, uploadUsage);
      setLastUpload(asset); setPage(1); reload(); message.success('图片已压缩并保存为 WebP，未保留原图');
    } catch (cause) { setError(errorText(cause)); }
    finally { setUploading(false); }
  };
  return <div className="page-stack"><div className="page-heading"><div>
    <Typography.Text className="eyebrow">ASSET LIBRARY / WEBP</Typography.Text><Typography.Title level={2}>媒体管理</Typography.Title>
    <Typography.Text type="secondary">服务端压缩保存 · 仅保留 WebP · 最大 5 MB</Typography.Text></div>
    {can(admin?.role, 'upload') && <div className="filter-row"><Select aria-label="上传用途" value={uploadUsage} onChange={setUploadUsage}
      options={uploadUsageOptions} style={{ width: 160 }} /><Upload showUploadList={false} accept="image/jpeg,image/png,image/webp"
      beforeUpload={(file) => { void upload(file); return false; }}><Button type="primary" size="large" loading={uploading}>
        {uploading ? '上传并压缩处理中…' : '上传图片'}</Button></Upload></div>}</div>
    {lastUpload && <Alert type="success" showIcon message="上传完成：已压缩保存，未保留原图"
      description={`${lastUpload.width} × ${lastUpload.height} · ${(lastUpload.bytes / 1024).toFixed(1)} KB · ${lastUpload.mimeType}`} />}
    {error && <Alert type="error" showIcon message={error} action={<Button onClick={reload}>重试</Button>} />}
    <div className="surface"><div className="filter-row"><Input.Search placeholder="搜索路径 / URL" allowClear onSearch={setKeyword} style={{ width: 260 }} />
      <Select allowClear placeholder="用途" value={usage} onChange={(value) => { setUsage(value); setPage(1); }} options={usageOptions} style={{ width: 150 }} />
      <Button onClick={reload}>刷新</Button></div>
      <Table rowKey="id" dataSource={items} loading={loading} locale={{ emptyText: '暂无媒体，请上传 JPG、PNG 或 WebP 图片' }}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage }} columns={[
          { title: '预览', dataIndex: 'url', render: (url: string) => <Image src={url} width={82} height={60} style={{ objectFit: 'cover', borderRadius: 6 }} /> },
          { title: '文件', dataIndex: 'path' }, { title: '尺寸', render: (_: unknown, row: MediaAsset) => `${row.width} × ${row.height}` },
          { title: '大小', dataIndex: 'bytes', render: (bytes: number) => `${(bytes / 1024).toFixed(1)} KB` },
          { title: '用途', dataIndex: 'usage', render: (value: string) => <Tag>{value}</Tag> },
          { title: '格式', dataIndex: 'mimeType' },
          { title: '操作', render: (_: unknown, row: MediaAsset) => <Button type="link" onClick={() => {
            void navigator.clipboard.writeText(row.url).then(() => message.success('URL 已复制'));
          }}>复制 URL</Button> },
        ]} />
    </div>
  </div>;
}
