import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { ScrollView, View } from '@tarojs/components';
import { FloatingTabBar } from '../../components/FloatingTabBar';
import { TravelTabContent } from '../../features/travel/TravelTabContent';
import { PlanTabContent } from '../../features/plan/PlanTabContent';
import { ProfileTabContent } from '../../features/profile/ProfileTabContent';
import { preferenceService } from '../../services/preferenceService';
import { contentVersionService } from '../../services/versionSync';
import { useContentVersionStore } from '../../stores/contentVersionStore';
import { mainTabs, type MainTabKey } from './shell';
import { openGlobePage } from '../../utils/openGlobePage';
import './index.scss';

export default function Dashboard() {
  const requestedTab = String(useRouter().params.tab ?? '');
  const [activeTab, setActiveTab] = useState<MainTabKey>(requestedTab === 'plan' || requestedTab === 'profile' ? requestedTab : 'travel');
  const [navigation, setNavigation] = useState({ contentTop: 55, titleTop: 24 });
  useEffect(() => {
    try {
      const menu = Taro.getMenuButtonBoundingClientRect();
      if (menu.bottom > 0) setNavigation({ contentTop: menu.bottom + 12, titleTop: menu.top + menu.height / 2 });
    } catch {
      // Keep the fallback spacing in browser previews without the WeChat menu API.
    }
  }, []);
  useEffect(() => {
    void preferenceService.hydrate();
    useContentVersionStore.getState().setSyncing(true);
    void contentVersionService.sync();
  }, []);
  useEffect(() => {
    const firstOpenKey = 'globe-picker-first-opened';
    try {
      if (Taro.getStorageSync(firstOpenKey)) return;
      Taro.setStorageSync(firstOpenKey, true);
      void openGlobePage();
    } catch {
      // Keep the dashboard available if local storage is unavailable.
    }
  }, []);
  return <View className="dashboard-shell" style={{ paddingTop: `${navigation.contentTop}px` }}>
    <View className="dashboard-nav-title" style={{ top: `${navigation.titleTop}px` }}>出国旅行宝典</View>
    <View className="tab-viewport"><View className="tab-stage">
      {mainTabs.map((tab) => <View key={tab} className={`tab-pane ${activeTab === tab ? 'is-active' : 'is-inactive'}`}><ScrollView scrollY={tab !== 'plan'} className="tab-scroll">
      {tab === 'travel' ? <TravelTabContent active={activeTab === 'travel'} /> : tab === 'plan' ? <PlanTabContent active={activeTab === 'plan'}
        onStartTrip={() => { void openGlobePage(); }} onAddDestination={() => {
            void openGlobePage();
        }} /> :
          <ProfileTabContent active={activeTab === 'profile'} />}
      </ScrollView></View>)}
    </View></View>
    <FloatingTabBar activeTab={activeTab} onChange={setActiveTab} />
  </View>;
}
