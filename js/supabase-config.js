import { PUBLIC_BUILD } from './runtime-config.js?v=stage9.3.3';
// Build embeds only vetted public configuration; local server reads the ignored file.
export const SUPABASE_CONFIG = Object.freeze({ enabled: false, url: 'https://bbshunblrtroepmwnshy.supabase.co', publishableKey: '' });
export async function loadSupabaseConfig() {
  if (PUBLIC_BUILD) return SUPABASE_CONFIG;
  let response;
  try { response = await fetch('./api/cloud/config', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(5000) }); }
  catch { throw new Error('Не удалось прочитать публичную конфигурацию. Повтори проверку подключения.'); }
  if (!response.ok) throw new Error('Проверь локальную публичную конфигурацию Supabase');
  return response.json();
}
