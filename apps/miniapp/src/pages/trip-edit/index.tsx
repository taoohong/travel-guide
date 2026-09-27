import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Input, Picker, Text, Textarea, View } from '@tarojs/components';
import type { ClientTrip } from '@travel-guide/api-client';
import { ErrorState, LoadingState } from '../../components/states';
import { tripService } from '../../services/tripService';
import './index.scss';

const dateOnly = (value: string | null) => value?.slice(0, 10) ?? '';
const toIsoDate = (value: string) => value ? `${value}T00:00:00.000Z` : null;

export default function TripEditPage() {
  const params = useRouter().params;
  const tripId = String(params.tripId ?? '');
  const creating = String(params.mode ?? '') === 'create';
  const [trip, setTrip] = useState<ClientTrip | null>(null);
  const [title, setTitle] = useState(''); const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(!creating); const [saving, setSaving] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    if (creating) { setLoading(false); return; }
    if (!tripId) { setError('旅行编号无效'); setLoading(false); return; }
    void tripService.get(tripId).then((value) => {
      setTrip(value); setTitle(value.title); setStartDate(dateOnly(value.startDate)); setEndDate(dateOnly(value.endDate));
      setNotes(value.notes ?? '');
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '旅行加载失败')).finally(() => setLoading(false));
  }, [creating, tripId]);

  const save = async () => {
    if (saving || (!creating && !trip)) return;
    if (!title.trim()) { setError('请输入旅行名称'); return; }
    if (startDate && endDate && startDate > endDate) { setError('返程日期不能早于出发日期'); return; }
    setError(''); setSaving(true);
    try {
      if (creating) {
        await tripService.create({ title: title.trim(), startDate: toIsoDate(startDate), endDate: toIsoDate(endDate),
          notes: notes.trim() || null });
        await Taro.showToast({ title: '旅程已创建', icon: 'success' });
      } else {
        await tripService.update(trip!.id, { title: title.trim(), startDate: toIsoDate(startDate), endDate: toIsoDate(endDate),
          notes: notes.trim() || null });
        await Taro.showToast({ title: '旅行信息已保存', icon: 'success' });
      }
      await Taro.navigateBack();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试'); }
    finally { setSaving(false); }
  };

  if (loading) return <View className="trip-edit-page"><LoadingState label="正在加载旅行信息…" /></View>;
  if (!creating && !trip) return <View className="trip-edit-page"><ErrorState message={error || '旅行不存在'} onRetry={() => { void Taro.navigateBack(); }} /></View>;
  return <View className="trip-edit-page">
    <Text className="trip-edit-eyebrow">{creating ? 'PLAN A NEW TRIP' : 'EDIT YOUR TRIP'}</Text>
    <Text className="trip-edit-title">{creating ? '新建旅程' : '编辑旅行'}</Text>
    <Text className="trip-edit-lead">{creating ? '填写旅行名称、时间和备注。' : '修改旅行名称、时间和备注。'}</Text>
    <Text className="trip-edit-label">旅行名称</Text>
    <Input className="trip-edit-input" value={title} maxlength={60} placeholder="例如：日本旅行" onInput={(event) => setTitle(event.detail.value)} />
    <Text className="trip-edit-label">旅行时间</Text><View className="trip-edit-date-row">
      <View><Text className="trip-edit-caption">出发日期</Text><Picker mode="date" value={startDate} onChange={(event) => setStartDate(String(event.detail.value))}>
        <View className="trip-edit-input">{startDate || '选择日期'}</View></Picker>{startDate && <Text className="trip-edit-clear" onClick={() => setStartDate('')}>清除</Text>}</View>
      <View><Text className="trip-edit-caption">返程日期</Text><Picker mode="date" value={endDate} onChange={(event) => setEndDate(String(event.detail.value))}>
        <View className="trip-edit-input">{endDate || '选择日期'}</View></Picker>{endDate && <Text className="trip-edit-clear" onClick={() => setEndDate('')}>清除</Text>}</View>
    </View>
    <Text className="trip-edit-label">备注</Text>
    <Textarea className="trip-edit-textarea" value={notes} maxlength={5000} placeholder="记录这段旅行的其他安排" onInput={(event) => setNotes(event.detail.value)} />
    {error && <Text className="trip-edit-error">{error}</Text>}
    <Button className="trip-edit-save" loading={saving} disabled={saving} onClick={() => { void save(); }}>{creating ? '创建旅程' : '保存修改'}</Button>
  </View>;
}
