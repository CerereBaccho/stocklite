(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))e(a);new MutationObserver(a=>{for(const s of a)if(s.type==="childList")for(const i of s.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&e(i)}).observe(document,{childList:!0,subtree:!0});function n(a){const s={};return a.integrity&&(s.integrity=a.integrity),a.referrerPolicy&&(s.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?s.credentials="include":a.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function e(a){if(a.ep)return;a.ep=!0;const s=n(a);fetch(a.href,s)}})();const x="stocklite",h="items",A=1;function E(){return new Promise((t,r)=>{const n=indexedDB.open(x,A);n.onupgradeneeded=()=>{const e=n.result;e.objectStoreNames.contains(h)||e.createObjectStore(h,{keyPath:"id"}).createIndex("by_category_name",["category","name"],{unique:!1})},n.onsuccess=()=>t(n.result),n.onerror=()=>r(n.error)})}async function c(t,r){const n=await E();return new Promise((e,a)=>{const s=n.transaction(h,t),i=s.objectStore(h);r(i).then(l=>{s.oncomplete=()=>e(l),s.onerror=()=>a(s.error),s.onabort=()=>a(s.error)}).catch(a)})}function u(){return new Date().toISOString()}function R(){return`i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`}async function g(t,r){return new Promise((n,e)=>{const a=t.get(r);a.onsuccess=()=>n(a.result),a.onerror=()=>e(a.error)})}async function D(t){return new Promise((r,n)=>{const e=t.getAll();e.onsuccess=()=>r(e.result),e.onerror=()=>n(e.error)})}function m(t,r){return new Promise((n,e)=>{const a=t.put(r);a.onsuccess=()=>n(),a.onerror=()=>e(a.error)})}function N(t,r){return new Promise((n,e)=>{const a=t.delete(r);a.onsuccess=()=>n(),a.onerror=()=>e(a.error)})}const d={async getItems(){return c("readonly",async t=>await D(t))},async adjustQty(t,r){return c("readwrite",async n=>{const e=await g(n,t);if(!e)return;const a=Math.max(0,(e.qty||0)+(r||0)),s={...e,qty:a,updatedAt:u(),version:e.version??1,deleted:e.deleted??!1};await m(n,s)})},async addItem(t){return c("readwrite",async r=>{const n={id:R(),name:(t.name||"").trim(),category:t.category,qty:Math.max(0,Math.min(999,t.qty||0)),threshold:Math.max(0,Math.min(999,t.threshold||0)),lastRefillAt:"",nextRefillAt:"",updatedAt:u(),deleted:!1,version:1};return await m(r,n),n})},async updateThreshold(t,r){return c("readwrite",async n=>{const e=await g(n,t);if(!e)return;const a={...e,threshold:Math.max(0,Math.min(999,r||0)),updatedAt:u(),version:e.version??1,deleted:e.deleted??!1};await m(n,a)})},async updateItem(t,r){return c("readwrite",async n=>{const e=await g(n,t);if(!e)return;const a={...e,name:(r.name||"").trim(),category:r.category,qty:Math.max(0,Math.min(999,r.qty||0)),threshold:Math.max(0,Math.min(999,r.threshold||0)),updatedAt:u(),version:e.version??1,deleted:e.deleted??!1};await m(n,a)})},async deleteItem(t){return c("readwrite",async r=>{await N(r,t)})}};async function _(t){(await d.getItems()).length>0||await c("readwrite",async n=>{for(const e of t){const a={id:e.id,name:e.name,category:e.category,qty:e.qty,threshold:e.threshold,lastRefillAt:e.lastRefillAt??"",nextRefillAt:e.nextRefillAt??"",updatedAt:e.updatedAt??u(),deleted:e.deleted??!1,version:e.version??1};await m(n,a)}})}const b=new Date().toISOString(),o=(t,r,n=1)=>({id:crypto.randomUUID(),name:t,qty:1,threshold:n,lastRefillAt:b,nextRefillAt:"",updatedAt:b,deleted:!1,version:1,category:r}),k=[o("トイレットペーパー","キッチン"),o("キッチンペーパー","キッチン"),o("ラップ","キッチン"),o("食器洗剤","キッチン"),o("スポンジ","キッチン"),o("排水溝ネット","キッチン"),o("歯磨き粉","洗面・トイレ"),o("シャンプー","洗面・トイレ"),o("ボディソープ","洗面・トイレ"),o("トイレ用洗剤","洗面・トイレ")],j="8e78387b-2f78-4458-907e-938de4df59f6",v="/stocklite/",P="/stocklite/OneSignalSDKWorker.js",T="/stocklite/OneSignalSDKUpdaterWorker.js",W=t=>{if(!t)return"--/--";const r=new Date(t);return isNaN(+r)?"--/--":`${String(r.getMonth()+1).padStart(2,"0")}/${String(r.getDate()).padStart(2,"0")}`};function B(t){const r={キッチン:[],"洗面・トイレ":[]};for(const n of t)r[n.category].push(n);for(const n of Object.keys(r))r[n].sort((e,a)=>e.name.localeCompare(a.name,"ja-JP"));return r}function S(t){const r=t.qty<=t.threshold;return`
  <div class="card" data-id="${t.id}">
    <div class="row1">
      ${r?'<span class="tag danger">要補充</span>':""}
      <span class="item-name ${r?"":"no-tag"}">${t.name}</span>
    </div>
    <div class="row2">
      <span class="qty">個数：<b>${t.qty}</b></span>
      <div class="actions">
        <button class="btn minus" data-id="${t.id}" data-delta="-1" type="button">－</button>
        <button class="btn plus"  data-id="${t.id}" data-delta="1"  type="button">＋</button>
      </div>
    </div>
    <div class="row3">次回補充：${W(t.nextRefillAt)}</div>
  </div>`}function H(){return`
    <div class="headerbar">
      <div class="title">StockLite</div>
      <button id="btn-go-edit" class="btn" type="button">編集</button>
    </div>
  `}async function U(){const t=document.getElementById("app"),r=await d.getItems(),n=B(r);t.innerHTML=`
    ${H()}
    <div class="offline ${navigator.onLine?"hide":""}">オフライン閲覧中</div>

    <h2 class="cat">【キッチン】</h2>
    ${n.キッチン.map(S).join("")||'<div class="empty">なし</div>'}
    <h2 class="cat">【洗面・トイレ】</h2>
    ${n["洗面・トイレ"].map(S).join("")||'<div class="empty">なし</div>'}
  `}function C(){return`
    <div class="headerbar">
      <div class="title">編集</div>
      <div class="header-actions">
        <button id="btn-add-row" class="btn primary" type="button">新規追加</button>
        <button id="btn-done" class="btn" type="button">完了</button>
      </div>
    </div>
  `}function K(t){return`
  <div class="edit-row" data-id="${t.id}">
    <input class="ed-name" type="text" value="${X(t.name)}" placeholder="名前" />
    <select class="ed-cat">
      <option value="キッチン" ${t.category==="キッチン"?"selected":""}>キッチン</option>
      <option value="洗面・トイレ" ${t.category==="洗面・トイレ"?"selected":""}>洗面・トイレ</option>
    </select>
    <input class="ed-qty" type="number" min="0" max="999" value="${t.qty??0}" />
    <input class="ed-th"  type="number" min="0" max="999" value="${t.threshold??0}" />
    <button class="btn save" type="button">保存</button>
    <button class="btn danger del" type="button">削除</button>
  </div>`}function F(){return`
  <form id="form-add-inline" class="edit-row add">
    <input name="name" type="text" placeholder="（新規）名前" required />
    <select name="category">
      <option value="キッチン">キッチン</option>
      <option value="洗面・トイレ">洗面・トイレ</option>
    </select>
    <input name="qty" type="number" min="0" max="999" value="0" />
    <input name="threshold" type="number" min="0" max="999" value="0" />
    <button class="btn primary" type="submit">追加</button>
    <button class="btn ghost" type="reset">クリア</button>
  </form>`}async function y(){const t=document.getElementById("app"),r=await d.getItems();r.sort((n,e)=>n.category===e.category?n.name.localeCompare(e.name,"ja-JP"):n.category.localeCompare(e.category,"ja-JP")),t.innerHTML=`
    ${C()}
    <div class="edit-panel">
      ${F()}
      <div class="edit-list">
        <div class="edit-head">
          <span>名前</span><span>カテゴリ</span><span>個数</span><span>閾値</span><span></span><span></span>
        </div>
        ${r.map(K).join("")||'<div class="empty">アイテムがありません</div>'}
      </div>
    </div>
  `}function J(){return location.hash==="#/edit"?"edit":"view"}async function f(){J()==="edit"?await y():await U()}const q="sl_push_prompted_once";let w=!1;function Q(){if(!w&&localStorage.getItem(q)!=="1"){w=!0;try{const t=Notification?.requestPermission;typeof t=="function"&&(t(),localStorage.setItem(q,"1"))}finally{w=!1}}}let M=null,O;const G=new Promise(t=>{O=t});async function L(){try{if(Notification?.permission!=="granted")return;const r=(M??await G)?.User?.PushSubscription;if(!r||r.optedIn===!0)return;await r.optIn()}catch{}}async function V(){if("serviceWorker"in navigator)try{(await navigator.serviceWorker.getRegistrations()).some(n=>n.scope.includes(v))||await navigator.serviceWorker.register(P,{scope:v})}catch{}}function Y(){return new Promise(t=>{try{window.OneSignalDeferred=window.OneSignalDeferred||[],window.OneSignalDeferred.push(async r=>{try{await r.init({appId:j,serviceWorkerPath:P,serviceWorkerUpdaterPath:T,serviceWorkerParam:{scope:v},promptOptions:{slidedown:{enabled:!1}}}),M=r,O(r),t()}catch{t()}})}catch{t()}})}let I=!1;function z(){if(I)return;const t=document.getElementById("app");t&&(t.addEventListener("click",r=>{const n=r.target;if(n){if(n.classList.contains("btn")&&(n.classList.contains("plus")||n.classList.contains("minus"))){Q();try{L()}catch{}const e=n.dataset.id,a=Number(n.dataset.delta||0);if(!e||!a)return;(async()=>(await d.adjustQty(e,a),await f()))();return}if(n.id==="btn-go-edit"){location.hash="#/edit";return}if(n.id==="btn-done"){location.hash="";return}if(n.classList.contains("save")){const e=n.closest(".edit-row");if(!e)return;const a=e.dataset.id,s=e.querySelector(".ed-name").value.trim(),i=e.querySelector(".ed-cat").value,l=p(e.querySelector(".ed-qty").value,0,999),$=p(e.querySelector(".ed-th").value,0,999);if(!s)return alert("名前を入力してください");(async()=>(await d.updateItem(a,{name:s,category:i,qty:l,threshold:$}),await y()))();return}if(n.classList.contains("del")){const e=n.closest(".edit-row");if(!e)return;const a=e.dataset.id;if(!confirm("削除してよろしいですか？（元に戻せません）"))return;(async()=>(await d.deleteItem(a),await y()))();return}if(n.id==="btn-add-row"){const e=document.getElementById("form-add-inline");e&&e.querySelector('input[name="name"]')?.focus();return}}},{capture:!1,passive:!1}),t.addEventListener("submit",r=>{const n=r.target;if(!n||n.id!=="form-add-inline")return;r.preventDefault();const e=new FormData(n),a=String(e.get("name")||"").trim(),s=String(e.get("category")||"キッチン"),i=p(String(e.get("qty")||"0"),0,999),l=p(String(e.get("threshold")||"0"),0,999);a&&(async()=>(await d.addItem({name:a,category:s,qty:i,threshold:l}),n.reset(),await y()))()},{capture:!1}),I=!0)}function p(t,r,n){const e=typeof t=="number"?t:Number(t);return Number.isNaN(e)?r:Math.max(r,Math.min(n,Math.trunc(e)))}function X(t){return t.replace(/[&<>"']/g,r=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[r])}(async()=>(await _(k),await f(),z(),await V(),await Y(),L(),window.addEventListener("hashchange",()=>{f()}),window.addEventListener("online",()=>{f()}),window.addEventListener("offline",()=>{f()})))();
