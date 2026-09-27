export const mainTabs = ['travel', 'plan', 'profile'] as const;
export type MainTabKey = typeof mainTabs[number];
export function activeIndex(tab: MainTabKey): number { return mainTabs.indexOf(tab); }
export function tabTransform(tab: MainTabKey): string { return `translate3d(-${activeIndex(tab) * 100}vw, 0, 0)`; }
