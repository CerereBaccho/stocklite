// OneSignal Web SDK v16 service worker (updater)
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// ---- デバッグ補助（main と同じ）----------------------------------------------
self.addEventListener('install', () => { self.skipWaiting?.(); });
self.addEventListener('activate', (ev) => { ev.waitUntil(self.clients.claim()); });

function postToAllClients(type, data) {
  const payload = { __sl: true, type, at: Date.now(), ...data };
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
    clients.forEach(c => c.postMessage(payload));
  });
}

self.addEventListener('push', (event) => {
  try {
    let txt = null, json = null;
    if (event?.data) {
      try { txt = event.data.text(); } catch {}
      try { json = event.data.json(); } catch {}
    }
    postToAllClients('OS_SW_PUSH', {
      hasData: !!event?.data,
      text: (txt && txt.length > 180) ? (txt.slice(0,180) + '…') : txt,
      json: json ? (json.data || json) : null
    });
  } catch (e) {
    postToAllClients('OS_SW_PUSH_ERR', { msg: String(e && e.message || e) });
  }
});

self.addEventListener('notificationdisplay', (ev) => {
  try {
    const n = ev?.notification;
    postToAllClients('OS_SW_DISPLAY', { title: n?.title, body: n?.body });
  } catch (e) { postToAllClients('OS_SW_DISPLAY_ERR', { msg: String(e && e.message || e) }); }
});

self.addEventListener('notificationclick', (ev) => {
  try {
    const n = ev?.notification;
    postToAllClients('OS_SW_CLICK', { title: n?.title, body: n?.body, action: ev?.action });
  } catch (e) { postToAllClients('OS_SW_CLICK_ERR', { msg: String(e && e.message || e) }); }
});

self.addEventListener('pushsubscriptionchange', (ev) => {
  postToAllClients('OS_SW_SUBCHANGE', { reason: 'pushsubscriptionchange' });
});