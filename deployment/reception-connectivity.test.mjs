import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

// Run against the exact TypeScript that the deploy patch generates, not a copy
// of the connection logic. The effect has no TS-specific syntax after removing
// its harmless Window type assertions.
const source = readFileSync(new URL("../next-app/reception-app/src/App.tsx", import.meta.url), "utf8");
const marker = "// navigator.onLine is only a hint on school Wi-Fi";
const markerAt = source.indexOf(marker);
assert.ok(markerAt >= 0, "reviewed connectivity patch must be applied to deployed App.tsx");
const start = source.lastIndexOf("  useEffect(()=>{", markerAt);
const end = source.indexOf("  },[]);", markerAt);
assert.ok(start >= 0 && end > start, "locate the deployed network-status effect");
const effect = source.slice(start, end + "  },[]);".length)
  .replaceAll("window as Window & {__qrReceptionNetworkVerified?:boolean}", "window");

test("a single missed Firestore probe or browser offline event does not flip the status", async () => {
  const listeners = new Map();
  const statuses = [];
  const readyEvents = [];
  const requests = [];
  let tick = null;
  let nextResult = "success";
  let now = 100000;
  let status = false;
  const win = {
    location: {origin: "https://koken-web.github.io"},
    fetch: async (url, options) => {
      requests.push({url, options});
      if (nextResult === "failure") throw new Error("intermittent blocked Wi-Fi");
      return {type:"opaque"};
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: callback => {tick = callback; return 2;},
    clearInterval: () => {tick = null;},
    addEventListener: (name, callback) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
    dispatchEvent: event => {readyEvents.push(event.type); return true;},
  };
  let registeredEffect = null;
  new Function("useEffect", "window", "document", "setOnline", "Date", "Event", "AbortController", effect)(
    callback => {registeredEffect = callback;},
    win,
    {visibilityState: "visible", addEventListener(){}, removeEventListener(){}},
    value => {status = value;statuses.push(value);},
    {now: () => now},
    Event,
    AbortController
  );
  assert.equal(typeof registeredEffect, "function");
  const cleanup = registeredEffect();
  const flush = async () => {await Promise.resolve(); await new Promise(resolve=>setImmediate(resolve));};
  await flush();
  assert.equal(status, true);
  assert.deepEqual(readyEvents, ["qr-reception-network-ready"]);
  assert.equal(requests[0].options.mode, "no-cors");
  assert.equal(requests[0].options.cache, "no-store");

  nextResult = "failure";
  for (const name of ["offline", "online", "focus"]) {
    for (const listener of listeners.get(name) ?? []) listener();
    await flush();
    assert.equal(status, true, name + " must not immediately mark the app offline");
  }

  // Even repeated browser events in a short burst must not bypass the grace period.
  now += 10000;
  tick();
  await flush();
  assert.equal(status, true);
  now += 10000;
  tick();
  await flush();
  assert.equal(status, false, "sustained consecutive failures mark the app offline");

  nextResult = "success";
  now += 10000;
  tick();
  await flush();
  assert.equal(status, true, "one genuine successful probe restores online");
  assert.equal(readyEvents.length, 2, "reconnection wakes the upload queue once");

  nextResult = "failure";
  now += 10000;
  tick();
  await flush();
  assert.equal(status, true, "the failure count resets after successful reconnection");

  cleanup();
  assert.equal(tick, null);
});

test("network events must never directly set status without a probe", () => {
  assert.match(effect, /const update=\(\)=>\{void probe\(\);\};/);
  assert.doesNotMatch(effect, /const update=\(\)=>\{setOnline/);
  assert.match(effect, /consecutiveFailures>=3/);
  assert.match(effect, /Date\.now\(\)-firstFailureAt>=15000/);
});

test("a transient browser offline notification cannot cancel a verified reception approval", () => {
  const marker = "const readCachedApproval=()=>{";
  const at = source.indexOf(marker);
  assert.ok(at >= 0, "registration logic is present in the deployed app");
  const start = source.lastIndexOf("  useEffect(()=>{", at);
  const end = source.indexOf("  },[]);", at);
  assert.ok(start >= 0 && end > start, "registration subscription effect is present");
  const registration = source.slice(start, end + "  },[]);".length);
  assert.doesNotMatch(registration, /handleOffline=\(\)=>applyRegistration\(null\)/,
    "browser connectivity is not a registration revocation");
  assert.doesNotMatch(registration, /addEventListener\("offline",handleOffline\)/);
  assert.match(registration, /if\(incoming\?\.approved===true\)/,
    "a server-verified approval is cached even if the last terminal heartbeat was offline");
  assert.doesNotMatch(registration, /setOnline\(false\)/,
    "Firebase subscription timeouts cannot reset the online status badge");
  assert.doesNotMatch(registration, /setOnline\(value\.status/,
    "last terminal heartbeat status is not an authoritative connectivity check");
  const writes = [...source.matchAll(/setOnline\(/g)].length;
  assert.equal(writes, 2, "only the debounced connectivity effect sets online/offline");
});
