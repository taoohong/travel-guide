import Taro from '@tarojs/taro';
import { ApiError, type HttpAdapter } from '@travel-guide/api-client';

type TaroRequest = Pick<typeof Taro, 'request'>;
export class TaroHttpAdapter implements HttpAdapter {
  constructor(private readonly taro: TaroRequest = Taro) {}
  async request(input: Parameters<HttpAdapter['request']>[0]): ReturnType<HttpAdapter['request']> {
    try {
      const response = await this.taro.request({ url: input.url, method: input.method,
        header: input.headers, data: input.body, timeout: input.timeoutMs });
      const data: unknown = typeof response.data === 'string' ? JSON.parse(response.data) as unknown : response.data;
      return { status: response.statusCode, data, headers: response.header };
    } catch (error) {
      if (error instanceof SyntaxError) throw new ApiError('PARSE', 'INVALID_RESPONSE', '服务响应格式不正确');
      const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'errMsg' in error ?
        String(error.errMsg) : String(error);
      if (/not in\s*domain|合法域名/i.test(message)) throw new ApiError('NETWORK', 'DOMAIN_NOT_ALLOWED',
        '请求地址被微信域名校验拦截，请检查小程序开发设置');
      if (/timeout|超时/i.test(message)) throw new ApiError('TIMEOUT', 'REQUEST_TIMEOUT', '请求超时，请重试');
      throw new ApiError('NETWORK', 'NETWORK', '网络连接失败，请检查连接');
    }
  }
}
