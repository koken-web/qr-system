(() => {
  if (!('serviceWorker' in navigator)) return;
  const base = new URL('./', document.currentScript.src);
  // Match the original apps: normal startup automatically saves this app.
  // Keep registration independent of Firebase authentication completing.
  const register = () => {
    void navigator.serviceWorker.register(new URL('sw.js', base).href, {scope: base.pathname})
      .catch(error => console.warn('アプリのオフライン保存を完了できませんでした。', error));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, {once: true});
})();
