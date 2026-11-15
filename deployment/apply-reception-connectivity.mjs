import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

// The production URL publishes the separately reviewed, SHA-pinned app.
// Apply this narrowly scoped connectivity patch to THAT deployed checkout.
const root=resolve("next-app/reception-app/src");

function replaceOnce(source,from,to,label){
  const occurrences=source.split(from).length-1;
  if(occurrences!==1)throw new Error(label+": expected one match, got "+occurrences);
  return source.replace(from,to);
}
function lines(...items){return items.join("\n");}

const appPath=resolve(root,"App.tsx");
let app=readFileSync(appPath,"utf8");
const nativeCount=app.split("navigator.onLine").length-1;
if(nativeCount<10)throw new Error("Unexpected reception connectivity source: "+nativeCount);
app=app.replaceAll("navigator.onLine","canAttemptReceptionNetwork()");
const helper=lines(
  "function canAttemptReceptionNetwork():boolean{",
  "  return navigator.onLine || (typeof window!==\"undefined\" &&",
  "    (window as Window & {__qrReceptionNetworkVerified?:boolean}).__qrReceptionNetworkVerified===true);",
  "}",
  ""
);
app=replaceOnce(app,'type Mode="entry"|"exit";',helper+'type Mode="entry"|"exit";',"network helper");
const oldEffect=lines(
  "  useEffect(()=>{",
  "    const update=()=>setOnline(canAttemptReceptionNetwork());",
  '    window.addEventListener("online",update);',
  '    window.addEventListener("offline",update);',
  '    return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};',
  "  },[]);"
);
const newEffect=lines(
  "  useEffect(()=>{",
  "    // navigator.onLine is only a hint on school Wi-Fi and standalone iPad PWAs.",
  "    // Probe Firestore's network endpoint beyond the app service worker cache.",
  "    let active=true,probing=false,consecutiveFailures=0,firstFailureAt=0;",
  "    const probe=async()=>{",
  "      if(probing||typeof window.fetch!==\"function\"||!window.location?.origin||",
  "          (typeof document!==\"undefined\"&&document.visibilityState===\"hidden\"))return;",
  "      probing=true;",
  "      const controller=new AbortController();",
  "      const timeout=window.setTimeout(()=>controller.abort(),4500);",
  "      try{",
  "        await window.fetch(\"https://firestore.googleapis.com/?qr-reception-probe=\"+Date.now(),",
  "          {mode:\"no-cors\",cache:\"no-store\",signal:controller.signal});",
  "        if(!active)return;",
  "        // One successful probe clears the consecutive-failure window.",
  "        consecutiveFailures=0;",
  "        firstFailureAt=0;",
  "        const browser=window as Window & {__qrReceptionNetworkVerified?:boolean};",
  "        const wasReachable=browser.__qrReceptionNetworkVerified===true;",
  "        browser.__qrReceptionNetworkVerified=true;",
  "        setOnline(true);",
  "        if(!wasReachable&&typeof window.dispatchEvent===\"function\")",
  "          window.dispatchEvent(new Event(\"qr-reception-network-ready\"));",
  "      }catch{",
  "        if(active){",
  "          // Safari may briefly miss a probe even while Wi-Fi is connected.",
  "          // Keep the previous status until three failures spanning 15s.",
  "          consecutiveFailures++;",
  "          if(consecutiveFailures===1)firstFailureAt=Date.now();",
  "          if(consecutiveFailures>=3 && Date.now()-firstFailureAt>=15000){",
  "            (window as Window & {__qrReceptionNetworkVerified?:boolean}).__qrReceptionNetworkVerified=false;",
  "            setOnline(false);",
  "          }",
  "        }",
  "      }finally{window.clearTimeout(timeout);probing=false;}",
  "    };",
  "    // A browser online/offline event is only a hint: probe before changing UI.",
  "    const update=()=>{void probe();};",
  "    window.addEventListener(\"online\",update);",
  "    window.addEventListener(\"offline\",update);",
  "    window.addEventListener(\"focus\",update);",
  "    if(typeof document!==\"undefined\")document.addEventListener(\"visibilitychange\",update);",
  "    const poll=window.setInterval(()=>void probe(),10000);",
  "    void probe();",
  "    return()=>{",
  "      active=false;",
  "      window.clearInterval(poll);",
  "      window.removeEventListener(\"online\",update);",
  "      window.removeEventListener(\"offline\",update);",
  "      window.removeEventListener(\"focus\",update);",
  "      if(typeof document!==\"undefined\")document.removeEventListener(\"visibilitychange\",update);",
  "    };",
  "  },[]);"
);
app=replaceOnce(app,oldEffect,newEffect,"network status effect");
app=replaceOnce(app,
  '    window.addEventListener("online",handleOnline);\n    return()=>{',
  '    window.addEventListener("online",handleOnline);\n    window.addEventListener("qr-reception-network-ready",handleOnline);\n    return()=>{',
  "event publication recheck");
app=replaceOnce(app,
  '      window.removeEventListener("online",handleOnline);\n    };',
  '      window.removeEventListener("online",handleOnline);\n      window.removeEventListener("qr-reception-network-ready",handleOnline);\n    };',
  "event publication recheck cleanup");
