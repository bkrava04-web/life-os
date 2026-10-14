// Settings use the same access controller as the login gate; no second Auth client.
export function initCloudFoundation(access) {
  const $ = id => document.getElementById(id);
  $('cloudFoundationControls').classList.remove('hidden'); $('cloudSignInForm').hidden = true;
  $('cloudFoundationStatus').textContent = 'Авторизован';
  $('cloudFoundationDetail').textContent = 'Доступ владельца подтверждён. Синхронизация отключена.';
  $('cloudCheck').onclick = () => access.recheck();
  $('cloudAuthCheck').onclick = () => access.recheck();
  $('cloudSignOut').onclick = () => access.signOut();
}
