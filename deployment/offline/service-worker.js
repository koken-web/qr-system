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
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {cache: 'reload', signal: controller.signal});
        if (!response.ok || response.redirected) throw new Error('アプリの保存に失敗しました');
        // A response may arrive before its body stalls. Do not declare the
        // download finished (or clear the timeout) after headers alone.
        const body = await response.arrayBuffer();
        const headers = new Headers(response.headers);
        headers.delete('content-encoding'); headers.delete('content-length');
        return new Response(body, {status: response.status, statusText: response.statusText, headers});
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {controller.abort(); reject(new Error('アプリの保存がタイムアウトしました'));}, 15000);
      })
    ]);
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
  const previous=(await caches.keys()).filter(name=>name.startsWith(`qr-ticket-${APP}-shell-`) && name!==CACHE);
  let retained=false;
  for (const name of previous.reverse()) {
    // An already-open tab may still import a chunk from the previous build.
    // Keep one usable previous shell; discard empty legacy readiness caches.
    const cache=await caches.open(name);
    if(!retained && await cache.match(INDEX)){retained=true;continue;}
    await caches.delete(name);
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
    if(!isEntry && url.pathname.startsWith(BASE.pathname+'assets/')){
      for(const name of (await caches.keys()).reverse()){
        if(name===CACHE || !name.startsWith(`qr-ticket-${APP}-shell-`))continue;
        const previous=await (await caches.open(name)).match(url.href);
        if(previous)return previous;
      }
    }
    try { return await fetchFile(request.url); }
    catch {
      return new Response(isEntry ? 'この端末にはまだ画面が保存されていません。オンラインで一度、このアプリを開いてから再試行してください。' : '', {
        status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
      });
    }
  })());
});
