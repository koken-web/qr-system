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
console.log("Production reception patch applied: checked connectivity probe, status display and queue retries.");
