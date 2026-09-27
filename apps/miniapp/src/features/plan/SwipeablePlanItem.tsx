import { useRef } from 'react';
import { Button, Image, Text, View } from '@tarojs/components';
import type { PlanItem } from '@travel-guide/types';

const itemVisuals = {
  VISA_MATERIAL: { label: '签证', symbol: '✈', className: 'is-visa' },
  PACKING_ITEM: { label: '准备', symbol: '▧', className: 'is-preparation' },
  ATTRACTION: { label: '景点', symbol: '⌖', className: 'is-attraction' },
} as const;
type TouchPoint = { pageX?: number; pageY?: number; clientX?: number; clientY?: number; x?: number; y?: number };
const position = (touch?: TouchPoint) => touch && {
  x: touch.pageX ?? touch.clientX ?? touch.x ?? 0,
  y: touch.pageY ?? touch.clientY ?? touch.y ?? 0,
};

export function SwipeablePlanItem({ item, selected, open, onOpen, onClose, onToggle, onEdit, onRemove }: {
  item: PlanItem; selected: boolean; open: boolean; onOpen(): void; onClose(): void;
  onToggle(): void; onEdit(): void; onRemove(): void;
}) {
  const start = useRef<{ x: number; y: number }>();
  const suppressClick = useRef(false);
  return <View className={`swipe-row ${open ? 'is-open' : ''} ${selected ? 'is-selected' : ''}`}
    onTouchStart={(event) => { const touch = position((event as unknown as { touches: TouchPoint[] }).touches[0]);
      if (touch) start.current = touch; }}
    onTouchEnd={(event) => { const touch = position((event as unknown as { changedTouches: TouchPoint[] }).changedTouches[0]);
      const point = start.current; start.current = undefined;
      if (!touch || !point) return; const dx = touch.x - point.x; const dy = touch.y - point.y;
      if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 350);
      if (dx < 0) onOpen(); else onClose(); }}>
    <View className="swipe-actions"><Button className="swipe-delete" onClick={(event) => { event.stopPropagation(); onRemove(); }}>删除</Button></View>
    <View className="swipe-face" onClick={(event) => { event.stopPropagation();
      if (suppressClick.current) { suppressClick.current = false; return; } onEdit(); }}>
      <View className="plan-item-main">
        <View className={`plan-item-picture ${item.imageUrl ? 'has-image' : itemVisuals[item.itemType].className}`}>
          {item.imageUrl ? <Image className="plan-item-image" src={item.imageUrl} mode="aspectFill" lazyLoad /> :
            <><Text className="plan-item-symbol">{itemVisuals[item.itemType].symbol}</Text>
              <Text className="plan-item-image-label">{itemVisuals[item.itemType].label}</Text></>}
        </View>
        <View className="plan-item-copy">
          <View className="plan-item-title-row"><Text className={item.done ? 'plan-item-title is-done' : 'plan-item-title'}>{item.title}</Text>
            <Button className={`done-button ${item.done ? 'is-done' : ''}`} aria-label={item.done ? '标记为未完成' : '标记为已完成'}
              onClick={(event) => { event.stopPropagation(); onToggle(); }}>{item.done ? '✓' : ''}</Button></View>
          <Text className="plan-item-meta">计划完成时间：{item.planDate ? item.planDate.slice(0, 16).replace('T', ' ') : '待定'} · {item.sourceCountryCode ?? '整段旅行'}</Text>
          <Text className="plan-item-progress">同行已完成 {item.completionCount ?? (item.done ? 1 : 0)}/{item.memberCount ?? 1} 人</Text>
        </View>
      </View>
    </View>
  </View>;
}
