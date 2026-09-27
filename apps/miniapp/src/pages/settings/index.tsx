import { useEffect } from 'react';
import Taro from '@tarojs/taro';
import { Picker, Switch, Text, View } from '@tarojs/components';
import { preferenceService } from '../../services/preferenceService';
import { useUserStore, type UserPreferences } from '../../stores/userStore';
import './index.scss';

const regions = [{ code: 'CN', name: '中国大陆' }, { code: 'SG', name: '新加坡' }];
async function save(patch: Partial<UserPreferences>) {
  try { await preferenceService.update(patch); }
  catch { await Taro.showToast({ title: '设置保存失败，请重试', icon: 'none' }); }
}
export default function Settings() {
  const { passportRegion, showPlanAddGuide, hydrated } = useUserStore();
  useEffect(() => { if (!useUserStore.getState().hydrated) void preferenceService.hydrate(); }, []);
  return <View className="settings-page"><Text className="tab-eyebrow">PREFERENCES</Text><Text className="tab-title">基础设置</Text>
    <Text className="tab-lead">签证信息按护照所属地区匹配，请选择与你实际持有的护照一致的地区。</Text>
    {hydrated && <><Picker mode="selector" range={regions.map((item) => item.name)}
      value={Math.max(0, regions.findIndex((item) => item.code === passportRegion))}
      onChange={(event) => { const option = regions[Number(event.detail.value)]; if (option) void save({ passportRegion: option.code }); }}>
      <View className="setting-row"><Text>护照所属国家 / 地区</Text><Text>{regions.find((item) => item.code === passportRegion)?.name ?? passportRegion} ›</Text></View>
    </Picker><View className="setting-row"><View><Text>国家攻略加入计划提示</Text>
      <Text className="setting-hint">关闭后不再自动显示；可以随时重新开启。</Text></View>
      <Switch checked={showPlanAddGuide} color="#2868D9" onChange={(event) => { void save({ showPlanAddGuide: event.detail.value }); }} />
    </View></>}
  </View>;
}
