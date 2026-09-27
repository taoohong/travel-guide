import { useEffect, useMemo, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Input, ScrollView, Text, View } from '@tarojs/components';
import type { ClientTrip, ClientTripExpense, TripExpenseInput } from '@travel-guide/api-client';
import { clientApi } from '../../api/client';
import { useAccountStore } from '../../stores/accountStore';

const categories = [
  { name: '交通', icon: '🚆' }, { name: '住宿', icon: '🏠' }, { name: '美食', icon: '🍜' }, { name: '景点', icon: '🎟️' },
  { name: '购物', icon: '🛍️' }, { name: '活动', icon: '🎡' }, { name: '其他', icon: '✦' }, { name: '通讯', icon: '📶' },
];
const money = (cents: number) => (cents / 100).toFixed(2);
const toCents = (amount: string) => Math.round((Number(amount) || 0) * 100);
const calculate = (left: number, right: number, operator: '+' | '-') => Math.round((operator === '+' ? left + right : left - right) * 100) / 100;

function balances(expenses: ClientTripExpense[], members: NonNullable<ClientTrip['members']>) {
  const result = new Map(members.map((member) => [member.userId, 0]));
  for (const expense of expenses) {
    const participants = expense.participantUserIds.filter((userId) => result.has(userId));
    result.set(expense.payerUserId, (result.get(expense.payerUserId) ?? 0) + expense.amountCents);
    if (!participants.length) continue;
    const share = Math.floor(expense.amountCents / participants.length);
    const remainder = expense.amountCents % participants.length;
    participants.forEach((userId, index) => result.set(userId, result.get(userId)! - share - (index < remainder ? 1 : 0)));
  }
  return result;
}

