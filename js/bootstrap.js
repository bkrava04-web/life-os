import { loadSupabaseConfig } from './supabase-config.js?v=stage9.3.3';
import { createCloudFoundation } from './cloud-foundation.js?v=stage9.3.3';
import { createAccessController } from './access-controller.js?v=stage9.3.3';
import { PUBLIC_BUILD } from './runtime-config.js?v=stage9.3.3';
const $ = id => document.getElementById(id);
let access;
function display({ state, message }) {
  const open = state === 'open';
  document.body.dataset.privateAccess = open ? 'granted' : 'locked';
  $('privateShell').hidden = !open; $('privateShell').inert = !open; $('accessGate').hidden = open;
  if (!open) document.querySelectorAll('#privateShell dialog[open]').forEach(dialog => dialog.close());
  $('accessLoading').hidden = !['loading', 'starting'].includes(state);
  $('accessLoginForm').hidden = !['login', 'error'].includes(state);
  $('accessRetry').hidden = state !== 'error'; $('accessMessage').textContent = message;
  $('accessMessage').setAttribute('role', state === 'error' ? 'alert' : 'status');
  $('accessPassword').value = '';
}
// Cache only the public login shell/static allowlist; authentication is never cached.
if (PUBLIC_BUILD && 'serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname, updateViaCache: 'none' }).catch(() => {});
async function initialize() {
  display({ state: 'loading', message: 'Проверяем доступ…' });
  try {
    let storage = null; try { storage = window.sessionStorage; } catch {}
    const client = createCloudFoundation(await loadSupabaseConfig(), { storage });
    if (!client.configured) throw new Error('Подключение Supabase не настроено. Добавь публичную конфигурацию и повтори проверку.');
    access = createAccessController({ client, online: () => navigator.onLine, visible: () => !document.hidden, onState: display, startPrivate: async controller => {
      const app = await import('./app.js?v=stage9.3.3');
      return app.startPrivateApplication(controller);
    } });
    if (!document.hidden) await access.initialize();
  } catch (failure) { display({ state: 'error', message: failure.message || 'Не удалось проверить доступ.' }); }
}
$('accessLoginForm').onsubmit = event => {
  event.preventDefault(); const password = $('accessPassword').value; $('accessPassword').value = '';
  if (!access) { display({ state: 'error', message: 'Сначала настрой подключение Supabase и повтори проверку.' }); return; }
  access.signIn($('accessEmail').value.trim(), password);
};
$('accessRetry').onclick = () => access ? access.retry() : initialize();
window.addEventListener('offline', () => access?.disconnected());
window.addEventListener('online', () => access ? access.retry() : initialize());
document.addEventListener('visibilitychange', () => { if (document.hidden) access?.suspend(); else access?.retry(); });
window.addEventListener('pagehide', () => access?.suspend());
window.addEventListener('pageshow', event => { if (event.persisted) { access?.suspend(); access?.retry(); } });
initialize();
