import { useState } from 'react';
import { Button, Input, Picker, Text, View } from '@tarojs/components';
import type { ClientTrip } from '@travel-guide/api-client';
import { tripService } from '../../services/tripService';

const iso = (date: string) => date ? `${date}T00:00:00.000Z` : null;
export function TripCreateSheet({ countryCode, countryName, onCancel, onCreated }: {
  countryCode: string; countryName: string; onCancel(): void; onCreated(trip: ClientTrip): Promise<void>;
}) {
  const [title, setTitle] = useState(`${countryName}旅行`); const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(''); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  const submit = async () => {
    if (!title.trim()) { setError('请输入旅行名称'); return; }
    if (startDate && endDate && startDate > endDate) { setError('返程日期不能早于出发日期'); return; }
    setSubmitting(true); setError('');
    try { const trip = await tripService.create({ title: title.trim(), startDate: iso(startDate), endDate: iso(endDate), countryCode }); await onCreated(trip); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败，请重试'); }
    finally { setSubmitting(false); }
  };
  return <View className="sheet-mask"><View className="trip-sheet"><Text className="sheet-kicker">START A JOURNEY</Text>
    <Text className="sheet-title">先创建一段旅行</Text><Text className="sheet-copy">{countryName}会成为第一目的地，创建后继续刚才的操作。</Text>
    <Text className="field-label">旅行名称</Text><Input className="trip-input" value={title} maxlength={60} onInput={(event) => setTitle(event.detail.value)} />
    <View className="date-grid"><View><Text className="field-label">出发日期</Text><Picker mode="date" value={startDate}
      onChange={(event) => setStartDate(String(event.detail.value))}><View className="trip-input">{startDate || '选择日期'}</View></Picker></View>
      <View><Text className="field-label">返程日期</Text><Picker mode="date" value={endDate}
        onChange={(event) => setEndDate(String(event.detail.value))}><View className="trip-input">{endDate || '选择日期'}</View></Picker></View></View>
    {error && <Text className="form-error">{error}</Text>}<View className="sheet-actions"><Button className="sheet-secondary" onClick={onCancel}>取消</Button>
      <Button className="sheet-primary" loading={submitting} disabled={submitting} onClick={() => { void submit(); }}>创建旅行</Button></View>
  </View></View>;
}