export function TripExpenseContent({ trip }: { trip: ClientTrip }) {
  const profile = useAccountStore((state) => state.profile);
  const members = trip.members ?? [];
  const defaultPayer = members.find((member) => member.userId === profile?.id)?.userId ?? members[0]?.userId ?? '';
  const [expenses, setExpenses] = useState<ClientTripExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState('交通');
  const [payerId, setPayerId] = useState(defaultPayer);
  const [participantIds, setParticipantIds] = useState<string[]>(members.map((member) => member.userId));
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('0');
  const [operand, setOperand] = useState<number | null>(null);
  const [operator, setOperator] = useState<'+' | '-' | null>(null);
  const [replaceAmount, setReplaceAmount] = useState(false);
  const [error, setError] = useState('');

  const loadExpenses = async () => {
    setLoading(true); setError('');
    try { setExpenses(await clientApi.tripExpenses(trip.id)); }
    catch { setError('账单加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    setPayerId(defaultPayer); setParticipantIds(members.map((member) => member.userId));
    void loadExpenses();
  }, [trip.id]);

  const total = useMemo(() => expenses.reduce((sum, item) => sum + item.amountCents, 0), [expenses]);
  const memberBalances = useMemo(() => balances(expenses, members), [expenses, members]);
  const perPerson = participantIds.length ? Math.round(toCents(amount) / participantIds.length) : 0;
  const amountLabel = amount;

  const pressKey = (key: string) => {
    if (/^\d$/.test(key)) {
      const next = replaceAmount ? key : amount === '0' ? key : `${amount}${key}`;
      const decimal = next.split('.')[1];
      if (decimal && decimal.length > 2) return;
      setAmount(next); setReplaceAmount(false); return;
    }
    if (key === '.') { setAmount((value) => replaceAmount ? '0.' : value.includes('.') ? value : `${value}.`); setReplaceAmount(false); return; }
    if (key === '⌫') { setAmount((value) => replaceAmount ? '0' : value.length > 1 ? value.slice(0, -1) : '0'); setReplaceAmount(false); return; }
    if (key === '+' || key === '−') {
      const nextOperator = key === '+' ? '+' : '-';
      const left = operand !== null && operator && !replaceAmount ? calculate(operand, Number(amount), operator) : Number(amount);
      setOperand(left); setOperator(nextOperator); setAmount(String(left)); setReplaceAmount(true); return;
    }
    if (key === '=' && operand !== null && operator) {
      setAmount(String(Math.max(0, calculate(operand, Number(amount), operator)))); setOperand(null); setOperator(null); setReplaceAmount(true);
    }
  };

  const save = async () => {
    const amountCents = toCents(amount);
    if (!amountCents) { await Taro.showToast({ title: '请输入金额', icon: 'none' }); return; }
    if (!participantIds.length || !payerId) { await Taro.showToast({ title: '请选择付款人和分摊成员', icon: 'none' }); return; }
    const input: TripExpenseInput = { category, amountCents, payerUserId: payerId, participantUserIds: participantIds, note: note.trim() || null };
    setSaving(true);
    try {
      const added = await clientApi.createTripExpense(trip.id, input);
      setExpenses((items) => [added, ...items]); setAmount('0'); setNote(''); setOperand(null); setOperator(null); setReplaceAmount(false);
      await Taro.showToast({ title: '账单已记下', icon: 'success' });
    } catch { await Taro.showToast({ title: '保存失败，请重试', icon: 'none' }); }
    finally { setSaving(false); }
  };

  const remove = async (expense: ClientTripExpense) => {
    const result = await Taro.showModal({ title: '删除账单', content: `删除这笔 ¥${money(expense.amountCents)} 的${expense.category}支出？` });
    if (!result.confirm) return;
    try { await clientApi.removeTripExpense(trip.id, expense.id); setExpenses((items) => items.filter((item) => item.id !== expense.id)); }
    catch { await Taro.showToast({ title: '删除失败，请重试', icon: 'none' }); }
  };

  const toggleParticipant = (userId: string) => setParticipantIds((ids) => ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]);
  const keys = ['1', '2', '3', '⌫', '4', '5', '6', '+', '7', '8', '9', '−', '.', '0', '=', '保存'];

  return <ScrollView scrollY enhanced showScrollbar={false} className="expense-scroll">
    <View className="expense-entry-card">
      <Text className="expense-section-title">这笔花在</Text>
      <View className="expense-categories">{categories.map((item) => <View key={item.name} role="button" aria-label={`选择${item.name}`}
        className={`expense-category ${category === item.name ? 'is-selected' : ''}`} onClick={() => setCategory(item.name)}>
        <Text className="expense-category-icon">{item.icon}</Text><Text>{item.name}</Text></View>)}</View>

      <View className="expense-people-block"><Text className="expense-field-label">付款人</Text>
        <ScrollView scrollX className="expense-people-scroll"><View className="expense-people-row">
          {members.map((member) => <View key={member.userId} className={`expense-person ${payerId === member.userId ? 'is-selected' : ''}`}
            onClick={() => setPayerId(member.userId)} role="button"><Text className="expense-avatar">{member.nickname.slice(0, 1)}</Text><Text>{member.nickname}</Text></View>)}</View></ScrollView>
      </View>
      <View className="expense-people-block expense-split-block"><View className="expense-label-line"><Text className="expense-field-label">参与分摊</Text>
        <Text className="expense-field-hint">{participantIds.length} 人 · 每人 ¥{money(perPerson)}</Text></View>
        <ScrollView scrollX className="expense-people-scroll"><View className="expense-people-row">
          {members.map((member) => <View key={member.userId} className={`expense-person ${participantIds.includes(member.userId) ? 'is-included' : ''}`}
            onClick={() => toggleParticipant(member.userId)} role="checkbox" aria-checked={participantIds.includes(member.userId)}>
            <Text className="expense-check">{participantIds.includes(member.userId) ? '✓' : '+'}</Text><Text>{member.nickname}</Text></View>)}</View></ScrollView>
      </View>
      <Input className="expense-note" value={note} maxlength={100} placeholder="备注一下这笔支出…" onInput={(event) => setNote(event.detail.value)} />
      <View className="expense-amount-panel"><Text className="expense-amount-label">总金额 · CNY</Text>
        <Text className="expense-amount-value"><Text>¥</Text>{amountLabel}</Text>
        {operator && <Text className="expense-operation-hint">{operand?.toFixed(2)} {operator === '+' ? '+' : '−'}</Text>}</View>
      <View className="expense-keypad">{keys.map((key) => <Button key={key} className={`expense-key ${key === '保存' ? 'is-save' : ['+', '−', '='].includes(key) ? 'is-operator' : ''}`}
        loading={key === '保存' && saving} disabled={key === '保存' && saving} onClick={() => key === '保存' ? void save() : pressKey(key)}>{key}</Button>)}</View>
    </View>

    <View className="expense-total-card"><View className="expense-total-copy"><Text>旅程总支出</Text><Text className="expense-total-value">¥{money(total)}</Text></View>
      <View className="expense-total-icon">¥</View></View>
    <View className="expense-balance-card"><View className="expense-list-heading"><Text>AA 结算</Text><Text>{expenses.length} 笔账单</Text></View>
      {members.map((member) => { const balance = memberBalances.get(member.userId) ?? 0; return <View className="expense-balance-row" key={member.userId}>
        <View className="expense-avatar">{member.nickname.slice(0, 1)}</View><Text className="expense-balance-name">{member.nickname}{member.userId === profile?.id ? '（我）' : ''}</Text>
        <Text className={`expense-balance-amount ${balance > 0 ? 'is-credit' : balance < 0 ? 'is-debt' : ''}`}>
          {balance > 0 ? `应收 ¥${money(balance)}` : balance < 0 ? `应付 ¥${money(-balance)}` : '已结清'}</Text></View>; })}
    </View>

    <View className="expense-list-heading expense-record-heading"><Text>最近账单</Text><Text>{loading ? '加载中…' : `${expenses.length} 笔`}</Text></View>
    {error && <Button className="expense-error" onClick={() => void loadExpenses()}>{error}，点此重试</Button>}
    {!loading && !expenses.length && <View className="expense-empty"><Text className="expense-empty-icon">↗</Text><Text>还没有账单</Text><Text>记下第一笔旅行支出吧</Text></View>}
    {expenses.map((expense) => {
      const icon = categories.find((item) => item.name === expense.category)?.icon ?? '✦';
      const canRemove = expense.payerUserId === profile?.id || trip.memberRole === 'OWNER';
      return <View className="expense-record" key={expense.id}><View className="expense-record-icon">{icon}</View>
        <View className="expense-record-copy"><Text className="expense-record-title">{expense.category}</Text>
          <Text className="expense-record-meta">{expense.payerNickname} 付款 · {expense.participantUserIds.length} 人分摊 · {expense.createdAt.slice(5, 16).replace('T', ' ')}</Text>
          {expense.note && <Text className="expense-record-note">{expense.note}</Text>}</View>
        <View className="expense-record-side"><Text className="expense-record-amount">¥{money(expense.amountCents)}</Text>
          {canRemove && <Text className="expense-record-delete" onClick={() => void remove(expense)}>删除</Text>}</View></View>;
    })}
  </ScrollView>;
}
