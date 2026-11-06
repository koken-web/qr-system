/* Only public application files are cached here. Ticket data stays in the app's database. */
const APP = '__APP__';
const CACHE = `qr-ticket-${APP}-shell-__VERSION__`;
const BASE = new URL('./', self.location.href);
const INDEX = new URL('index.html', BASE).href;
const MANIFEST = new URL('offline-assets.json', BASE).href;

function belongsToApp(url) {
  return url.origin === BASE.origin && url.pathname.startsWith(BASE.pathname)
    && !(APP === 'reception' && ['control/', 'management-app/'].some(path => url.pathname.startsWith(BASE.pathname + path)));
}

async function fetchFile(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {cache: 'reload', signal: controller.signal});
    if (!response.ok || response.redirected) throw new Error('アプリの保存に失敗しました');
    return response;
  } finally { clearTimeout(timer); }
}

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try {
    const manifest = await fetchFile(MANIFEST);
    const paths = await manifest.clone().json();
    if (!Array.isArray(paths) || !paths.includes('index.html')) throw new Error('保存用ファイル一覧が不正です');
    // Limit parallel requests on iPad and constrained networks.
    let cursor = 0;
    await Promise.all(Array.from({length: 4}, async () => {
      while (cursor < paths.length) {
        const url = new URL(paths[cursor++], BASE);
        if (!belongsToApp(url)) throw new Error('保存先がアプリの範囲外です');
        await cache.put(url.href, await fetchFile(url.href));
      }
    }));
    await cache.put(MANIFEST, manifest);
    await self.skipWaiting();
  } catch (error) {
    // Keep the previous complete version if an update cannot be fully downloaded.
    await caches.delete(CACHE);
    throw error;
  }
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (name.startsWith(`qr-ticket-${APP}-shell-`) && name !== CACHE) await caches.delete(name);
  }
  await self.clients.claim();
})()));

self.addEventListener('message', event => {
  if (event.data?.type !== 'OFFLINE_STATUS') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const manifest = await cache.match(MANIFEST);
    const paths = manifest ? await manifest.json() : [];
    const ready = paths.length > 0 && (await Promise.all(paths.map(path => cache.match(new URL(path, BASE).href)))).every(Boolean);
    event.ports?.[0]?.postMessage({ready, app: APP, version: CACHE});
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !belongsToApp(url)) return;
  const isEntry = request.mode === 'navigate' && [BASE.pathname, BASE.pathname + 'index.html'].includes(url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // No network wait: Wi-Fi may remain "online" while GitHub Pages is blocked.
    const saved = await cache.match(isEntry ? INDEX : url.href);
    if (saved) return saved;
    try { return await fetchFile(request.url); }
    catch {
      return new Response(isEntry ? 'この端末にはまだ画面が保存されていません。自宅など接続できる回線でオフライン準備を完了してください。' : '', {
        status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
      });
    }
  })());
});
