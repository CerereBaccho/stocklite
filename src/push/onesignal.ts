// src/push/onesignal.ts
declare global { interface Window { OneSignal?: any } }

export async function initPushIfNeeded(): Promise<void> {
  if (typeof window === 'undefined') return;
  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
  if (!appId) return;
  if (!window.OneSignal || !window.OneSignal.init) return;

  await window.OneSignal.init({
    appId,
    serviceWorkerParam: { scope: '/stocklite/' },
  });
}
