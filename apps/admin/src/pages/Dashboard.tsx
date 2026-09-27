import { useEffect, useState } from 'react';
import { Alert, Button, Progress, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { AdminRecord, ContentHealth, OperationLog } from '@travel-guide/api-client';
import { api, errorText } from '../services/api';
import { navigate } from '../app/navigation';

const moduleNames: Record<string, string> = { country: '国家', visa: '签证', attraction: '景点', transport: '交通',
  packing: '准备事项', travelTip: '旅行贴士', city: '城市' };

export function Dashboard() {
  const [health, setHealth] = useState<ContentHealth>();
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<OperationLog[]>([]);
  const [countries, setCountries] = useState<AdminRecord[]>([]);
  const [stale, setStale] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const reload = () => {
    setLoading(true); setError(undefined);
    Promise.all([api.contentHealth(), api.contentVersion(), api.operationLog({ pageSize: 5 }),
      api.country.list({ pageSize: 5, sort: 'completeness' }), api.visaFreshness()])
      .then(([summary, modules, logs, lowCountries, staleVisa]) => {
        setHealth(summary); setVersions(modules); setRecent(logs.items); setCountries(lowCountries.items); setStale(staleVisa);
      }).catch((cause) => setError(errorText(cause))).finally(() => setLoading(false));
  };
  useEffect(reload, []);
  const metrics = health ? [
    { label: '国家总数', value: health.countries, path: '/content/countries' },
    { label: '已上线国家', value: health.onlineCountries, path: '/content/countries?online=true' },
    { label: '缺失签证', value: health.missingVisa, path: '/content/visa' },
    { label: 'Guide 平均完整度', value: `${health.guideCompleteness}%`, path: '/content/countries' },
    { label: '签证待确认', value: health.staleVisaPolicies, path: '/content/visa?stale=true' },
    { label: '无景点国家', value: health.countriesWithoutAttractions, path: '/content/attractions' },
    { label: '无交通国家', value: health.countriesWithoutTransport, path: '/content/transport' },
  ] : [];
  return <div className="page-stack">
    <div className="dashboard-intro"><Typography.Text className="eyebrow">EDITORIAL OPERATIONS / CONTENT HEALTH</Typography.Text>
      <Typography.Title level={1}>把下一条内容维护好。</Typography.Title>
      <Typography.Paragraph>这里展示知识库的缺口、待核验政策和最近改动。每项都可以进入相应内容页处理。</Typography.Paragraph></div>
    {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={reload}>重试</Button>} />}
    {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : <>
      <div className="metric-grid">{metrics.map((metric) => <button type="button" className="metric" key={metric.label} onClick={() => navigate(metric.path)}>
        <span>{metric.label}</span><strong>{metric.value}</strong><small>查看并处理 ↗</small></button>)}</div>
      <div className="dashboard-columns"><section className="surface">
        <div className="section-title"><span>优先维护</span><Typography.Text type="secondary">国家内容完整度</Typography.Text></div>
        <div className="health-summary"><Progress type="circle" percent={health?.guideCompleteness ?? 0} size={78} strokeColor="#b56a36" />
          <div><strong>Guide 资料完整度</strong><p>按 7 个国家内容分类与 CN 签证覆盖情况统计。</p></div></div>
        {countries.map((row) => {
          const checks = (row.guideStatus ?? {}) as Record<string, boolean>;
          const labels: Record<string, string> = { COUNTRY_OVERVIEW: '国家概况', ENTRY_RESIDENCE: '入境居留', TRAVEL_RISK: '风险安全',
            SAFETY: '安全防范', TRANSPORT: '交通', PRICE_MEDICAL: '物价医疗', PRACTICAL_INFO: '实用信息' };
          return <button type="button" className="country-progress country-health-row" key={String(row.code)} onClick={() => navigate(`/content/countries?keyword=${row.code}`)}>
            <span>{String(row.nameZh)} · {String(row.code)}</span>
            <Progress percent={Number(row.contentCompleteness ?? row.guideCompleteness ?? 0)} showInfo size="small" strokeColor="#b56a36" />
            <small className="country-guide-checks">{Object.entries(labels).map(([key, label]) => `${label} ${checks[key] ? '✓' : '—'}`).join(' · ')} · CN 签证 {row.cnVisa ? '✓' : '—'}</small>
          </button>;
        })}
        {stale.slice(0, 5).map((row, index) => <button type="button" className="stale-link" key={index}
          onClick={() => navigate(`/content/visa?passportRegion=${row.passportRegion}&destinationCountryCode=${row.destinationCountryCode}`)}>
          <Tag color="orange">签证待确认</Tag>{String(row.passportRegion)} → {String(row.destinationCountryCode)} <span>进入编辑 →</span></button>)}
      </section><section className="surface">
        <div className="section-title"><span>最近修改</span><Button type="link" onClick={() => navigate('/operation-logs')}>查看全部 →</Button></div>
        <Table size="small" rowKey="id" pagination={false} dataSource={recent} columns={[
          { title: '时间', dataIndex: 'timestamp', render: (value: string) => new Date(value).toLocaleString('zh-CN') },
          { title: '动作', dataIndex: 'action' }, { title: '对象', dataIndex: 'targetLabel' },
        ]} locale={{ emptyText: '暂无修改记录' }} />
        <div className="section-title version-heading"><span>内容版本</span><Typography.Text type="secondary">系统自动维护</Typography.Text></div>
        <Space wrap>{Object.entries(versions).map(([module, version]) => <Tag key={module} className="version-tag">
          {moduleNames[module] ?? module} <strong>v{version}</strong></Tag>)}</Space>
      </section></div>
    </>}
  </div>;
}
