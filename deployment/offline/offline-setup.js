(() => {
  const base = new URL(document.currentScript.dataset.root || './', document.currentScript.src);
  const apps = [{name: '受付', path: './', app: 'reception'}, {name: '管理', path: 'control/', app: 'management'}];
  const setup = document.querySelector('[data-offline-setup]');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function status(worker) {
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {channel.port1.close(); resolve(false);}, 3000);
      channel.port1.onmessage = event => {clearTimeout(timer); channel.port1.close(); resolve(event.data?.ready === true);};
      worker.postMessage({type: 'OFFLINE_STATUS'}, [channel.port2]);
    });
  }

  async function prepare(app) {
    if (!('serviceWorker' in navigator)) throw Error('このブラウザでは保存できません。Safariで開いてください。');
    const scope = new URL(app.path, base);
    const registration = await navigator.serviceWorker.register(new URL('sw.js', scope), {scope: scope.pathname});
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (registration.active && await status(registration.active)) return;
      const worker = registration.installing || registration.waiting;
      if (worker?.state === 'redundant') throw Error('保存に失敗しました。接続できる回線で再試行してください。');
      await delay(350);
    }
    throw Error('保存が完了していません。通信状態を確認して再試行してください。');
  }

  if (setup) {
    const button = document.querySelector('[data-prepare]');
    button.addEventListener('click', async () => {
      button.disabled = true;
      for (const app of apps) {
        const output = document.querySelector(`[data-status="${app.app}"]`);
        output.textContent = '保存しています…';
        try {await prepare(app); output.textContent = '画面のオフライン保存が完了しました';}
        catch (error) {output.textContent = error.message;}
      }
      button.disabled = false;
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
    });
    return;
  }

  // Register independently of Firebase startup so a sign-in/network failure
  // cannot prevent the next launch from being saved offline.
  const app = location.pathname.startsWith(new URL('control/', base).pathname) ? apps[1] : apps[0];
  const showNotice = () => {
    const notice = document.createElement('a');
    notice.href = new URL('offline.html', base).href;
    notice.textContent = 'オフライン準備・保存状況を確認';
    notice.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:90%;padding:10px 16px;border-radius:12px;background:#fff;color:#37217d;box-shadow:0 2px 12px #0003;font:14px sans-serif;text-align:center';
    document.body.append(notice);
    prepare(app).then(() => {
      notice.textContent = '画面のオフライン保存が完了しました';
      setTimeout(() => notice.remove(), 6000);
    }).catch(() => {notice.textContent = 'オフライン保存を完了できませんでした。タップして再準備';});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showNotice, {once: true});
  else showNotice();
})();
