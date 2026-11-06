import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const template = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
const startup = readFileSync(new URL('./offline-setup.js', import.meta.url), 'utf8');

for (const path of ['/qr-system/', '/qr-system/control/']) {
  for (const state of ['loading', 'complete']) {
    test(`${path}: normal ${state} startup automatically saves its own app without a setup screen`, () => {
      const calls = [], listeners = {};
      vm.runInNewContext(startup, {
        URL, console,
        document: {currentScript: {src: `https://koken-web.github.io${path}offline-setup.js`}, readyState: state},
        window: {addEventListener: (type, callback, options) => {assert.equal(options.once, true); listeners[type] = callback;}},
        navigator: {serviceWorker: {register: (url, options) => {calls.push({url, scope: options.scope,updateViaCache:options.updateViaCache}); return Promise.resolve({});}}}
      });
      if (state === 'loading') {assert.equal(calls.length, 0); listeners.load();}
      assert.deepEqual(calls, [{url: `https://koken-web.github.io${path}sw.js`, scope: path,updateViaCache:'none'}]);
    });
  }
}

test('unsupported browsers still start without an offline setup prompt', () => {
  assert.doesNotThrow(() => vm.runInNewContext(startup, {navigator: {}}));
});

test('offline registration failure is handled without replacing the app screen', async () => {
  const warnings = [];
  vm.runInNewContext(startup, {
    URL, console: {warn: (...args) => warnings.push(args)},
    document: {currentScript: {src: 'https://koken-web.github.io/qr-system/offline-setup.js'}, readyState: 'complete'},
    navigator: {serviceWorker: {register: () => Promise.reject(Error('offline'))}}
  });
  await Promise.resolve();
  assert.equal(warnings.length, 1);
});

function harness(app = 'reception', version = 'test', {manualClock=false}={}) {
  const base = `https://koken-web.github.io/qr-system/${app === 'management' ? 'control/' : ''}`;
  const handlers = {}, storage = new Map(), calls = [], timers=new Map();
  let timerId=0;
  const files = ['index.html', 'assets/app.js', 'assets/lazy.js', 'sounds/ok.wav', 'icons/app.png'];
  let fetcher = async url => new Response(url.endsWith('offline-assets.json') ? JSON.stringify(files) : `saved:${url}`);
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name);
      return {match: async key => entries.get(String(key))?.clone(), put: async (key, value) => entries.set(String(key), value.clone())};
    },
    async keys() {return [...storage.keys()];},
    async delete(key) {return storage.delete(key);}
  };
  const self = {location: {href: base + 'sw.js'}, addEventListener: (type, fn) => {handlers[type] = fn;}, skipWaiting: async () => {}, clients: {claim: async () => {}}};
  vm.runInNewContext(template.replace('__APP__', app).replace('__VERSION__', version), {
    self, caches, URL, Response, Headers, AbortController,
    setTimeout:manualClock?fn=>{timers.set(++timerId,fn);return timerId;}:setTimeout,
    clearTimeout:manualClock?id=>timers.delete(id):clearTimeout,
    fetch: async (url, options) => {calls.push(String(url)); return fetcher(String(url), options);}
  });
  async function lifecycle(type) {
    let pending;
    handlers[type]({waitUntil: promise => {pending = promise;}});
    await pending;
  }
  function request(path = '', mode = 'navigate', method = 'GET') {
    let pending;
    handlers.fetch({request: {url: new URL(path, base).href, mode, method}, respondWith: promise => {pending = promise;}});
    return pending;
  }
  return {base, caches, files, calls, handlers, storage, lifecycle, request, fireTimers:()=>{for(const fn of timers.values())fn();timers.clear();},setFetch: fn => {fetcher = fn;}};
}

for (const app of ['reception', 'management']) {
  test(`${app}: offline navigation and query URLs use saved HTML without any network`, async () => {
    const h = harness(app);
    await h.lifecycle('install'); await h.lifecycle('activate');
    h.calls.length = 0;
    h.setFetch(() => {throw Error('school Wi-Fi blocks this host');});
    for (const path of ['', 'index.html', '?reserve-print=event-1']) {
      const r = await h.request(path);
      assert.equal(r.status, 200); assert.match(await r.text(), /saved:.*index.html/);
    }
    for (const path of h.files.slice(1)) assert.equal((await h.request(path, 'cors')).status, 200);
    assert.deepEqual(h.calls, []);
  });
  test(`${app}: a hanging or HTTP 403 network cannot delay a saved launch`, async () => {
    const h = harness(app); await h.lifecycle('install');
    h.setFetch(() => new Promise(() => {}));
    let timer;
    try {
      assert.equal((await Promise.race([h.request(), new Promise((_, reject) => {timer = setTimeout(() => reject(Error('navigation stalled')), 100);})])).status, 200);
    } finally {clearTimeout(timer);}
    h.setFetch(async () => new Response('blocked', {status: 403}));
    assert.equal((await h.request()).status, 200);
  });
}

