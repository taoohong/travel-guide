import { Button, Image, Text, View } from '@tarojs/components';
import type { MainTabKey } from '../../pages/dashboard/shell';
import travelIcon from '../../assets/tabbar/travel.svg';
import travelActive from '../../assets/tabbar/travel-active.svg';
import planIcon from '../../assets/tabbar/plan.svg';
import planActive from '../../assets/tabbar/plan-active.svg';
import profileIcon from '../../assets/tabbar/profile.svg';
import profileActive from '../../assets/tabbar/profile-active.svg';
import globeIcon from '../../assets/tabbar/earch-icon.png';
import { openGlobePage } from '../../utils/openGlobePage';
import './index.scss';

const items = [
  { key: 'travel', label: '旅行', icon: travelIcon, activeIcon: travelActive },
  { key: 'plan', label: '计划', icon: planIcon, activeIcon: planActive },
  { key: 'profile', label: '我的', icon: profileIcon, activeIcon: profileActive },
] as const;
export interface FloatingTabBarProps { activeTab: MainTabKey; onChange(tab: MainTabKey): void }
export function FloatingTabBar({ activeTab, onChange }: FloatingTabBarProps) {
  return <View className="floating-tab-dock">
    <View className="floating-tab-bar" role="tablist">{items.map((item) => <View key={item.key}
      className={`floating-tab is-${item.key} ${activeTab === item.key ? 'is-active' : ''}`} role="tab"
      aria-selected={activeTab === item.key} onClick={() => onChange(item.key)}>
      <View className="floating-tab-icon-wrap">
        <Image className="floating-tab-icon" src={activeTab === item.key ? item.activeIcon : item.icon} mode="aspectFit" />
      </View>
      <Text className="floating-tab-label">{item.label}</Text>
    </View>)}</View>
    <Button className="floating-globe-button" hoverClass="floating-globe-button-pressed" hoverStayTime={100}
      aria-label="探索世界，打开地球" onClick={() => { void openGlobePage(); }}>
      <Image className="floating-globe-icon" src={globeIcon} mode="aspectFit" />
    </Button>
  </View>;
}
