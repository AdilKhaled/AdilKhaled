/* ═══════════════════════════════════════════════════════════
   سند العقارية — ملف الإشعارات (Service Worker)
   ينرفع بجذر الموقع باسم sw.js (نفس مكان index.html).

   وظيفته:
   · استلام إشعارات الدفع (Web Push) وعرضها على التلفون حتى لو النظام مسكّر.
   · الضغط على الإشعار يفتح النظام (أو يرجّعك له لو كان مفتوح) ويوصّلك للتبويب المطلوب.
   · لو المتصفح بدّل اشتراك الجهاز بصمت (تحديث كروم · مسح بيانات) يعيد الاشتراك ويبلّغ النظام يحفظه.
   · ما يخزّن صفحات النظام — حتى ما تطلع نسخة قديمة بعد كل تحديث.
   ═══════════════════════════════════════════════════════════ */
const APP_URL = '/';
const ICON    = '/apple-touch-icon.png';   // نفس أيقونة التطبيق

self.addEventListener('install',  () => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

// الحمولة ممكن تجي JSON {title, body, url, tab, tag, icon, data} أو نص عادي أو {notification:{…}}
function parsePush(event){
  let d = {};
  if(event.data){
    try{ d = event.data.json(); }
    catch(e){ try{ d = { body: event.data.text() }; }catch(_){ d = {}; } }
  }
  if(!d || typeof d !== 'object') d = { body: String(d ?? '') };
  if(d.notification && typeof d.notification === 'object') d = Object.assign({}, d, d.notification);
  return d;
}

self.addEventListener('push', event => {
  const d = parsePush(event);
  const inner = (d.data && typeof d.data === 'object') ? d.data : {};
  const data = Object.assign({}, inner, {
    url: d.url || inner.url || APP_URL,
    tab: d.tab || inner.tab || '',
    id:  d.id  || inner.id  || ''
  });
  const title = d.title || 'سند العقارية';
  const opts = {
    body: d.body || '',
    icon: d.icon || ICON,
    badge: d.badge || undefined,
    dir: 'rtl', lang: 'ar',
    tag: d.tag || ('sanad-' + (data.id || Date.now())),   // نفس الـtag يستبدل الإشعار القديم بدل ما يتكرر
    renotify: !!d.tag,
    requireInteraction: !!d.sticky,                       // يبقى على الشاشة لحد ما ينضغط (للتنبيهات المهمة)
    silent: !!d.silent,
    vibrate: d.silent ? undefined : [120, 60, 120],
    timestamp: d.ts ? +d.ts : Date.now(),
    data
  };
  // لازم نعرض إشعار بكل دفعة (userVisibleOnly) — وإلا المتصفح يوقف الاشتراك
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const d = event.notification.data || {};
  const target = new URL(d.url || APP_URL, self.location.origin);
  if(d.tab && !target.searchParams.get('tab')) target.searchParams.set('tab', d.tab);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const c of wins){
      if(new URL(c.url).origin !== self.location.origin) continue;
      try{ await c.focus(); }catch(e){}
      c.postMessage({ type: 'notif-click', data: d });   // النظام المفتوح يوصّلك للتبويب / قائمة الإشعارات
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});

// المتصفح بدّل الاشتراك (ينصير بعد تحديثات أو تنظيف) — نعيد الاشتراك بنفس المفتاح ونبلّغ النظام
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const old = event.oldSubscription;
    const key = old && old.options && old.options.applicationServerKey;
    let sub = null;
    if(key){ try{ sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); }catch(e){} }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach(c => c.postMessage({ type: 'push-resub', ok: !!sub }));
    // وإذا النظام مو مفتوح: أول ما ينفتح، pushSync يعيد الاشتراك ويحفظه بالقاعدة
  })());
});
