import { HttpClient, createClientApi } from '@travel-guide/api-client';
import { useAccountStore, getStoredAccountToken } from '../stores/accountStore';
import { TaroHttpAdapter } from './taroHttpAdapter';

export const clientApi = createClientApi(new HttpClient({
  baseUrl: process.env.TARO_APP_API_BASE_URL || '/api/v1',
  tokenProvider: getStoredAccountToken,
  onUnauthorized: () => useAccountStore.getState().clear(),
  adapter: new TaroHttpAdapter(), timeoutMs: 10_000,
}));
export type ClientApi = typeof clientApi;
