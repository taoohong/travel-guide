import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Input, Picker, Switch, Text, Textarea, View } from '@tarojs/components';
import { ErrorState, LoadingState } from '../../components/states';
import { planService } from '../../services/planService';
import { tripService } from '../../services/tripService';
import { usePlanStore } from '../../stores/planStore';
import './index.scss';

const localParts = (iso: string | null) => {
  if (!iso) return { date: '', time: '' };
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? { date: '', time: '' } :
    { date: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`,
      time: `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}` };
};
export default function PlanItemEdit() {
  const id = String(useRouter().params.planItemId ?? '');
  const item = usePlanStore((state) => state.items.find((entry) => entry.id === id));
  const [loading, setLoading] = useState(!item); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [date, setDate] = useState(''); const [time, setTime] = useState(''); const [done, setDone] = useState(false);
  useEffect(() => { if (!item) return; setTitle(item.title); setDescription(item.description ?? '');
    const parts = localParts(item.planDate); setDate(parts.date); setTime(parts.time); setDone(item.done); }, [item?.id]);
  useEffect(() => { if (item) return; void tripService.refresh().then((trip) => trip && planService.refresh(trip.id))
    .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '计划加载失败')).finally(() => setLoading(false)); }, [id]);
  const save = async () => {
    if (!item || saving) return;
    if (!title.trim()) { setError('请输入事项标题'); return; }
    setError(''); setSaving(true);
    try { await planService.update(item.tripId, item.id, { title: title.trim(), description: description.trim() || null,
      planDate: date ? new Date(`${date}T${time || '00:00'}:00`).toISOString() : null,
      done, doneAt: done ? item.doneAt ?? new Date().toISOString() : null });
      await Taro.navigateBack(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!item || saving) return;
    const answer = await Taro.showModal({ title: '删除计划事项', content: `确定删除“${item.title}”吗？`, confirmColor: '#C0392B' });
    if (!answer.confirm) return;
    setSaving(true);
    try { await planService.remove(item.tripId, item.id); await Taro.navigateBack(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '删除失败，请重试'); setSaving(false); }
  };
  if (loading) return <View className="plan-edit-page"><LoadingState /></View>;
  if (!item) return <View className="plan-edit-page"><ErrorState message={error || '计划事项不存在'} onRetry={() => { void Taro.navigateBack(); }} /></View>;
  return <View className="plan-edit-page"><Text className="edit-eyebrow">EDIT YOUR PLAN</Text><Text className="edit-title">把旅程安排好</Text>
    <Text className="edit-lead">修改后会同步到这段旅行的计划。</Text>
    <Text className="edit-label">事项名称</Text><Input className="edit-input" value={title} maxlength={120} onInput={(event) => setTitle(event.detail.value)} />
    <Text className="edit-label">计划日期与时间</Text><View className="edit-date-row">
      <Picker mode="date" value={date} onChange={(event) => setDate(String(event.detail.value))}><View className="edit-input">{date || '选择日期'}</View></Picker>
      <Picker mode="time" value={time} onChange={(event) => setTime(String(event.detail.value))}><View className="edit-input">{time || '选择时间'}</View></Picker></View>
    {date && <Button className="edit-clear-date" onClick={() => { setDate(''); setTime(''); }}>清除日期</Button>}
    <Text className="edit-label">备注</Text><Textarea className="edit-notes" value={description} maxlength={5000} placeholder="记下需要留意的事" onInput={(event) => setDescription(event.detail.value)} />
    <View className="edit-status"><View><Text>已完成</Text><Text className="edit-hint">只记录你的进度，同行分别记录</Text></View>
      <Switch checked={done} color="#137A42" onChange={(event) => setDone(event.detail.value)} /></View>
    <View className="edit-type"><Text>类型</Text><Text>{item.itemType} · 由内容来源决定</Text></View>
    {error && <Text className="form-error">{error}</Text>}
    <Button className="edit-save" loading={saving} disabled={saving} onClick={() => { void save(); }}>保存修改</Button>
    <Button className="edit-delete" disabled={saving} onClick={() => { void remove(); }}>删除事项</Button>
  </View>;
}
