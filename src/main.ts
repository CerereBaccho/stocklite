// ====== OneSignal 手動許可 & 診断ユーティリティ ======
declare global { interface Window { OneSignal: any } }
window.OneSignal = window.OneSignal || [];

// ←← ここが今回の「更新確認用」ビルドタグ（適当に更新してOK）
const BUILD_TAG = "build: 2025-08-09 12:34 JST";

function isFn(x: any): x is Function { return typeof x === "function"; }

// OneSignal 初期化（GitHub Pagesのサブパス対応）
function initOneSignal() {
  return new Promise<void>((resolve) => {
    window.OneSignal.push(() => {
      window.OneSignal.init({
        appId: "8e78387b-2f78-4458-907e-938de4df59f6", // ←置換
        serviceWorkerPath: '/stocklite/OneSignalSDKWorker.js',
        serviceWorkerUpdaterPath: '/stocklite/OneSignalSDKUpdaterWorker.js',
        serviceWorkerParam: { scope: '/stocklite/' },
        promptOptions: { slidedown: { enabled: false } } // 自動出現はOFF、手動で叩く
      });
      resolve();
    });
  });
}

// 手動で許可UIを出す（Slidedown→新API→旧API→ネイティブの順）
async function promptPushManually() {
  try {
    if (window.OneSignal?.Slidedown?.promptPush) { await window.OneSignal.Slidedown.promptPush(); return; }
  } catch {}
  try {
    if (window.OneSignal?.Notifications?.requestPermission) { await window.OneSignal.Notifications.requestPermission(); return; }
  } catch {}
  try {
    if (window.OneSignal?.registerForPushNotifications) { await window.OneSignal.registerForPushNotifications(); return; }
  } catch {}
  try {
    if ("Notification" in window && isFn((Notification as any).requestPermission)) { await (Notification as any).requestPermission(); return; }
  } catch {}
}

// 画面内に診断情報を描画（iPhoneでコンソール見にくい対策）
async function renderDiag() {
  const box = document.getElementById("diag")!;
  const perm = (typeof Notification !== "undefined" && "permission" in Notification) ? Notification.permission : "n/a";
  const origin = location.origin;
  const pathname = location.pathname;
  let onesignalLoaded = !!window.OneSignal;
  let osInitDone = false;
  let subscribed = "n/a";
  try {
    if (window.OneSignal?.User?.PushSubscription?.optedIn != null) {
      subscribed = String(window.OneSignal.User.PushSubscription.optedIn);
      osInitDone = true;
    } else if (window.OneSignal?.isPushNotificationsEnabled) {
      subscribed = String(await window.OneSignal.isPushNotificationsEnabled());
      osInitDone = true;
    }
  } catch {}

  // SW一覧
  let swLines: string[] = [];
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    swLines = regs.map(r => `- scope: ${r.scope}`);
  } catch {}

  box.textContent =
`[DIAG]
${BUILD_TAG}
origin: ${origin}
pathname: ${pathname}
Notification.permission: ${perm}
OneSignal loaded: ${onesignalLoaded}
OneSignal initDone: ${osInitDone}
Subscribed: ${subscribed}
SW registrations:
${swLines.length ? swLines.join("\n") : "- (none)"}
`;
  const badge = document.getElementById("perm-badge")!;
  badge.textContent = `権限: ${perm}`;
}

// ====== 在庫アプリ（既存） ======
import { seedIfEmpty, storage } from "./storage/db";
import { PRESETS } from "./presets";

const mmdd = (iso?: string) => {
  if (!iso) return "--/--";
  const d = new Date(iso);
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
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

async function renderUI() {
  const root = document.getElementById("app")!;
  const items = await storage.getItems();
  const groups: Record<string, any[]> = { "キッチン": [], "洗面・トイレ": [] };
  for (const it of items) groups[it.category].push(it);
  for (const k of Object.keys(groups)) groups[k].sort((a,b)=> a.name.localeCompare(b.name,'ja-JP'));

  root.innerHTML = `
    <div class="offline ${navigator.onLine ? "hide" : ""}">オフライン閲覧中</div>
    <h2 class="cat">【キッチン】</h2>
    ${groups["キッチン"].map(cardHTML).join("")}
    <h2 class="cat">【洗面・トイレ】</h2>
    ${groups["洗面・トイレ"].map(cardHTML).join("")}
  `;

  root.querySelectorAll<HTMLButtonElement>(".plus").forEach(btn=>{
    if (!navigator.onLine) { btn.disabled = true; return; }
    btn.onclick = async (e)=>{
      const id = (e.currentTarget as HTMLElement).closest(".card")!.getAttribute("data-id")!;
      await storage.adjustQty(id, +1);
      renderUI(); renderDiag();
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".minus").forEach(btn=>{
    if (!navigator.onLine) { btn.disabled = true; return; }
    btn.onclick = async (e)=>{
      const id = (e.currentTarget as HTMLElement).closest(".card")!.getAttribute("data-id")!;
      await storage.adjustQty(id, -1);
      renderUI(); renderDiag();
    };
  });
}

// ====== 起動フロー ======
(async () => {
  await seedIfEmpty(PRESETS);
  await initOneSignal();
  await renderUI();
  await renderDiag();

  // 手動許可ボタン
  const btn = document.getElementById("enable-push")!;
  btn.addEventListener("click", async () => {
    await promptPushManually();
    await renderDiag();
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification("StockLite", { body: "ローカル通知テスト" }); } catch {}
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          if (regs[0]) regs[0].showNotification("StockLite", { body: "SW通知テスト" });
        } catch {}
      }
    } catch {}
  });
})();