app=replaceOnce(app,
  '    window.addEventListener("online",syncPendingRecords);\n    return()=>{',
  '    window.addEventListener("online",syncPendingRecords);\n    window.addEventListener("qr-reception-network-ready",syncPendingRecords);\n    return()=>{',
  "pending sync wake");
app=replaceOnce(app,
  '      window.removeEventListener("online",syncPendingRecords);\n    };',
  '      window.removeEventListener("online",syncPendingRecords);\n      window.removeEventListener("qr-reception-network-ready",syncPendingRecords);\n    };',
  "pending sync wake cleanup");
// Network status is owned by the debounced Firestore reachability probe.
// A terminal's last heartbeat and individual read timeout must not change the
// status badge or revoke the current event's cached approval.
app=replaceOnce(app,
  '        setOnline(value.status==="offline"?false:canAttemptReceptionNetwork());\n        if(canAttemptReceptionNetwork()&&value.status!=="offline"){',
  '        // A successful authenticated approval check is authoritative even\n        // when the terminal heartbeat still says offline.\n        if(incoming?.approved===true){',
  "cache verified approval independent of terminal heartbeat");
app=replaceOnce(app,
  '      else if(!canAttemptReceptionNetwork()||code==="unavailable"||code==="deadline-exceeded"||code==="auth/network-request-failed"){\n        setOnline(false);\n        applyRegistration(null,true);',
  '      else if(!canAttemptReceptionNetwork()||code==="unavailable"||code==="deadline-exceeded"||code==="auth/network-request-failed"){\n        applyRegistration(null,true);',
  "transient registration check must not change online display");
app=replaceOnce(app,
  '    const handleOffline=()=>applyRegistration(null);\n    window.addEventListener("offline",handleOffline);\n    return()=>{',
  '    // Browser offline events do not revoke registration. The subscribed\n    // Firebase approval check handles actual revocation, while temporary\n    // network failures use the previously verified per-event approval.\n    return()=>{',
  "never revoke approval from offline browser event");
app=replaceOnce(app,
  '      unsubscribe?.();\n      window.removeEventListener("offline",handleOffline);',
  '      unsubscribe?.();',
  "registration cleanup after removing offline listener");
app=replaceOnce(app,
  'try{ticket=await getLatestReceptionTicket(localEvent.event.eventId,ticketId);setOnline(canAttemptReceptionNetwork());}',
  'try{ticket=await getLatestReceptionTicket(localEvent.event.eventId,ticketId);}',
  "ticket read success is not a connectivity probe");
app=replaceOnce(app,
  '            setOnline(false);\n            // A temporary network outage may still use the downloaded inventory.',
  '            // A temporary network outage may still use the downloaded inventory.',
  "ticket read timeout is not a network disconnection");
writeFileSync(appPath,app);

const queuePath=resolve(root,"syncQueue.ts");
let queue=readFileSync(queuePath,"utf8");
if(queue.split("navigator.onLine").length-1!==3)
  throw new Error("Unexpected sync worker connectivity guards");
queue=queue.replaceAll("navigator.onLine","canAttemptReceptionNetwork()");
queue=replaceOnce(queue,"let running: Promise<void> | null = null;",
  lines(
    "function canAttemptReceptionNetwork():boolean{",
    "  return navigator.onLine || (typeof window!==\"undefined\" &&",
    "    (window as Window & {__qrReceptionNetworkVerified?:boolean}).__qrReceptionNetworkVerified===true);",
    "}",
    "",
    "let running: Promise<void> | null = null;"
  ),
  "queue connectivity helper");
writeFileSync(queuePath,queue);
// Align the two existing UI expectations with the new debounced network status
// contract. The full original client suite still runs against the real patched
// application; only assertions that demanded immediate offline on a single
// unrelated Firestore read failure change.
const recoveryTestPath=resolve("next-app/reception-recovery-audit.test.mjs");
let recoveryTest=readFileSync(recoveryTestPath,"utf8");
recoveryTest=replaceOnce(recoveryTest,
  "a transient ticket read failure displays offline reception while preserving the downloaded ticket",
  "a transient ticket read failure preserves the downloaded ticket without flickering offline",
  "transient ticket read test description");
recoveryTest=replaceOnce(recoveryTest,
  "assert.equal(h.writes.length,1);assert.match(h.text(),/オフライン/);assert.match(h.text(),/入場を確認しました/);",
  "assert.equal(h.writes.length,1);assert.match(h.text(),/オンライン/);assert.match(h.text(),/入場を確認しました/);",
  "transient ticket read no longer changes network status");
writeFileSync(recoveryTestPath,recoveryTest);
const uiTestPath=resolve("next-app/reception-ui-audit.test.mjs");
let uiTest=readFileSync(uiTestPath,"utf8");
uiTest=replaceOnce(uiTest,
  "assert.match(h.text(),/受付準備完了/);assert.match(h.text(),/オフライン/);",
  "assert.match(h.text(),/受付準備完了/);assert.match(h.text(),/オンライン/);",
  "cached approval network-error UI is debounced");
writeFileSync(uiTestPath,uiTest);

console.log("Production reception patch applied: checked connectivity probe, status display and queue retries.");
