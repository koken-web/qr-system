import ReactDOM from "react-dom/client";

import AppRoot from "./AppRoot";
import {
  installIntentionalReceptionStopGuard,
} from "./receptionIntentionalStopGuard";
import {
  startOfflineReceptionSync,
} from "./offlineReceptionSync";
import {
  startOfflineDataPreparation,
} from "./services/offlineDataPreparationStartup";

import "./index.css";
import "./moved-data-controls.css";

const SERVICE_WORKER_RESET_KEY =
  "qr-system-service-worker-reset-2026-09-11";

/*
  古いPWAキャッシュと新しいJavaScriptの組み合わせで
  白画面になるケースを一度だけ解消します。

  リセット後は通常どおりService Workerを再登録できるため、
  オフライン受付そのものを恒久的に無効にはしません。
*/
const resetStaleServiceWorkerOnce = () => {
  if (
    !("serviceWorker" in navigator) ||
    localStorage.getItem(
      SERVICE_WORKER_RESET_KEY
    ) === "done"
  ) {
    return;
  }

  localStorage.setItem(
    SERVICE_WORKER_RESET_KEY,
    "done"
  );

  void navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      await Promise.all(
        registrations.map((registration) =>
          registration.unregister()
        )
      );

      const cacheNames =
        await caches.keys();

      await Promise.all(
        cacheNames.map((cacheName) =>
          caches.delete(cacheName)
        )
      );

      window.location.reload();
    })
    .catch((error) => {
      console.warn(
        "Service Workerのリセットに失敗しました。",
        error
      );
    });
};

/*
  GitHub Pagesへ新しい版が公開されても、開いたままのPWAは
  以前のJavaScriptを表示し続けることがあります。
  新しいService Workerへ切り替わった瞬間だけ再読み込みし、
  最新画面へ自動的に移行します。
*/
const installAutomaticAppUpdate = () => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const hadController =
    navigator.serviceWorker.controller !== null;
  let reloading = false;

  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      if (
        !hadController ||
        reloading
      ) {
        return;
      }

      reloading = true;
      window.location.reload();
    }
  );

  window.addEventListener(
    "load",
    () => {
      void navigator.serviceWorker.ready
        .then((registration) =>
          registration.update()
        )
        .catch((error) => {
          console.warn(
            "アプリの更新確認に失敗しました。",
            error
          );
        });
    },
    {
      once: true,
    }
  );
};

resetStaleServiceWorkerOnce();
installAutomaticAppUpdate();
installIntentionalReceptionStopGuard();

try {
  startOfflineReceptionSync();
} catch (error) {
  console.warn(
    "オフライン受付同期の起動に失敗しました。",
    error
  );
}

try {
  startOfflineDataPreparation();
} catch (error) {
  console.warn(
    "オフラインデータ準備の起動に失敗しました。",
    error
  );
}

/*
  iPad用印刷画面が表示されるたびに、
  ホーム画面アプリ向けのPDF印刷ボタンを追加します。

  初回表示を妨げないよう、ブラウザが空いた時点で
  印刷サポートだけを追加読み込みします。
*/
const installPrintSupport = () => {
  void import(
    "./manualPrintSupport"
  )
    .then(({
      installManualPrintSupport,
    }) => {
      installManualPrintSupport();
    })
    .catch((error) => {
      console.warn(
        "印刷サポートを読み込めませんでした。",
        error
      );
    });
};

window.setTimeout(
  installPrintSupport,
  1000
);

const rootElement =
  document.getElementById(
    "root"
  );

if (
  rootElement ===
  null
) {
  throw new Error(
    "Reactの表示領域が見つかりません。"
  );
}

ReactDOM.createRoot(
  rootElement
).render(
  <AppRoot />
);
