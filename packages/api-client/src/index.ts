export type ApiErrorKind = 'NETWORK' | 'TIMEOUT' | 'HTTP' | 'PARSE';

export class ApiError extends Error {
  constructor(readonly kind: ApiErrorKind, readonly code: string, message: string,
    readonly status = 0, readonly details: Record<string, unknown> = {}, readonly requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> { success: boolean; data?: T; code?: string; message?: string;
  details?: Record<string, unknown>; requestId?: string }
export interface HttpClientOptions {
  baseUrl: string;
  tokenProvider?: () => string | null;
  onUnauthorized?: () => void;
  fetcher?: typeof fetch;
  adapter?: HttpAdapter;
  timeoutMs?: number;
}
export interface RequestOptions { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; headers?: Record<string, string> }
export interface HttpAdapter {
  request(input: { url: string; method: NonNullable<RequestOptions['method']>; headers: Record<string, string>;
    body?: unknown; timeoutMs: number }): Promise<{ status: number; data: unknown; headers?: Record<string, string> }>;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = this.options.tokenProvider?.();
    const headers: Record<string, string> = { ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    const isForm = !this.options.adapter && typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    const controller = !this.options.adapter && typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { timedOut = true; controller?.abort(); reject(new Error('timeout')); }, this.options.timeoutMs ?? 10_000);
    });
    let status: number;
    let payload: Envelope<T>;
    let responseRequestId: string | undefined;
    try {
      const url = `${this.options.baseUrl.replace(/\/$/, '')}${path}`;
      if (this.options.adapter) {
        const response = await Promise.race([this.options.adapter.request({ url, method: options.method ?? 'GET',
          headers, body: options.body, timeoutMs: this.options.timeoutMs ?? 10_000 }), deadline]);
        status = response.status;
        responseRequestId = response.headers?.['x-request-id'] ?? response.headers?.['X-Request-Id'];
        if (!response.data || typeof response.data !== 'object') throw new ApiError('PARSE', 'INVALID_RESPONSE', '服务响应格式不正确', status);
        payload = response.data as Envelope<T>;
      } else {
        const response = await Promise.race([(this.options.fetcher ?? fetch)(url, { method: options.method ?? 'GET',
          body: isForm ? options.body as FormData : options.body === undefined ? undefined : JSON.stringify(options.body),
          headers: new Headers(headers), signal: controller?.signal }), deadline]);
        status = response.status;
        responseRequestId = response.headers.get('X-Request-Id') ?? undefined;
        try { payload = await response.json() as Envelope<T>; }
        catch { throw new ApiError('PARSE', 'INVALID_RESPONSE', '服务响应格式不正确', status, {}, responseRequestId); }
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(timedOut || controller?.signal.aborted ? 'TIMEOUT' : 'NETWORK',
        timedOut || controller?.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK',
        timedOut || controller?.signal.aborted ? '请求超时，请重试' : '网络连接失败，请检查连接');
    } finally { clearTimeout(timer); }
    const requestId = payload.requestId ?? responseRequestId;
    // An older request may finish after the user has logged into another account.
    // Only clear the session that actually made this request.
    if (status === 401 && this.options.tokenProvider?.() === token) this.options.onUnauthorized?.();
    if (status < 200 || status >= 300 || !payload.success) throw new ApiError('HTTP', payload.code ?? `HTTP_${status}`,
      payload.message ?? '请求失败', status, payload.details ?? {}, requestId);
    return payload.data as T;
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;
export function queryString(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  const value = params.toString();
  return value ? `?${value}` : '';
}

export type ManagedEntity = 'continents' | 'countries' | 'cities' | 'visa' | 'visa-requirements' |
  'country-guides' | 'transport' | 'packing' | 'travel-apps' | 'tips' | 'attractions';
export type LinkKind = 'country-packing' | 'country-apps' | 'attraction-images' | 'country-media';
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface AdminRecord { id?: string; code?: string; status?: string; version?: number; draftPending?: boolean;
  updatedAt?: string; [key: string]: unknown }
export interface AdminIdentity { id: string; username: string; role: 'SUPER_ADMIN' | 'CONTENT_ADMIN' | 'REVIEWER' | 'VIEWER' }
export interface ClientUserProfile { id: string; uid: string; nickname: string; avatarUrl: string | null; passportRegion: string;
  showPlanAddGuide: boolean; locale: string }
export interface ClientUserAnchor { type: string; tripId: string | null; occurredAt: string }
export interface ContentHealth { countries: number; onlineCountries: number; missingVisa: number; staleVisaPolicies: number;
  countriesWithoutAttractions: number; countriesWithoutTransport: number; completeness: number; guideCompleteness: number }
export interface CountryGuideImportItem { countryCode: string; key: string; id: string | null; kind: 'ADDED' | 'CHANGED' | 'UNCHANGED';
  changedFields: string[]; before: AdminRecord | null; after: AdminRecord; statusAfterImport: string }
export interface CountryGuideImportResult { applied: boolean; counts: { added: number; changed: number; unchanged: number; errors: number };
  items: CountryGuideImportItem[]; errors: Array<{ path: string; message: string }> }
export interface MediaAsset { id: string; path: string; url: string; width: number; height: number; bytes: number;
  mimeType: string; usage: string; createdAt?: string }
export interface OperationLog { id: string; adminUserId: string | null; action: string; targetType: string; targetId: string;
  targetLabel: string; requestId: string | null; timestamp: string; changes: Array<{ field: string; before: unknown; after: unknown }> }

const encode = encodeURIComponent;
export function createAdminApi(http: HttpClient) {
  const content = {
    list: (entity: ManagedEntity, query?: Query) => http.request<Page<AdminRecord>>(`/admin/content/${entity}${queryString(query)}`),
    get: (entity: ManagedEntity, id: string) => http.request<AdminRecord>(`/admin/content/${entity}/${encode(id)}`),
    create: (entity: ManagedEntity, body: object) => http.request<AdminRecord>(`/admin/content/${entity}`, { method: 'POST', body }),
    update: (entity: ManagedEntity, id: string, body: object) => http.request<AdminRecord>(`/admin/content/${entity}/${encode(id)}`, { method: 'PATCH', body }),
    archive: (entity: ManagedEntity, id: string) => http.request<AdminRecord>(`/admin/content/${entity}/${encode(id)}`, { method: 'DELETE' }),
    publish: (entity: ManagedEntity, id: string) => http.request<AdminRecord>(`/admin/content/${entity}/${encode(id)}/publish`, { method: 'POST' }),
    unpublish: (entity: ManagedEntity, id: string) => http.request<AdminRecord>(`/admin/content/${entity}/${encode(id)}/unpublish`, { method: 'POST' }),
  };
  const forEntity = (entity: ManagedEntity) => ({ list: (query?: Query) => content.list(entity, query),
    get: (id: string) => content.get(entity, id), create: (body: object) => content.create(entity, body),
    update: (id: string, body: object) => content.update(entity, id, body),
    archive: (id: string) => content.archive(entity, id), publish: (id: string) => content.publish(entity, id),
    unpublish: (id: string) => content.unpublish(entity, id) });
  return {
    auth: {
      login: (username: string, password: string) => http.request<{ token: string }>('/admin/auth/login', { method: 'POST', body: { username, password } }),
      me: () => http.request<AdminIdentity>('/admin/auth/me'),
    },
    content,
    continent: forEntity('continents'), country: forEntity('countries'), city: forEntity('cities'),
    visa: forEntity('visa'), visaRequirement: forEntity('visa-requirements'), transport: forEntity('transport'),
    packing: forEntity('packing'), travelApp: forEntity('travel-apps'), travelTip: forEntity('tips'),
    attraction: forEntity('attractions'),
    links: {
      list: (kind: LinkKind, parent: string) => http.request<AdminRecord[]>(`/admin/links/${kind}/${encode(parent)}`),
      create: (kind: LinkKind, body: object) => http.request<AdminRecord>(`/admin/links/${kind}`, { method: 'POST', body }),
      reorder: (kind: LinkKind, id: string, sortOrder: number) => http.request<AdminRecord>(`/admin/links/${kind}/${encode(id)}`, { method: 'PATCH', body: { sortOrder } }),
      remove: (kind: LinkKind, id: string) => http.request<AdminRecord>(`/admin/links/${kind}/${encode(id)}`, { method: 'DELETE' }),
    },
    media: {
      list: (query?: Query) => http.request<Page<MediaAsset>>(`/media${queryString(query)}`),
      upload: (file: File, usage: string) => { const body = new FormData(); body.set('usage', usage); body.set('file', file);
        return http.request<MediaAsset>('/media/upload', { method: 'POST', body }); },
    },
    contentHealth: () => http.request<ContentHealth>('/admin/content-health'),
    operationLog: (query?: Query) => http.request<Page<OperationLog>>(`/admin/operation-logs${queryString(query)}`),
    contentVersion: () => http.request<Record<string, number>>('/content/version'),
    countryGuideImport: (body: { apply: boolean; packages: Array<Record<string, unknown>>; ignoredKeys?: string[] }) =>
      http.request<CountryGuideImportResult>('/admin/country-guides/import', { method: 'POST', body }),
    visaFreshness: () => http.request<Array<Record<string, unknown>>>('/admin/visa/freshness'),
  };
}

// Read DTOs mirror the public HTTP contract; domain models stay in packages/types.
export interface CountrySummary { code: string; continentCode: string; name: string; nameEn: string;
  latitude: number; longitude: number; online: boolean; completeness: number; version: number; summary?: string | null;
  flagUrl?: string | null; capitalCity?: string | null; riskLevel?: string | null; currencyCode?: string | null;
  languages?: string[]; timeZone?: string | null; phoneCode?: string | null }
export interface ContinentSummary { code: string; name: string; nameEn: string; sortOrder: number;
  centerLatitude: number; centerLongitude: number; defaultZoom: number }
export interface CountryGuideSection extends CountryGuideItem {
  countryCode: string; sectionKey: 'COUNTRY_OVERVIEW' | 'ENTRY_RESIDENCE' | 'TRAVEL_RISK' | 'SAFETY' | 'TRANSPORT' | 'PRICE_MEDICAL' | 'PRACTICAL_INFO';
  sourceProvider: string | null; sourceUpdatedAt: string | null; importedAt: string | null;
}
export interface GuideSummary { id: string; name?: string; nameZh?: string; title?: string;
  description?: string | null; planMapping?: import('@travel-guide/types').PlanMapping | null; [key: string]: unknown }
export interface VisaLookup { policy: import('@travel-guide/types').VisaPolicy | null;
  matchLevel: import('@travel-guide/types').VisaMatchLevel; expired: boolean; daysSinceVerified: number | null;
  freshnessMessage: string; advice: { level: string; text: string }; available: boolean;
  visaRequirement: import('@travel-guide/types').VisaPolicy['visaRequirement'] | null; maxStayDays: number | null;
  passportRequired: boolean | null; passportValidityMonths: number | null; entrySummary: string | null;
  requirementText: string | null; sourceUrl: string | null; lastVerifiedAt: string | null }
export interface CountryGuideItem { id: string; title: string; subtitle: string | null; content: string; sortOrder: number;
  sourceUrl: string | null; lastVerifiedAt: string | null }
export interface CountryGuideResponse { country: CountrySummary; sections: {
  overview: CountryGuideItem[]; entryResidence: CountryGuideItem[]; travelRisk: CountryGuideItem[]; safety: CountryGuideItem[];
  transport: CountryGuideItem[]; priceMedical: CountryGuideItem[]; practicalInfo: CountryGuideItem[];
}; source: { provider: string | null; sourceUrl: string | null; lastVerifiedAt: string | null } }
export type ClientTrip = import('@travel-guide/types').Trip & { destinations?: import('@travel-guide/types').TripDestination[];
  planItems?: import('@travel-guide/types').PlanItem[]; currentStage?: string; createdAt?: string;
  stats?: { total: number; done: number; percent: number }; memberRole?: 'OWNER' | 'MEMBER'; members?: ClientTripMember[] };
export interface ClientTripMember { userId: string; nickname: string; avatarUrl: string | null; role: 'OWNER' | 'MEMBER'; joinedAt: string }
export interface ClientTripInvitePreview { trip: { title: string; startDate: string | null; endDate: string | null;
  destinations: Array<{ countryCode: string; countryName: string; cityCode: string | null; orderIndex: number }> };
  owner: { nickname: string; avatarUrl: string | null }; memberCount: number; expiresAt: string }
export type PlanItemInput = Pick<import('@travel-guide/types').PlanItem, 'title' | 'stage' | 'itemType' | 'scope' | 'sourceType'> &
  Partial<Pick<import('@travel-guide/types').PlanItem, 'description' | 'sourceId' | 'sourceCountryCode' | 'dedupeKey' |
  'sortOrder' | 'done' | 'doneAt' | 'planDate' | 'dedupeHash'>>;
export interface PlanCreateResult { created: boolean; planItem: import('@travel-guide/types').PlanItem; toast: string }
export interface PlanRemoveResult { removed: import('@travel-guide/types').PlanItem; undoHint: { payload: PlanItemInput } }
export interface ClientTripExpense { id: string; tripId: string; category: string; amountCents: number; payerUserId: string;
  payerNickname: string; participantUserIds: string[]; note: string | null; createdAt: string }
export interface TripExpenseInput { category: string; amountCents: number; payerUserId: string; participantUserIds: string[]; note?: string | null }

export function createClientApi(http: HttpClient) {
  const countryGuides = (code: string, kind: 'transport' | 'packing' | 'tips' | 'apps' | 'attractions') =>
    http.request<GuideSummary[]>(`/countries/${encode(code)}/${kind}`);
  return {
    auth: {
      wechatLogin: (code: string, nickname: string) => http.request<{ token: string; expiresIn: number; user: ClientUserProfile }>(
        '/auth/wechat-login', { method: 'POST', body: { code, nickname } }),
      devLogin: (identity: 'A' | 'B') => http.request<{ token: string; expiresIn: number; user: ClientUserProfile }>(
        '/auth/dev-login', { method: 'POST', body: { identity } }),
    },
    user: {
      me: () => http.request<ClientUserProfile>('/users/me'),
      updateMe: (body: Partial<Pick<ClientUserProfile, 'nickname' | 'passportRegion' | 'showPlanAddGuide' | 'locale'>>) =>
        http.request<ClientUserProfile>('/users/me', { method: 'PATCH', body }),
      anchors: () => http.request<ClientUserAnchor[]>('/users/me/anchors'),
      recordFirstUse: () => http.request<{ recorded: boolean }>('/users/me/anchors/first-use', { method: 'POST' }),
    },
    contentVersion: () => http.request<import('@travel-guide/types').ContentVersionSnapshot>('/content/version'),
    continents: () => http.request<ContinentSummary[]>('/continents'),
    countries: (query?: Query) => http.request<Page<CountrySummary>>(`/countries${queryString(query)}`),
    country: (code: string) => http.request<CountrySummary>(`/countries/${encode(code)}`),
    countryGuide: (code: string) => http.request<CountryGuideResponse>(`/countries/${encode(code)}/guide`),
    visa: (passportRegion: string, countryCode: string) => http.request<VisaLookup>(`/visa/${encode(passportRegion)}/${encode(countryCode)}`),
    attractions: (code: string) => countryGuides(code, 'attractions'),
    transport: (code: string) => countryGuides(code, 'transport'),
    packing: (code: string) => countryGuides(code, 'packing'),
    travelTips: (code: string) => countryGuides(code, 'tips'),
    travelApps: (code: string) => countryGuides(code, 'apps'),
    trips: (query?: Query) => http.request<Page<ClientTrip>>(`/trips${queryString(query)}`),
    trip: (id: string) => http.request<ClientTrip>(`/trips/${encode(id)}`),
    createTrip: (body: { title: string; startDate?: string | null; endDate?: string | null; notes?: string | null; travelers?: string[] }) =>
      http.request<ClientTrip>('/trips', { method: 'POST', body }),
    updateTrip: (id: string, body: Partial<Pick<ClientTrip, 'title' | 'startDate' | 'endDate' | 'notes' | 'travelers'>>) =>
      http.request<ClientTrip>(`/trips/${encode(id)}`, { method: 'PATCH', body }),
    dissolveTrip: (id: string) => http.request<{ dissolved: boolean }>(`/trips/${encode(id)}`, { method: 'DELETE' }),
    confirmTripStage: (id: string, stage: ClientTrip['status']) =>
      http.request<ClientTrip>(`/trips/${encode(id)}/stage-confirm`, { method: 'POST', body: { stage } }),
    addTripDestination: (id: string, body: { countryCode: string; cityCode?: string | null; arrivalDate?: string | null;
      departureDate?: string | null; isOrigin?: boolean }) =>
      http.request<import('@travel-guide/types').TripDestination>(`/trips/${encode(id)}/destinations`, { method: 'POST', body }),
    removeTripDestination: (id: string, destinationId: string) =>
      http.request<{ removed: boolean }>(`/trips/${encode(id)}/destinations/${encode(destinationId)}`, { method: 'DELETE' }),
    tripMembers: (tripId: string) => http.request<{ role: 'OWNER' | 'MEMBER'; items: ClientTripMember[] }>(`/trips/${encode(tripId)}/members`),
    removeTripMember: (tripId: string, userId: string) => http.request<{ removed: boolean }>(
      `/trips/${encode(tripId)}/members/${encode(userId)}`, { method: 'DELETE' }),
    tripExpenses: (tripId: string) => http.request<ClientTripExpense[]>(`/trips/${encode(tripId)}/expenses`),
    createTripExpense: (tripId: string, body: TripExpenseInput) =>
      http.request<ClientTripExpense>(`/trips/${encode(tripId)}/expenses`, { method: 'POST', body }),
    removeTripExpense: (tripId: string, expenseId: string) =>
      http.request<{ removed: boolean }>(`/trips/${encode(tripId)}/expenses/${encode(expenseId)}`, { method: 'DELETE' }),
    leaveTrip: (tripId: string) => http.request<{ left: boolean }>(`/trips/${encode(tripId)}/leave`, { method: 'POST' }),
    createTripInvite: (tripId: string) => http.request<{ token: string; expiresAt: string; maxUses: number; path: string }>(
      `/trips/${encode(tripId)}/invites`, { method: 'POST' }),
    revokeTripInvites: (tripId: string) => http.request<{ revoked: number }>(`/trips/${encode(tripId)}/invites`, { method: 'DELETE' }),
    tripInvitePreview: (token: string) => http.request<ClientTripInvitePreview>(`/trip-invites/${encode(token)}`),
    joinTripInvite: (token: string) => http.request<{ tripId: string; alreadyJoined: boolean }>(
      `/trip-invites/${encode(token)}/join`, { method: 'POST' }),
    planItems: (tripId: string) => http.request<import('@travel-guide/types').PlanItem[]>(`/trips/${encode(tripId)}/plan-items`),
    createPlanItem: (tripId: string, body: PlanItemInput) =>
      http.request<PlanCreateResult>(`/trips/${encode(tripId)}/plan-items`, { method: 'POST', body }),
    updatePlanItem: (tripId: string, id: string, body: Partial<Pick<import('@travel-guide/types').PlanItem,
      'title' | 'description' | 'sortOrder' | 'done' | 'doneAt' | 'planDate'>>) =>
      http.request<import('@travel-guide/types').PlanItem>(`/trips/${encode(tripId)}/plan-items/${encode(id)}`, { method: 'PATCH', body }),
    removePlanItem: (tripId: string, id: string) =>
      http.request<PlanRemoveResult>(`/trips/${encode(tripId)}/plan-items/${encode(id)}`, { method: 'DELETE' }),
  };
}

export type ClientApi = ReturnType<typeof createClientApi>;
