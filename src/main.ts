// ==================== src/main.ts (FULL REPLACE) ====================

// OneSignal: 初回タップ時だけ許可プロンプト（Slidedown→新API→旧APIの順でフォールバック）
let __askedPush = false;
async function askPushOnce() {
  if (__askedPush) return;
  __askedPush = true;
  try {
    // @ts-ignore
    if (window.OneSignal?.Slidedown?.promptPush) {
      // @ts-ignore
      await window.OneSignal.Slidedown.promptPush();
      return;
    }
    // @ts-ignore
    if (window.OneSignal?.Notifications?.requestPermission) {
      // @ts-ignore
      await window.OneSignal.Notifications.requestPermission();
      return;
    }
    // @ts-ignore
    if (window.OneSignal?.registerForPushNotifications) {
      // @ts-ignore
      await window.OneSignal.registerForPushNotifications();
      return;
    }
  } catch {}
}

import { seedIfEmpty, storage } from "./storage/db";
import { PRESETS } from "./presets";

const mmdd = (iso?: string) => {
  if (!iso) return "--/--";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

function cardHTML(it: any) {
  const low = it.qty <= it.threshold;
  return `
  <div class="card" data-id="${it.id}">
    <div class="row1">
      ${low ? `<span class="tag danger">要補充</span>` : ``}
      <span class="item-name${low ? "" : " no-tag"}">${it.name}</span>
    </div>
    <div class="row2">
      <span class="qty">個数：<b>${it.qty}</b></span>
      <div class="actions">
        <button class="btn plus">＋</button>
        <button class="btn minus">－</button>
      </div>
    </div>
    <div class="row3">次回補充：${mmdd(it.nextRefillAt)}</div>
  </div>`;
}

async function render() {
  const root = document.getElementById("app")!;
  const items = await storage.getItems();
  const groups: Record<string, any[]> = { "キッチン": [], "洗面・トイレ": [] };
  for (const it of items) groups[it.category].push(it);
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.name.localeCompare(b.name, "ja-JP"));

  root.innerHTML = `
    <div class="offline ${navigator.onLine ? "hide" : ""}">オフライン閲覧中</div>
    <h2 class="cat">【キッチン】</h2>
    ${groups["キッチン"].map(cardHTML).join("")}
    <h2 class="cat">【洗面・トイレ】</h2>
    ${groups["洗面・トイレ"].map(cardHTML).join("")}
  `;

  // ＋／−（オフライン時は無効）
  root.querySelectorAll<HTMLButtonElement>(".plus").forEach((btn) => {
    if (!navigator.onLine) { btn.disabled = true; return; }
    btn.onclick = async (e) => {
      await askPushOnce(); // 許可プロンプトは最初のタップ時だけ
      const id = (e.currentTarget as HTMLElement).closest(".card")!.getAttribute("data-id")!;
      await storage.adjustQty(id, +1);
      render();
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".minus").forEach((btn) => {
    if (!navigator.onLine) { btn.disabled = true; return; }
    btn.onclick = async (e) => {
      await askPushOnce();
      const id = (e.currentTarget as HTMLElement).closest(".card")!.getAttribute("data-id")!;
      await storage.adjustQty(id, -1);
      render();
    };
  });
}

(async () => {
  await seedIfEmpty(PRESETS);
  await render();
})();

// --- OneSignal 初期化（App ID は Replit Secret 経由）---
declare global { interface Window { OneSignal: any } }
window.OneSignal = window.OneSignal || [];
window.OneSignal.push(function () {
  window.OneSignal.init({
    // Replit の Secret に VITE_ONESIGNAL_APP_ID を作成して値を入れる
    appId: import.meta.env.VITE_ONESIGNAL_APP_ID as string,
    allowLocalhostAsSecureOrigin: true,
    promptOptions: { slidedown: { enabled: true } },
  });
});