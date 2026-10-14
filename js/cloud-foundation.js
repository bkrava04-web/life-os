// Auth only. Never imports or writes LIFE OS localStorage/IndexedDB.
export function validateCloudConfig(config) {
  if (!config?.enabled) return null;
  let url; try { url = new URL(config.url); } catch { throw new Error('Проверь URL проекта Supabase'); }
  if (url.protocol !== 'https:' || !/^\w[\w-]*\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Нужен HTTPS URL проекта *.supabase.co');
  if (!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(config.publishableKey || '')) throw new Error('Разрешён только Publishable key, не Secret key/service_role/JWT');
  return { url: url.origin, key: config.publishableKey };
}
export function createCloudFoundation(config, { fetchImpl = globalThis.fetch, now = () => Date.now(), storage = null } = {}) {
  const settings = validateCloudConfig(config);
  const storageKey = settings ? `lifeOS_auth_v1:${new URL(settings.url).hostname}` : null;
  let session = null, ownerVerified = false, epoch = 0, refreshPending = null, signingIn = false;
  function clear() { session = null; ownerVerified = false; try { if (storageKey) storage?.removeItem(storageKey); } catch {} }
  function persist() { try { if (storageKey) storage?.setItem(storageKey, JSON.stringify(session)); } catch {} }
  function error(message, code) { const result = new Error(message); result.code = code; return result; }
  async function request(route, { method = 'GET', body, access } = {}) {
    if (!settings) throw error('Облако не настроено. LIFE OS работает локально.', 'not_configured');
    const headers = { apikey: settings.key, 'Content-Type': 'application/json' };
    if (access) headers.Authorization = `Bearer ${access}`;
    let response;
    try { response = await fetchImpl(settings.url + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000) }); }
    catch { throw error('Supabase недоступен. Локальные данные не изменены.', 'network'); }
    if (!response.ok) throw error(response.status === 401 || response.status === 400 ? 'Вход не выполнен или сессия истекла' : response.status === 403 ? 'Доступ запрещён' : `Проверка Supabase не выполнена (${response.status})`, [400,401,403].includes(response.status) ? 'rejected' : 'network');
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw error('Некорректный ответ Supabase', 'invalid_response'); }
  }
  function decode(result) {
    if (typeof result?.access_token !== 'string' || !result.access_token || typeof result.refresh_token !== 'string' || !result.refresh_token || !Number.isFinite(result.expires_in) || result.expires_in <= 0 || typeof result.user?.id !== 'string' || !result.user.id) throw error('Некорректный ответ авторизации', 'invalid_response');
    return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: now() + result.expires_in * 1000, userId: result.user.id };
  }
  async function ensureSession() {
    if (!session) throw error('Войди снова: сессия отсутствует или истекла', 'not_signed_in');
    if (session.expiresAt > now()) return;
    if (!refreshPending) {
      const ticket = epoch, previous = session;
      refreshPending = (async () => {
        try {
          const refreshed = decode(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: previous.refreshToken } }));
          if (ticket !== epoch) throw error('Сессия закрыта', 'not_signed_in');
          if (refreshed.userId !== previous.userId) { clear(); throw error('Аккаунт сессии изменился', 'rejected'); }
          session = refreshed; ownerVerified = false;
          // Persist token rotation even if the subsequent owner check temporarily loses network.
          persist();
        } catch (failure) { if (ticket === epoch && failure.code !== 'network') clear(); throw failure; }
        finally { refreshPending = null; }
      })();
    }
    await refreshPending;
  }
  async function ownerCheck() {
    ownerVerified = false;
    await ensureSession(); const ticket = epoch;
    let result;
    try { result = await request('/rest/v1/rpc/life_foundation_status', { method: 'POST', body: {}, access: session.accessToken }); }
    catch (failure) { if (ticket === epoch && failure.code === 'rejected') clear(); throw failure; }
    if (ticket !== epoch) throw error('Сессия закрыта', 'not_signed_in');
    if (result?.foundation_version !== 1 || result?.allowed !== true || result?.sync_enabled !== false) { clear(); throw error('Аккаунт не разрешён или схема Foundation не готова', 'owner_denied'); }
    ownerVerified = true; persist(); return result;
  }
  return {
    configured: !!settings,
    get hasSession() { return !!session; },
    get sessionExpiresAt() { return session?.expiresAt || 0; },
    get authorized() { return ownerVerified && !!session && session.expiresAt > now(); },
    async checkConnection() { await request('/auth/v1/settings'); return { connected: true, syncEnabled: false }; },
    async signIn(email, password) {
      if (signingIn || refreshPending) throw error('Дождись завершения входа', 'busy');
      signingIn = true; const ticket = ++epoch; clear(); let issued;
      try {
        issued = decode(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
        if (ticket !== epoch) throw error('Сессия закрыта', 'not_signed_in');
        session = issued; await ownerCheck(); return { userId: session.userId, syncEnabled: false };
      } catch (failure) {
        if (issued) { try { await request('/auth/v1/logout?scope=local', { method: 'POST', access: issued.accessToken }); } catch {} }
        if (ticket === epoch) clear(); throw failure;
      } finally { signingIn = false; }
    },
    async restoreSession() {
      if (!settings) return { restored: false, syncEnabled: false };
      let saved; try { saved = JSON.parse(storage?.getItem(storageKey) || 'null'); } catch { clear(); return { restored: false, syncEnabled: false }; }
      if (!saved) return { restored: false, syncEnabled: false };
      if (typeof saved.accessToken !== 'string' || !saved.accessToken || typeof saved.refreshToken !== 'string' || !saved.refreshToken || !Number.isFinite(saved.expiresAt) || typeof saved.userId !== 'string' || !saved.userId) { clear(); return { restored: false, syncEnabled: false }; }
      session = saved; ownerVerified = false; await ownerCheck(); return { restored: true, userId: session.userId, syncEnabled: false };
    },
    checkAuthorization: ownerCheck,
    async signOut() {
      const previous = session; ++epoch; clear(); // Always clear Auth locally, including offline.
      if (previous) { try { await request('/auth/v1/logout?scope=local', { method: 'POST', access: previous.accessToken }); } catch { return { remoteRevoked: false }; } }
      return { remoteRevoked: true };
    },
  };
}
