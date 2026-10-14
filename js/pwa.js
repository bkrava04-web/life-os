import { PUBLIC_BUILD } from './runtime-config.js?v=stage9.3.3';

export function initPlatform() {
  const moreButton = document.getElementById('mobileMoreButton');
  const moreSheet = document.getElementById('mobileMoreDialog');
  const viewport = window.visualViewport;

  const updateViewport = () => {
    const height = viewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);
    const active = document.activeElement;
    const editing = active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]');
    const keyboardOpen = !!viewport && editing && window.innerHeight - viewport.height > 110;
    document.body.classList.toggle('keyboard-open', keyboardOpen);
  };
  viewport?.addEventListener('resize', updateViewport);
  viewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
  document.addEventListener('focusin', updateViewport);
  document.addEventListener('focusout', () => setTimeout(updateViewport, 80));
  updateViewport();

  const clearDialogDraft = event => { if (event.target instanceof HTMLDialogElement) delete event.target.dataset.dirty; };
  document.addEventListener('input', event => {
    if (event.target.closest('dialog') && event.target.matches('input, textarea, select, [contenteditable="true"]')) event.target.closest('dialog').dataset.dirty = 'true';
  });
  document.addEventListener('change', event => {
    if (event.target.closest('dialog') && event.target.matches('input, textarea, select')) event.target.closest('dialog').dataset.dirty = 'true';
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('cancel', event => {
      if (dialog.dataset.dirty !== 'true') return;
      event.preventDefault();
      if (window.confirm('Закрыть форму без сохранения изменений?')) dialog.close();
    });
    dialog.addEventListener('close', clearDialogDraft);
  });
  document.addEventListener('click', event => {
    const close = event.target.closest('[data-close-dialog]');
    const dialog = close && document.getElementById(close.dataset.closeDialog);
    if (!dialog || dialog.dataset.dirty !== 'true') return;
    if (window.confirm('Закрыть форму без сохранения изменений?')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  moreSheet?.addEventListener('click', event => {
    if (event.target === moreSheet) moreSheet.close();
  });
  moreButton?.addEventListener('click', () => {
    if (!moreSheet?.open) moreSheet?.showModal();
  });

  if (!PUBLIC_BUILD) return;
  document.getElementById('publicNotice').classList.remove('hidden');
  const status = document.getElementById('connectionStatus');
  const settingsStatus = document.getElementById('settingsConnectionStatus');
  const connection = () => {
    const message = navigator.onLine
      ? 'Локальные данные · Синхронизация не подключена'
      : 'Нет сети · данные остаются на этом устройстве';
    status.textContent = message;
    if (settingsStatus) settingsStatus.textContent = message;
  };
  connection();
  addEventListener('online', connection);
  addEventListener('offline', connection);
  document.getElementById('installHelp').classList.remove('hidden');
  const pwa = document.getElementById('pwaStatus');
  if (!('serviceWorker' in navigator) || !isSecureContext) {
    pwa.textContent = 'Офлайн-установка доступна при открытии по HTTPS.';
    return;
  }
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), {
    scope: new URL('../', import.meta.url).pathname,
    updateViaCache: 'none',
  }).then(registration => {
    const update = () => {
      pwa.textContent = 'Обновление готово · закрой вкладки LIFE OS и открой приложение снова.';
    };
    if (registration.waiting) update();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          if (navigator.serviceWorker.controller) update();
          else pwa.textContent = 'Экран входа готов для офлайн-режима. Для доступа нужна сеть.';
        }
      });
    });
    navigator.serviceWorker.ready.then(() => {
      if (!registration.waiting) pwa.textContent = 'Экран входа кеширован · доступ требует сети';
    });
  }).catch(() => {
    pwa.textContent = 'Не удалось подготовить офлайн-режим. Проверь подключение и перезагрузи страницу.';
  });
}
