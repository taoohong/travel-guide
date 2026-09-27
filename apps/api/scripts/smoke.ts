import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { readConfig } from '../src/config/env';
import { hashPassword } from '../src/modules/auth/password';

const config = readConfig();
const port = randomInt(32000, 40000);
const base = `http://127.0.0.1:${port}/api/v1`;
const db = new PrismaClient();
let userToken = '';
let userBToken = '';
const server = spawn(process.execPath, ['dist/main.cjs'], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port), STATIC_BASE_URL: `http://127.0.0.1:${port}/static` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverError = '';
server.stderr.on('data', (chunk: Buffer) => { serverError += chunk.toString(); });

async function call(path: string, init: RequestInit = {}): Promise<{ data: Record<string, unknown>; response: Response }> {
  const headers = new Headers(init.headers);
  if (userToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${userToken}`);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const body = await response.json() as { success: boolean; data: Record<string, unknown>; code?: string };
  assert.equal(body.success, true, `${path}: HTTP ${response.status} ${body.code ?? ''}`);
  assert(response.headers.get('x-request-id'));
  return { data: body.data, response };
}
async function expectError(path: string, status: number, code: string, init: RequestInit = {}): Promise<void> {
  const headers = new Headers(init.headers);
  if (userToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${userToken}`);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const body = await response.json() as { success: boolean; code: string; requestId: string };
  assert.equal(response.status, status);
  assert.equal(body.success, false);
  assert.equal(body.code, code);
  assert.equal(body.requestId, response.headers.get('x-request-id'));
}
const json = (data: object, token?: string): RequestInit => ({ method: 'POST', headers: {
  'Content-Type': 'application/json', ...(token || userToken ? { Authorization: `Bearer ${token || userToken}` } : {}) }, body: JSON.stringify(data) });

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`API exited before readiness: ${serverError}`);
    try { const response = await fetch(`${base}/health/live`); if (response.ok) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`API did not start: ${serverError}`);
}

