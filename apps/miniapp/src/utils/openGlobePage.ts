import Taro from '@tarojs/taro';

export async function openGlobePage(): Promise<boolean> {
  try {
    await Taro.navigateTo({ url: '/pages/globe/index' });
    return true;
  } catch (error) {
    console.error('[globe-navigation] failed to open Globe page', error);
    void Taro.showToast({ title: '地球页暂时无法打开，请重试', icon: 'none' });
    return false;
  }
}
