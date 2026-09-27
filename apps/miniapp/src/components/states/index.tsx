import { Button, Text, View } from '@tarojs/components';
import './index.scss';

export function LoadingState({ label = '正在加载内容…' }: { label?: string }) {
  return <View className="state-card"><Text className="state-mark">◌</Text><Text>{label}</Text></View>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View className="state-card"><Text className="state-mark">!</Text><Text>{message}</Text>
    {onRetry && <Button className="state-action" onClick={onRetry}>重试</Button>}</View>;
}
export function EmptyState({ message, action, onAction }: { message: string; action?: string; onAction?: () => void }) {
  return <View className="state-card"><Text className="state-mark">·</Text><Text>{message}</Text>
    {action && onAction && <Button className="state-action" onClick={onAction}>{action}</Button>}</View>;
}
export function OfflineNotice() { return <View className="offline-notice">当前显示离线内容，联网后会自动更新</View>; }
