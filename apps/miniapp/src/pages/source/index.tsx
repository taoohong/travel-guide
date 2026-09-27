import { Text, View, WebView } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import './index.scss';

export default function OfficialSource() {
  const rawUrl = String(useRouter().params.url ?? '');
  const url = rawUrl.startsWith('https://') ? rawUrl : '';
  return url ? <WebView src={url} /> : <View className="source-error"><Text>官方来源链接无效</Text></View>;
}
