/* global process, fetch, console */
const base = process.env.API_BASE_URL || 'http://127.0.0.1:3100/api/v1';
const call = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  const envelope = await response.json();
  if (!response.ok || !envelope.success) throw new Error(`${path}: ${envelope.code || response.status} ${envelope.message || ''}`);
  return envelope.data;
};
const post = (body) => ({ method: 'POST', body: JSON.stringify(body) });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const stamp = Date.now();
const visaCN = await call('/visa/CN/JP'); const visaSG = await call('/visa/SG/JP');
assert(visaCN.policy?.visaType === 'VISA_REQUIRED', 'CN → JP 应为需要签证');
assert(visaSG.policy?.visaType === 'VISA_FREE', 'SG → JP 应与 CN → JP 不同');

const cross = await call('/trips', post({ userId: 'seed-user', title: `D 跨洲联调 ${stamp}` }));
await call(`/trips/${cross.id}/destinations`, post({ countryCode: 'JP' }));
await call(`/trips/${cross.id}/destinations`, post({ countryCode: 'FR' }));
const crossSaved = await call(`/trips/${cross.id}`);
assert(crossSaved.destinations.map((item) => item.countryCode).join(',') === 'JP,FR', '日本 + 法国顺序错误');

const trip = await call('/trips', post({ userId: 'seed-user', title: `D 日本韩国回头联调 ${stamp}` }));
for (const countryCode of ['JP', 'KR', 'JP']) await call(`/trips/${trip.id}/destinations`, post({ countryCode }));
const route = await call(`/trips/${trip.id}`);
assert(route.destinations.map((item) => item.countryCode).join(',') === 'JP,KR,JP', '日本 → 韩国 → 日本未保存');
assert(route.destinations.map((item) => item.orderIndex).join(',') === '0,1,2', '目的地 orderIndex 不连续');

const passport = { title: '护照原件', stage: 'PREPARING', itemType: 'VISA_MATERIAL', scope: 'TRIP', sourceType: 'GUIDE',
  sourceId: 'seed-visa-passport-jp', sourceCountryCode: 'JP', dedupeKey: 'passport' };
const parallel = await Promise.all(Array.from({ length: 8 }, () => call(`/trips/${trip.id}/plan-items`, post(passport))));
assert(new Set(parallel.map((result) => result.planItem.id)).size === 1, '八次并发请求未返回同一 PlanItem');
let plan = await call(`/trips/${trip.id}/plan-items`);
assert(plan.filter((item) => item.dedupeHash === 'k:passport').length === 1, '数据库中 passport 不唯一');
await call(`/trips/${trip.id}/plan-items/${plan[0].id}`, { method: 'DELETE' });
const restored = await call(`/trips/${trip.id}/plan-items`, post({ ...passport, sourceCountryCode: 'KR', sourceId: 'kr-passport' }));
assert(restored.planItem.id !== plan[0].id, '删除后重新创建没有生成新记录');
plan = await call(`/trips/${trip.id}/plan-items`); assert(plan.length === 1, '删除恢复后数量应为 1');
await call(`/trips/${trip.id}/stage-confirm`, post({ stage: 'PREPARING' }));
const confirmed = await call(`/trips/${trip.id}`); assert(confirmed.status === 'PREPARING', '用户确认阶段未持久化');

console.log(JSON.stringify({ ok: true, visa: { CN: visaCN.policy.visaType, SG: visaSG.policy.visaType },
  crossContinent: crossSaved.destinations.map((item) => item.countryCode), route: route.destinations.map((item) => item.countryCode),
  concurrentPlanId: parallel[0].planItem.id, restoredPlanId: restored.planItem.id, stage: confirmed.status }, null, 2));
