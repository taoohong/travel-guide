import { create } from 'zustand';
import Taro from '@tarojs/taro';
import type { ClientUserProfile } from '@travel-guide/api-client';

export const ACCOUNT_TOKEN_KEY = 'travel-guide.auth.token';
const ACCOUNT_PROFILE_KEY = 'travel-guide.auth.profile';

function readProfile(): ClientUserProfile | null {
  try {
    const value = Taro.getStorageSync(ACCOUNT_PROFILE_KEY);
    return value && typeof value === 'object' && 'id' in value && 'nickname' in value ? value as ClientUserProfile : null;
  } catch { return null; }
}

function readToken(): string | null {
  try { const value = Taro.getStorageSync(ACCOUNT_TOKEN_KEY); return typeof value === 'string' && value ? value : null; }
  catch { return null; }
}

interface AccountState {
  profile: ClientUserProfile | null;
  setSession(token: string, profile: ClientUserProfile): void;
  updateProfile(profile: ClientUserProfile): void;
  clear(): void;
}

export const useAccountStore = create<AccountState>((set) => ({
  profile: readToken() ? readProfile() : null,
  setSession: (token, profile) => {
    Taro.setStorageSync(ACCOUNT_TOKEN_KEY, token);
    Taro.setStorageSync(ACCOUNT_PROFILE_KEY, profile);
    set({ profile });
  },
  updateProfile: (profile) => {
    Taro.setStorageSync(ACCOUNT_PROFILE_KEY, profile);
    set({ profile });
  },
  clear: () => {
    Taro.removeStorageSync(ACCOUNT_TOKEN_KEY);
    Taro.removeStorageSync(ACCOUNT_PROFILE_KEY);
    set({ profile: null });
  },
}));

export function getStoredAccountToken(): string | null { return readToken(); }