test('reception never intercepts management or Firebase requests', () => {
  const h = harness();
  assert.equal(h.request('control/'), undefined);
  assert.equal(h.request('control/assets/app.js', 'cors'), undefined);
  assert.equal(h.request('https://firestore.googleapis.com/data', 'cors'), undefined);
  assert.equal(h.request('', 'cors', 'POST'), undefined);
});

test('a missing precache file rejects installation and preserves the previous complete cache', async () => {
  const h = harness();
  const old = await h.caches.open('qr-ticket-reception-shell-old');
  await old.put(h.base + 'index.html', new Response('old complete app'));
  h.setFetch(async url => url.endsWith('offline-assets.json') ? new Response(JSON.stringify(h.files)) : new Response('missing', {status: 404}));
  await assert.rejects(h.lifecycle('install'));
  assert.deepEqual(await h.caches.keys(), ['qr-ticket-reception-shell-old']);
  assert.equal(await (await old.match(h.base + 'index.html')).text(), 'old complete app');
});

test('activation removes only obsolete shells for its own app', async () => {
  const h = harness();
  for (const name of ['qr-ticket-reception-shell-old', 'qr-ticket-management-shell-old', 'other-app']) await h.caches.open(name);
  await h.lifecycle('install'); await h.lifecycle('activate');
  assert.deepEqual((await h.caches.keys()).sort(), ['other-app', 'qr-ticket-management-shell-old', 'qr-ticket-reception-shell-test']);
});

test('readiness is true only while every precached dependency is available', async () => {
  const h = harness();
  async function status() {
    let pending, result;
    h.handlers.message({data: {type: 'OFFLINE_STATUS'}, ports: [{postMessage: value => {result = value;}}], waitUntil: promise => {pending = promise;}});
    await pending; return result;
  }
  assert.equal((await status()).ready, false);
  await h.lifecycle('install'); assert.equal((await status()).ready, true);
  h.storage.get('qr-ticket-reception-shell-test').delete(h.base + 'assets/lazy.js');
  assert.equal((await status()).ready, false);
});

test('precache cannot include the other app or external data', async () => {
  for (const path of ['control/index.html', 'https://firestore.googleapis.com/private']) {
    const h = harness();
    h.setFetch(async () => new Response(JSON.stringify(['index.html', path])));
    await assert.rejects(h.lifecycle('install'));
  }
});

test('updates retain one complete previous build for lazy imports from already-open tabs',async()=>{
  const h=harness('management');
  const oldest=await h.caches.open('qr-ticket-management-shell-oldest');
  await oldest.put(h.base+'index.html',new Response('obsolete HTML'));
  const previous=await h.caches.open('qr-ticket-management-shell-previous');
  await previous.put(h.base+'index.html',new Response('previous HTML'));
  await previous.put(h.base+'assets/old-lazy.js',new Response('previous chunk'));
  await h.caches.open('qr-ticket-management-shell-v1');
  await h.lifecycle('install');await h.lifecycle('activate');
  assert.deepEqual((await h.caches.keys()).sort(),['qr-ticket-management-shell-previous','qr-ticket-management-shell-test']);
  h.calls.length=0;h.setFetch(()=>{throw Error('offline');});
  assert.equal(await (await h.request('assets/old-lazy.js','cors')).text(),'previous chunk');
  assert.notEqual(await (await h.request()).text(),'previous HTML');
  assert.equal(h.calls.length,0);
});

test('a body stalled after successful HTTP headers times out and preserves the existing build',async()=>{
  const h=harness('reception','test',{manualClock:true});
  const old=await h.caches.open('qr-ticket-reception-shell-old');
  await old.put(h.base+'index.html',new Response('previous complete app'));
  h.setFetch(async()=>({ok:true,redirected:false,status:200,statusText:'OK',headers:new Headers(),arrayBuffer:()=>new Promise(()=>{})}));
  const installing=h.lifecycle('install');
  for(let i=0;i<8;i++)await Promise.resolve();
  h.fireTimers();
  await assert.rejects(installing,/タイムアウト/);
  assert.deepEqual(await h.caches.keys(),['qr-ticket-reception-shell-old']);
});
