import { useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Image, Input, Text, View } from '@tarojs/components';
import { ApiError } from '@travel-guide/api-client';
import { accountService } from '../../services/accountService';
import { tripService } from '../../services/tripService';
import { useAccountStore } from '../../stores/accountStore';
import { useTripStore } from '../../stores/tripStore';
import { getNativeMenuButtonLayout } from '../../utils/nativeMenuButton';
import './index.scss';

export default function LoginPage() {
  const profile = useAccountStore((state) => state.profile);
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [avatarPath, setAvatarPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [devSubmitting, setDevSubmitting] = useState(false);
  const [backButton] = useState(() => {
    const menu = getNativeMenuButtonLayout();
    return { top: menu.top, height: menu.height };
  });

  const goBack = () => {
    void Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/dashboard/index' }));
  };

  const syncTripsAfterLogin = async (): Promise<boolean> => {
    try {
      await tripService.refresh();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '旅行同步失败';
      await Taro.showModal({ title: '登录成功，旅行同步失败', content: `${message}\n请检查网络后重试。`, showCancel: false });
      return false;
    }
  };

  const submit = async () => {
    const name = nickname.trim();
    if (!name) { await Taro.showToast({ title: '请填写微信昵称', icon: 'none' }); return; }
    if (!profile && !avatarPath) { await Taro.showToast({ title: '请先选择头像', icon: 'none' }); return; }
    if (submitting) return;
    setSubmitting(true);
    let avatarFailed = false;
    try {
      const isLogin = !profile;
      if (profile) await accountService.updateNickname(name);
      else await accountService.login(name);
      if (avatarPath) {
        try { await accountService.uploadAvatar(avatarPath); }
        catch { avatarFailed = true; }
      }
      if (isLogin) {
        if (!(await syncTripsAfterLogin())) return;
      } else void tripService.refresh().catch(() => {});
      const tripCount = useTripStore.getState().trips.length;
      await Taro.showToast({ title: avatarFailed ? '登录成功，头像稍后可重试' : profile ? '资料已更新' :
        tripCount ? `登录成功，同步了 ${tripCount} 段旅行` : '登录成功，当前账号暂无旅行',
        icon: avatarFailed ? 'none' : 'success' });
      void Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/dashboard/index' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (error instanceof ApiError && error.status === 404) {
        await Taro.showModal({ title: '登录接口不存在',
          content: '当前后端未提供微信登录接口。请更新并重启后端，并确认小程序 API 地址以 /api/v1 结尾。',
          showCancel: false });
      } else {
        await Taro.showToast({ title: message.includes('WX_LOGIN_NO_CODE') ? '获取微信登录凭证失败' :
          message || '登录失败，请稍后重试', icon: 'none' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reloginAndSync = async () => {
    if (!profile || submitting) return;
    const confirmation = await Taro.showModal({ title: '重新登录并同步',
      content: '将使用当前微信身份重新验证并读取该账号的云端旅行。昵称相同的账号不会自动合并。',
      confirmText: '重新登录', cancelText: '取消' });
    if (!confirmation.confirm) return;
    setSubmitting(true);
    try {
      await accountService.login(profile.nickname || nickname.trim());
      if (!(await syncTripsAfterLogin())) return;
      const count = useTripStore.getState().trips.length;
      await Taro.showToast({ title: count ? `已同步 ${count} 段旅行` : '登录成功，当前账号暂无旅行',
        icon: count ? 'success' : 'none' });
      void Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/dashboard/index' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      await Taro.showToast({ title: message.includes('WX_LOGIN_NO_CODE') ? '获取微信登录凭证失败' : message || '重新登录失败，请稍后重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const devLogin = async (identity: 'A' | 'B') => {
    if (devSubmitting) return; setDevSubmitting(true);
    try {
      await accountService.loginDevelopment(identity); void tripService.refresh().catch(() => {});
      await Taro.showToast({ title: `已切换到开发用户 ${identity}`, icon: 'success' });
      void Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/dashboard/index' }));
    } catch { await Taro.showToast({ title: '开发身份登录不可用', icon: 'none' }); }
    finally { setDevSubmitting(false); }
  };

  return <View className="login-page">
    <View className="login-top">
      <View className="login-back" style={{ top: `${backButton.top}px`, height: `${backButton.height}px` }} onClick={goBack}>
        <Text>‹</Text></View>
    </View>
    <View className="login-main">
      <View className="login-hero"><Text className="login-eyebrow">YOUR JOURNEY, TOGETHER</Text>
        <Text className="login-title">让每一段旅程，<Text className="login-title-accent">都有你的名字</Text></Text>
        <Text className="login-description">登录后保存旅行计划，并在不同设备间接续你的行程。</Text></View>
      <View className="login-form-card">
        <Text className="login-field-label">个人头像</Text>
        <Button className="login-avatar-button" openType="chooseAvatar" onChooseAvatar={(event) => setAvatarPath(event.detail.avatarUrl)}>
          {avatarPath ? <Image className="login-avatar-image" src={avatarPath} mode="aspectFill" /> : profile?.avatarUrl ?
            <Image className="login-avatar-image" src={profile.avatarUrl} mode="aspectFill" /> : <Text className="login-avatar-plus">＋</Text>}
        </Button>
        <Text className="login-avatar-hint">点击选择微信头像</Text>
        <Text className="login-field-label login-nickname-label">微信昵称</Text>
        <Input className="login-nickname-input" type="nickname" value={nickname} placeholder="点击填写昵称" maxlength={40}
          onInput={(event) => setNickname(event.detail.value)} />
        <Text className="login-privacy-note">头像和昵称由你选择，仅用于展示个人资料。</Text>
        <Button className="login-submit" loading={submitting} onClick={() => void submit()}>
          {submitting ? '正在登录…' : profile ? '保存个人资料' : '微信快捷登录'}
        </Button>
        {profile && <Button className="login-relogin" loading={submitting} onClick={() => void reloginAndSync()}>
          重新登录并同步云端旅行
        </Button>}
        {process.env.TARO_APP_DEV_AUTH === 'true' && <View className="login-dev-actions">
          <Text className="login-field-label">本地联调身份</Text>
          <View className="login-dev-row"><Button loading={devSubmitting} onClick={() => void devLogin('A')}>开发用户 A</Button>
            <Button loading={devSubmitting} onClick={() => void devLogin('B')}>开发用户 B</Button></View>
        </View>}
      </View>
    </View>
    <Text className="login-footer">愿每一次出发，都从容而有准备。</Text>
  </View>;
}
