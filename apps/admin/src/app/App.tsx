import { useEffect, useState } from 'react';
import { Button, ConfigProvider, Form, Input, Layout, Menu, Spin, Tag, Typography, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ManagedEntity } from '@travel-guide/api-client';
import { AuthProvider, can, useAuth } from './auth';
import { navigate } from './navigation';
import { contentConfigs } from '../content/config';
import { Dashboard } from '../pages/Dashboard';
import { ContentManager } from '../pages/ContentManager';
import { MediaPage } from '../pages/MediaPage';
import { LogsPage } from '../pages/LogsPage';
import { CountryImportPage } from '../pages/CountryImportPage';
import { errorText } from '../services/api';

const { Sider, Header, Content } = Layout;
const group = (label: string, children: ManagedEntity[]) => ({ key: label, label,
  children: children.map((entity) => ({ key: `/content/${entity}`, label: contentConfigs[entity].title })) });
const menu = [
  { key: '/', label: '工作台首页' },
  group('目的地管理', ['continents', 'countries', 'cities']),
  group('签证管理', ['visa', 'visa-requirements']),
  group('旅行攻略', ['transport', 'packing', 'travel-apps', 'tips']),
  group('景点管理', ['attractions']),
  { key: '内容导入', label: '内容导入', children: [{ key: '/imports/country', label: '国家资料导入' }] },
  { key: '/media', label: '媒体管理' },
  { key: '/operation-logs', label: '操作日志' },
];

function LoginPage() {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async ({ username, password }: { username: string; password: string }) => {
    setBusy(true); setError(undefined);
    try { await login(username, password); navigate('/'); message.success('欢迎回到内容工作台'); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };
  return <div className="login-page"><div className="login-panel"><div className="brand-symbol">旅</div>
    <Typography.Text className="eyebrow">TRAVEL GUIDE / CONTENT OPERATIONS</Typography.Text>
    <Typography.Title level={1}>让可靠的旅行信息，<br />始终走在旅途前面。</Typography.Title>
    <Typography.Paragraph>出国旅行宝典 · 结构化旅行知识库</Typography.Paragraph>
    <Form layout="vertical" onFinish={submit} className="login-form">
      <Form.Item name="username" label="管理员账号" rules={[{ required: true, message: '请输入账号' }]}><Input size="large" autoComplete="username" /></Form.Item>
      <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}><Input.Password size="large" autoComplete="current-password" /></Form.Item>
      {error && <div className="login-error" role="alert">{error}</div>}
      <Button type="primary" size="large" htmlType="submit" block loading={busy}>登录工作台</Button>
    </Form><div className="login-foot">内容由人核验 · 版本由系统维护</div></div>
    <div className="login-side"><div className="login-side-inner"><span>01 / 目的地</span><span>02 / 签证</span><span>03 / 攻略</span><span>04 / 发布</span></div>
      <strong>每一条清晰的内容，<br />都让出发更从容。</strong></div></div>;
}

function Workspace() {
  const { admin, loading, logout } = useAuth();
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const change = () => setPath(location.pathname);
    window.addEventListener('popstate', change); return () => window.removeEventListener('popstate', change); }, []);
  if (loading) return <div className="boot"><Spin size="large" tip="正在恢复管理员会话" /></div>;
  if (!admin) return <LoginPage />;
  const entity = path.startsWith('/content/') ? path.slice('/content/'.length) as ManagedEntity : null;
  const selected = entity && entity in contentConfigs ? entity : null;
  const visibleMenu = can(admin.role, 'edit') ? menu : menu.filter((item) => item.key !== '内容导入');
  const title = selected ? contentConfigs[selected].title : path === '/media' ? '媒体管理' : path === '/imports/country' ? '国家资料导入' :
    path === '/operation-logs' ? '操作日志' : '工作台首页';
  return <Layout className="app-shell"><Sider width={232} className="app-sider" theme="dark">
    <button type="button" className="side-brand" onClick={() => navigate('/')}><span className="brand-symbol">旅</span>
      <span><strong>出国旅行宝典</strong><small>内容工作台</small></span></button>
    <div className="side-label">CONTENT OPERATIONS</div>
    <Menu theme="dark" mode="inline" items={visibleMenu} selectedKeys={[path]} defaultOpenKeys={['目的地管理', '签证管理', '旅行攻略', '景点管理', '内容导入']}
      onClick={({ key }) => navigate(key)} className="side-menu" />
    <div className="side-footer">STRUCTURED KNOWLEDGE<br />FOR BETTER JOURNEYS</div>
  </Sider><Layout><Header className="app-header"><div className="header-crumb">工作台 <span>/</span> {title}</div>
    <div className="header-user"><Tag color="geekblue">{admin.role}</Tag><strong>{admin.username}</strong>
      <Button type="text" onClick={logout}>退出</Button></div></Header>
    <Content className="app-content">{selected ? <ContentManager key={selected} entity={selected} /> :
      path === '/media' ? <MediaPage /> : path === '/imports/country' ? <CountryImportPage /> :
        path === '/operation-logs' ? <LogsPage /> : <Dashboard />}</Content>
  </Layout></Layout>;
}

export function App() {
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#a75327', borderRadius: 6,
    colorText: '#243039', colorBgBase: '#fbfaf7', fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif' },
    components: { Table: { headerBg: '#f4f2ed' }, Menu: { darkItemBg: '#1d2a31', darkSubMenuItemBg: '#1d2a31' } } }}>
    <AuthProvider><Workspace /></AuthProvider>
  </ConfigProvider>;
}
