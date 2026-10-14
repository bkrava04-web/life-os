// Coordinates the existing Supabase client. No local progress storage is accessed.
export function createAccessController({ client, startPrivate, onState, online = () => true, visible = () => true, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let state = 'loading', generation = 0, busy = false, retryQueued = false, timer, privateApp;
  function emit(next, message = '') { state = next; onState({ state, message }); }
  function stopTimer() { clearTimer(timer); }
  function schedule() { stopTimer(); if (state === 'open') timer = setTimer(() => access.retry(), Math.max(1, client.sessionExpiresAt - now())); }
  async function run(operation) {
    if (busy) { retryQueued = true; return; }
    busy = true; const ticket = ++generation; stopTimer(); emit('loading', 'Проверяем доступ…');
    try {
      if (!online()) throw new Error('Нет подключения к интернету. Для проверки доступа нужна сеть.');
      const result = await operation();
      if (ticket !== generation) return;
      if (result?.restored === false || !client.authorized) { emit('login', 'Войди в своё личное пространство.'); return; }
      if (!online()) throw new Error('Нет подключения к интернету. Доступ не подтверждён.');
      if (!visible()) { access.suspend(); return; }
      emit('starting', 'Открываем LIFE OS…');
      if (!privateApp) privateApp = await startPrivate(access);
      else await privateApp?.refresh?.();
      if (ticket !== generation) return;
      if (!online() || !client.authorized) throw new Error('Доступ больше не подтверждён. Повтори проверку.');
      if (!visible()) { access.suspend(); return; }
      emit('open'); schedule();
    } catch (failure) { if (ticket === generation) emit('error', failure.message || 'Не удалось проверить доступ.'); }
    finally { busy = false; if (retryQueued) { retryQueued = false; access.retry(); } }
  }
  const access = {
    get authorized() { return ['starting', 'open'].includes(state) && online() && client.authorized; },
    get state() { return state; },
    initialize: () => run(() => client.restoreSession()),
    retry: () => run(() => client.hasSession ? client.checkAuthorization() : client.restoreSession()),
    signIn: (email, password) => run(() => client.signIn(email, password)),
    recheck: () => access.retry(),
    async signOut() {
      const ticket = ++generation; retryQueued = false; stopTimer(); emit('login', 'Выход выполнен. Данные на устройстве сохранены.');
      const result = await client.signOut();
      if (ticket === generation && !result.remoteRevoked) emit('login', 'Выход на устройстве выполнен. Серверный отзыв сессии не подтверждён из-за отсутствия связи.');
    },
    disconnected() { ++generation; retryQueued = false; stopTimer(); emit('error', 'Нет подключения к интернету. Приватный интерфейс закрыт; данные сохранены.'); },
    suspend() { ++generation; stopTimer(); emit('loading', 'Проверяем доступ…'); },
  };
  return access;
}