async function main(): Promise<void> {
  await waitForServer();
  const health = (await call('/health')).data;
  assert.equal(health.status, 'ok');
  assert.equal(health.database, 'ok');
  const countries = (await call('/countries?keyword=Japan')).data;
  assert((countries.items as Array<{ code: string }>).some((item) => item.code === 'JP'));
  assert.equal(((await call('/countries/JP/cities')).data as unknown as Array<{ code: string }>)[0]?.code, 'TYO');
  for (const route of ['transport', 'packing', 'tips', 'apps', 'attractions']) {
    const guide = (await call(`/countries/JP/${route}`)).data as unknown as unknown[];
    assert(guide.length > 0, `No ${route} guide content`);
  }
  await expectError('/countries/JPN', 400, 'VALIDATION_FAILED');
  await expectError('/does-not-exist', 404, 'NOT_FOUND');
  await expectError('/admin/content/countries', 401, 'UNAUTHORIZED');
  const cn = (await call('/visa/CN/JP')).data;
  const sg = (await call('/visa/SG/JP')).data;
  assert.equal((cn.policy as { visaType: string }).visaType, 'VISA_REQUIRED');
  assert.equal((sg.policy as { visaType: string }).visaType, 'VISA_FREE');
  assert.equal((await call('/visa/CN/XX')).data.available, false);
  const versionBefore = (await call('/content/version')).data;
  assert.deepEqual((await call('/content/version/diff', json({ local: { ...versionBefore, visa: Number(versionBefore.visa) + 1 } }))).data.changedModules, ['visa']);

  assert(config.DEV_AUTH_ENABLED, 'DEV_AUTH_ENABLED=true is required for local HTTP smoke testing');
  userToken = String((await call('/auth/dev-login', json({ identity: 'A' }))).data.token);
  userBToken = String((await call('/auth/dev-login', json({ identity: 'B' }))).data.token);
  const trip = (await call('/trips', json({ title: `联调 ${randomUUID()}`, notes: '加入前不应泄漏的备注' }))).data;
  const tripId = String(trip.id);
  let assetId: string | undefined;
  let assetPath: string | undefined;
  let testViewerId: string | undefined;
  let testTipId: string | undefined;
  let draftVisaId: string | undefined;
  let draftRequirementId: string | undefined;
  let testCountryCode: string | undefined;
  let testAttractionId: string | undefined;
  const linkIds: Array<{ kind: 'country-packing' | 'country-apps' | 'attraction-images'; id: string }> = [];
  try {
    await expectError(`/trips/${tripId}/stage-confirm`, 409, 'CONFLICT', json({ stage: 'COMPLETED' }));
    assert.equal((await call(`/trips/${tripId}/stage-confirm`, json({ stage: 'PREPARING' }))).data.status, 'PREPARING');
    const first = (await call(`/trips/${tripId}/destinations`, json({ countryCode: 'JP' }))).data;
    const middle = (await call(`/trips/${tripId}/destinations`, json({ countryCode: 'KR' }))).data;
    const last = (await call(`/trips/${tripId}/destinations`, json({ countryCode: 'JP' }))).data;
    assert.deepEqual([first.orderIndex, middle.orderIndex, last.orderIndex], [0, 1, 2]);
    const destinationRows = await db.tripDestination.findMany({ where: { tripId }, orderBy: { orderIndex: 'asc' } });
    assert.deepEqual(destinationRows.map((row) => row.countryCode), ['JP', 'KR', 'JP']);
    const invite = (await call(`/trips/${tripId}/invites`, { method: 'POST' })).data;
    const inviteToken = String(invite.token);
    const preview = (await call(`/trip-invites/${inviteToken}`)).data;
    assert.equal((preview.trip as Record<string, unknown>).notes, undefined);
    assert.equal((preview.trip as Record<string, unknown>).id, undefined);
    const joins = await Promise.all(Array.from({ length: 8 }, () => call(`/trip-invites/${inviteToken}/join`, json({}, userBToken))));
    assert.equal(joins.filter((result) => result.data.alreadyJoined === false).length, 1);
    assert.equal(await db.tripMember.count({ where: { tripId, status: 'ACTIVE' } }), 2);
    assert.equal((await call(`/trips/${tripId}`, { headers: { Authorization: `Bearer ${userBToken}` } })).data.memberRole, 'MEMBER');
    await expectError(`/trips/${tripId}`, 403, 'FORBIDDEN', { ...json({ title: '成员不能改旅行信息' }, userBToken), method: 'PATCH' });
    const memberTripList = (await call('/trips', { headers: { Authorization: `Bearer ${userBToken}` } })).data;
    assert((memberTripList.items as Array<{ id: string }>).some((item) => item.id === tripId));
    const planBody = { title: '护照原件', stage: 'PREPARING', itemType: 'VISA_MATERIAL', scope: 'TRIP',
      sourceType: 'GUIDE', sourceId: 'passport', dedupeKey: 'passport' };
    const responses = await Promise.all(Array.from({ length: 8 }, () => call(`/trips/${tripId}/plan-items`, json(planBody))));
    assert.equal(responses.filter((item) => item.data.created).length, 1);
    const hash = 'k:passport';
    assert.equal(await db.planItem.count({ where: { tripId, dedupeHash: hash } }), 1);
    const planId = String((responses[0]!.data.planItem as { id: string }).id);
    await call(`/trips/${tripId}/plan-items/${planId}`, { method: 'DELETE' });
    assert.equal(await db.planItem.count({ where: { tripId, dedupeHash: hash } }), 0);
    assert.equal((await call(`/trips/${tripId}/plan-items`, json(planBody))).data.created, true);
    assert.equal(await db.planItem.count({ where: { tripId, dedupeHash: hash } }), 1);
    await call(`/trips/${tripId}/plan-items`, json({ title: '浅草寺', stage: 'TRAVELING', itemType: 'ATTRACTION',
      scope: 'COUNTRY', sourceType: 'USER', sourceCountryCode: 'JP' }, userBToken));
    assert(((await call(`/trips/${tripId}/plan-items`)).data as unknown as Array<{ title: string }>).some((item) => item.title === '浅草寺'));
    await call(`/trips/${tripId}/plan-items`, json({ title: '东京塔', stage: 'TRAVELING', itemType: 'ATTRACTION',
      scope: 'COUNTRY', sourceType: 'USER', sourceCountryCode: 'JP' }));
    assert(((await call(`/trips/${tripId}/plan-items`, { headers: { Authorization: `Bearer ${userBToken}` } })).data as unknown as Array<{ title: string }>).some((item) => item.title === '东京塔'));
    await call(`/trips/${tripId}/leave`, json({}, userBToken));
    assert.equal(((await call('/trips', { headers: { Authorization: `Bearer ${userBToken}` } })).data.items as Array<{ id: string }>)
      .some((item) => item.id === tripId), false);
    await call(`/trip-invites/${inviteToken}/join`, json({}, userBToken));
    await call(`/trips/${tripId}/members/${String((await db.user.findFirst({ where: { identities: { some: {
      provider: 'DEVELOPMENT', providerUserId: 'B' } } }, select: { id: true } }))!.id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${userToken}` } });
    await call(`/trips/${tripId}/destinations/${String(middle.id)}`, { method: 'DELETE' });
    assert.deepEqual((await db.tripDestination.findMany({ where: { tripId }, orderBy: { orderIndex: 'asc' } })).map((row) => row.orderIndex), [0, 1]);

    const password = config.DEMO_ADMIN_PASSWORD;
    assert(password, 'DEMO_ADMIN_PASSWORD must be set for smoke testing');
    const login = (await call('/admin/auth/login', json({ username: 'local-admin', password }))).data;
    const token = String(login.token);
    do { testCountryCode = `Z${String.fromCharCode(65 + randomInt(26))}`; }
    while (await db.country.findUnique({ where: { code: testCountryCode } }));
    const createdCountry = (await call('/admin/content/countries', json({ code: testCountryCode, continentCode: 'AS',
      nameZh: '联调国家', nameEn: 'Smoke Country', latitude: 12, longitude: 34, online: true }, token))).data;
    assert.equal(createdCountry.status, 'DRAFT');
    const countryVersionBefore = Number((await call('/content/version')).data.country);
    await call(`/admin/content/countries/${testCountryCode}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(Number((await call('/content/version')).data.country), countryVersionBefore + 1);
    assert.equal((await call(`/countries/${testCountryCode}`)).data.name, '联调国家');
    await call(`/admin/content/countries/${testCountryCode}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json' }, body: JSON.stringify({ nameZh: '联调国家草稿' }) });
    assert.equal((await call(`/countries/${testCountryCode}`)).data.name, '联调国家');
    assert.equal(Number((await call('/content/version')).data.country), countryVersionBefore + 1);
    await call(`/admin/content/countries/${testCountryCode}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await call(`/countries/${testCountryCode}`)).data.name, '联调国家草稿');
    await expectError('/admin/auth/login', 401, 'UNAUTHORIZED', json({ username: 'local-admin', password: 'wrong-password' }));
    const viewer = await db.adminUser.create({ data: { username: `smoke-viewer-${randomUUID()}`,
      passwordHash: await hashPassword('viewer-test-password'), role: 'VIEWER' } });
    testViewerId = viewer.id;
    const viewerLogin = (await call('/admin/auth/login', json({ username: viewer.username, password: 'viewer-test-password' }))).data;
    await expectError('/admin/content/countries', 403, 'FORBIDDEN', json({ code: 'XX', nameZh: '示例', nameEn: 'Sample' }, String(viewerLogin.token)));
    const tipVersion = Number((await call('/content/version')).data.travelTip);
    const createdTip = (await call('/admin/content/tips', json({ countryCode: 'JP', title: '联调贴士',
      content: '用于管理接口验证', category: 'GENERAL' }, token))).data;
    testTipId = String(createdTip.id);
    assert.equal((await call('/content/version')).data.travelTip, tipVersion);
    assert(await db.operationLog.findFirst({ where: { targetType: 'tips', targetId: testTipId, action: 'CREATE' } }));
    await call(`/admin/content/tips/${testTipId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json' }, body: JSON.stringify({ effectiveFrom: '2099-01-01T00:00:00.000Z' }) });
    await call(`/admin/content/tips/${testTipId}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await call('/content/version')).data.travelTip, tipVersion + 1);
    assert(!((await call('/countries/JP/tips')).data as unknown as Array<{ id: string }>).some((item) => item.id === testTipId));
    await call(`/admin/content/tips/${testTipId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json' }, body: JSON.stringify({ effectiveFrom: '2020-01-01T00:00:00.000Z' }) });
    assert.equal((await call('/content/version')).data.travelTip, tipVersion + 1);
    assert(!((await call('/countries/JP/tips')).data as unknown as Array<{ id: string }>).some((item) => item.id === testTipId));
    await call(`/admin/content/tips/${testTipId}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert(((await call('/countries/JP/tips')).data as unknown as Array<{ id: string }>).some((item) => item.id === testTipId));
    const draft = (await call('/admin/content/visa', json({ passportRegion: 'SG', destinationCountryCode: 'KR',
      visaType: 'VISA_REQUIRED', title: '联调草稿' }, token))).data;
    draftVisaId = String(draft.id);
    const visaDraftVersion = Number((await call('/content/version')).data.visa);
    assert((await call('/admin/content/visa?passportRegion=SG&destinationCountryCode=KR',
      { headers: { Authorization: `Bearer ${token}` } })).data.items);
    await expectError(`/admin/content/visa/${draftVisaId}/publish`, 400, 'VALIDATION_FAILED',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const draftPatch = { corePolicy: ['联调政策'], sourceName: '联调来源', lastVerifiedAt: new Date().toISOString() };
    await call(`/admin/content/visa/${draftVisaId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json' }, body: JSON.stringify(draftPatch) });
    await expectError(`/admin/content/visa/${draftVisaId}/publish`, 400, 'VALIDATION_FAILED',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const requirement = (await call('/admin/content/visa-requirements', json({ visaPolicyId: draftVisaId,
      title: '护照原件', required: true, actionable: true, targetStage: 'PREPARING',
      itemType: 'VISA_MATERIAL', scope: 'TRIP', dedupeKey: 'passport' }, token))).data;
    draftRequirementId = String(requirement.id);
    assert.equal(requirement.dedupeKey, 'passport');
    await call(`/admin/content/visa-requirements/${draftRequirementId}/publish`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await call('/content/version')).data.visa, visaDraftVersion + 1);
    assert.equal((await call(`/admin/content/visa/${draftVisaId}/publish`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}` } })).data.status, 'PUBLISHED');
    assert.equal((await call('/content/version')).data.visa, visaDraftVersion + 2);
    const versionBeforeUpdate = (await call('/content/version')).data;
    const update = { passportRegion: 'SG', destinationCountryCode: 'KR', visaType: 'VISA_REQUIRED',
      title: '联调草稿', corePolicy: ['联调政策'], sourceName: '联调来源', maxStayDays: 15,
      lastVerifiedAt: new Date().toISOString() };
    const requestId = randomUUID();
    await call('/admin/visa', { ...json(update, token), headers: { ...json(update, token).headers as Record<string, string>, 'X-Request-Id': requestId } });
    assert.equal((await call('/content/version')).data.visa, versionBeforeUpdate.visa);
    assert.equal((await call('/visa/SG/KR')).data.policy && ((await call('/visa/SG/KR')).data.policy as { maxStayDays: number | null }).maxStayDays, null);
    await call(`/admin/content/visa/${draftVisaId}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const versionAfter = (await call('/content/version')).data;
    assert.equal(versionAfter.visa, Number(versionBeforeUpdate.visa) + 1);
    for (const [module, version] of Object.entries(versionBeforeUpdate)) if (module !== 'visa') assert.equal(versionAfter[module], version);
    const log = await db.operationLog.findFirst({ where: { requestId, targetType: 'visa' }, orderBy: { createdAt: 'desc' } });
    assert(log);
    assert((log.changes as Array<{ field: string }>).some((change) => change.field === 'maxStayDays'));
    const passport = await db.packingItem.findUniqueOrThrow({ where: { code: 'passport' } });
    const app = await db.travelApp.findFirstOrThrow();
    for (const [kind, body] of [
      ['country-packing', { countryCode: 'FR', packingItemId: passport.id }],
      ['country-apps', { countryCode: 'FR', travelAppId: app.id }],
    ] as const) {
      const linked = (await call(`/admin/links/${kind}`, json(body, token))).data;
      linkIds.push({ kind, id: String(linked.id) });
      assert(await db.operationLog.findFirst({ where: { targetType: kind, targetId: String(linked.id) } }));
      await call(`/admin/links/${kind}/${String(linked.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      linkIds.pop();
    }

    const jpg = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#557799' } }).jpeg().toBuffer();
    const form = new FormData();
    form.set('usage', 'ATTRACTION_COVER');
    form.set('file', new Blob([new Uint8Array(jpg)], { type: 'image/jpeg' }), 'untrusted-name.jpg');
    const uploaded = (await call('/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })).data;
    assetId = String(uploaded.id);
    assetPath = String(uploaded.path);
    assert(assetPath.endsWith('.webp'));
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
    assert.equal(asset.mimeType, 'image/webp');
    const listedMedia = (await call('/media?usage=ATTRACTION', { headers: { Authorization: `Bearer ${token}` } })).data;
    assert((listedMedia.items as Array<{ id: string }>).some((item) => item.id === assetId));
    const image = await readFile(join(resolve(config.UPLOAD_ROOT_DIR), assetPath));
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.format, 'webp');
    assert((metadata.width ?? 0) <= 1600 && (metadata.height ?? 0) <= 1600);
    const files = await readdir(resolve(config.UPLOAD_ROOT_DIR));
    assert(files.every((file) => file.endsWith('.webp')));
    const staticResponse = await fetch(String(uploaded.url));
    assert.equal(staticResponse.status, 200);
    assert.equal(staticResponse.headers.get('content-type'), 'image/webp');
    const createdAttraction = (await call('/admin/content/attractions', json({ countryCode: 'JP', nameZh: '联调景点',
      coverUrl: String(uploaded.url), description: '图片关联与发布验证', category: 'LANDMARK' }, token))).data;
    testAttractionId = String(createdAttraction.id);
    await call(`/admin/content/attractions/${testAttractionId}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert(((await call('/countries/JP/attractions')).data as unknown as Array<{ id: string }>).some((item) => item.id === testAttractionId));
    const imageLink = (await call('/admin/links/attraction-images', json({ attractionId: testAttractionId,
      mediaAssetId: assetId, alt: '联调图片' }, token))).data;
    linkIds.push({ kind: 'attraction-images', id: String(imageLink.id) });
    assert.equal(imageLink.path, assetPath);
    await call(`/admin/links/attraction-images/${String(imageLink.id)}`, { method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` } });
    linkIds.pop();
    const fakeForm = new FormData();
    fakeForm.set('usage', 'ATTRACTION_COVER');
    fakeForm.set('file', new Blob([new Uint8Array(jpg)], { type: 'image/png' }), 'fake.png');
    await expectError('/media/upload', 422, 'FILE_TYPE_UNSUPPORTED', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fakeForm });
    assert.deepEqual((await readdir(resolve(config.UPLOAD_ROOT_DIR))).filter((name) => !name.endsWith('.webp')), []);
    console.log('HTTP + PostgreSQL smoke passed: A/B invite and concurrent join, trip access controls, shared plans, member leave/remove, content/admin flows, concurrent PlanItem idempotency, media compression, and WebP storage.');
  } finally {
    for (const link of linkIds) {
      if (link.kind === 'country-packing') await db.countryPacking.deleteMany({ where: { id: link.id } });
      if (link.kind === 'country-apps') await db.countryTravelApp.deleteMany({ where: { id: link.id } });
      if (link.kind === 'attraction-images') await db.attractionImage.deleteMany({ where: { id: link.id } });
    }
    if (assetId) await db.mediaAsset.deleteMany({ where: { id: assetId } });
    if (assetPath) await rm(join(resolve(config.UPLOAD_ROOT_DIR), assetPath), { force: true });
    if (testAttractionId) await db.attraction.deleteMany({ where: { id: testAttractionId } });
    if (testTipId) await db.travelTip.deleteMany({ where: { id: testTipId } });
    if (draftRequirementId) await db.visaRequirement.deleteMany({ where: { id: draftRequirementId } });
    if (draftVisaId) await db.visaPolicy.deleteMany({ where: { id: draftVisaId } });
    if (testViewerId) {
      await db.operationLog.deleteMany({ where: { adminUserId: testViewerId } });
      await db.adminUser.deleteMany({ where: { id: testViewerId } });
    }
    if (testCountryCode) await db.country.deleteMany({ where: { code: testCountryCode } });
    await db.trip.deleteMany({ where: { id: tripId } });
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  server.kill();
  await db.$disconnect();
});
