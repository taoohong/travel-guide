import Taro from '@tarojs/taro';
import { ApiError, type ClientUserProfile } from '@travel-guide/api-client';
import { clientApi } from '../api/client';
import { ACCOUNT_TOKEN_KEY, useAccountStore } from '../stores/accountStore';
import { usePlanStore } from '../stores/planStore';
import { useTripStore } from '../stores/tripStore';

function saveSession(token: string, profile: ClientUserProfile): void {
  if (useAccountStore.getState().profile?.uid !== profile.uid) {
    useTripStore.getState().show(null, []);
    usePlanStore.getState().clear();
  }
  useAccountStore.getState().setSession(token, profile);
}

export const accountService = {
  async loginDevelopment(identity: 'A' | 'B'): Promise<ClientUserProfile> {
    const result = await clientApi.auth.devLogin(identity);
    saveSession(result.token, result.user);
    return result.user;
  },
  async login(nickname: string): Promise<ClientUserProfile> {
    let stage = 'wx.login';
    try {
      const { code } = await Taro.login();
      if (!code) throw new Error('WX_LOGIN_NO_CODE');
      stage = 'api.wechat-login';
      const result = await clientApi.auth.wechatLogin(code, nickname);
      saveSession(result.token, result.user);
      return result.user;
    } catch (error) {
      console.error('[wechat-login] failed', { stage,
        ...(error instanceof ApiError ? { kind: error.kind, code: error.code, status: error.status,
          requestId: error.requestId } : { name: error instanceof Error ? error.name : 'UnknownError' }),
        message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  async refresh(): Promise<ClientUserProfile> {
    const profile = await clientApi.user.me();
    useAccountStore.getState().updateProfile(profile);
    return profile;
  },

  async updateNickname(nickname: string): Promise<ClientUserProfile> {
    const profile = await clientApi.user.updateMe({ nickname });
    useAccountStore.getState().updateProfile(profile);
    return profile;
  },

  async uploadAvatar(filePath: string): Promise<ClientUserProfile> {
    const token = Taro.getStorageSync(ACCOUNT_TOKEN_KEY);
    if (typeof token !== 'string' || !token) throw new Error('LOGIN_REQUIRED');
    const baseUrl = (process.env.TARO_APP_API_BASE_URL || '/api/v1').replace(/\/$/, '');
    const response = await Taro.uploadFile({ url: `${baseUrl}/users/me/avatar`,
      filePath, name: 'file', header: { Authorization: `Bearer ${token}` } });
    let envelope: { success?: boolean; data?: ClientUserProfile; message?: string };
    try { envelope = (typeof response.data === 'string' ? JSON.parse(response.data) : response.data) as typeof envelope; }
    catch { throw new Error('AVATAR_UPLOAD_FAILED'); }
    if (response.statusCode < 200 || response.statusCode >= 300 || !envelope?.success || !envelope.data)
      throw new Error(envelope?.message || 'AVATAR_UPLOAD_FAILED');
    useAccountStore.getState().updateProfile(envelope.data);
    return envelope.data;
  },
};
