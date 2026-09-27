import Taro from '@tarojs/taro';

export interface NativeMenuButtonLayout {
  top: number;
  height: number;
  headerInset: number;
}

export function getNativeMenuButtonLayout(): NativeMenuButtonLayout {
  try {
    const menu = Taro.getMenuButtonBoundingClientRect();
    const width = Taro.getSystemInfoSync().windowWidth;
    if (menu.top > 0 && menu.height > 0 && menu.bottom > 0 && width > 0) {
      return { top: menu.top, height: menu.height, headerInset: Math.ceil((menu.bottom + 12) * 750 / width) };
    }
  } catch {
    // Use a safe-area fallback in browser previews without the WeChat menu API.
  }
  return { top: 8, height: 32, headerInset: 130 };
}
