import { ApiError, HttpClient, createAdminApi } from '@travel-guide/api-client';

const tokenKey = 'travel-guide-admin-token';
export const tokenStore = {
  get: () => sessionStorage.getItem(tokenKey),
  set: (token: string) => sessionStorage.setItem(tokenKey, token),
  clear: () => sessionStorage.removeItem(tokenKey),
};

const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const api = createAdminApi(new HttpClient({ baseUrl, tokenProvider: tokenStore.get,
  onUnauthorized: () => { tokenStore.clear(); window.dispatchEvent(new Event('admin-unauthorized')); } }));

export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return '系统暂时不可用，请稍后重试';
  const messages: Record<string, string> = {
    NETWORK: '网络连接失败，请检查网络后重试', REQUEST_TIMEOUT: '请求超时，请重试',
    FILE_TOO_LARGE: '图片超过 5 MB，请选择更小的文件', FILE_TYPE_UNSUPPORTED: '仅支持 JPG、PNG、WebP 图片',
    IMAGE_PROCESS_FAILED: '图片处理失败，请换一张图片重试', DUPLICATE_CONTENT: '内容已存在，请检查是否重复',
    CONFLICT: '当前操作与已有内容冲突', INTERNAL_ERROR: '系统暂时不可用，请稍后重试',
    FORBIDDEN: '无权限执行此操作', UNAUTHORIZED: '登录已失效，请重新登录',
  };
  return `${messages[error.code] ?? error.message}${error.requestId ? `（请求编号：${error.requestId}）` : ''}`;
}
