import { lazy, Suspense, useState } from "react";

import "./ManagementEntryPage.css";

type ManagementEntryPageProps = {
  eventConfigured: boolean;
  eventActive: boolean;
  eventName: string;
  onOpenAdmin: () => void;
  onOpenAdminAuth: () => void;
  onBack: () => void;
};

const AdminPage = lazy(() => import("./AdminPage"));
const AdminAuthPage = lazy(() => import("./AdminAuthPage"));

function ShieldIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 7L51 15V29C51 42 43 52 32 57C21 52 13 42 13 29V15L32 7Z" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
      <path d="M23 32L29 38L42 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M8 8H25V13H13V25H8Z" fill="currentColor" />
      <path d="M39 8H56V25H51V13H39Z" fill="currentColor" />
      <path d="M8 39H13V51H25V56H8Z" fill="currentColor" />
      <path d="M51 39H56V56H39V51H51Z" fill="currentColor" />
      <rect x="18" y="18" width="9" height="9" rx="1" fill="currentColor" />
      <rect x="37" y="18" width="9" height="9" rx="1" fill="currentColor" />
      <rect x="18" y="37" width="9" height="9" rx="1" fill="currentColor" />
      <rect x="37" y="37" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="44" y="44" width="5" height="5" rx="1" fill="currentColor" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 16H24M18 10L24 16L18 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ManagementLoadError({ onBack }: { onBack: () => void }) {
  return (
    <div className="management-entry-page">
      <main className="management-entry-main">
        <section className="management-entry-action-card">
          <div className="management-entry-action-icon"><ShieldIcon /></div>
          <div className="management-entry-action-copy">
            <span>管理画面</span>
            <h2>管理画面を読み込めませんでした</h2>
            <p>管理機能の読み込みに失敗しました。受付画面には影響しません。</p>
          </div>
          <button type="button" className="management-entry-primary-button" onClick={onBack}>
            戻る
            <ArrowIcon />
          </button>
        </section>
      </main>
    </div>
  );
}

function ManagementEntryPage({
  eventConfigured,
  eventActive,
  eventName,
  onOpenAdmin,
  onOpenAdminAuth,
  onBack,
}: ManagementEntryPageProps) {
  const [view, setView] = useState<"entry" | "admin" | "auth">("entry");

  if (view === "admin") {
    return (
      <Suspense fallback={<div className="management-entry-page"><main className="management-entry-main"><section className="management-entry-action-card"><div className="management-entry-action-icon"><ShieldIcon /></div><div className="management-entry-action-copy"><span>管理画面</span><h2>管理画面を準備しています</h2><p>必要な管理機能を読み込んでいます。</p></div></section></main></div>}>
        <AdminPage
          setPage={(page) => {
            if (page === "admin") return;
            onOpenAdmin();
          }}
          eventConfigured={eventConfigured}
          eventName={eventName}
          adminOrigin="home"
          onReturn={() => {
            setView("entry");
            onBack();
          }}
        />
      </Suspense>
    );
  }

  if (view === "auth") {
    return (
      <Suspense fallback={<div className="management-entry-page"><main className="management-entry-main"><section className="management-entry-action-card"><div className="management-entry-action-icon"><QrIcon /></div><div className="management-entry-action-copy"><span>管理者認証</span><h2>認証画面を準備しています</h2><p>カメラは認証開始後に起動します。</p></div></section></main></div>}>
        <AdminAuthPage
          setPage={(page) => {
            if (page === "admin") {
              setView("admin");
              onOpenAdmin();
            }
          }}
          eventName={eventName}
          returnPage="home"
        />
      </Suspense>
    );
  }

  return (
    <div className="management-entry-page">
      <div className="management-entry-orb management-entry-orb-one" />
      <div className="management-entry-orb management-entry-orb-two" />

      <header className="management-entry-header">
        <button type="button" className="management-entry-back" onClick={onBack}>← ホームへ戻る</button>
        <span className="management-entry-header-label">MANAGEMENT</span>
      </header>

      <main className="management-entry-main">
        <section className="management-entry-hero">
          <div className="management-entry-icon"><ShieldIcon /></div>
          <div>
            <p className="management-entry-kicker">管理モード</p>
            <h1>管理画面への入口</h1>
            <p className="management-entry-description">管理機能を必要になったときだけ読み込みます。この画面ではカメラや管理機能を起動しません。</p>
          </div>
        </section>

        <section className="management-entry-status">
          <span className={eventActive ? "management-entry-status-dot active" : "management-entry-status-dot"} />
          <div>
            <span className="management-entry-status-label">{eventActive ? "イベント開催中" : "イベント待機中"}</span>
            <strong>{eventConfigured ? eventName : "イベント未設定"}</strong>
          </div>
        </section>

        <section className="management-entry-action-card">
          {eventActive ? (
            <>
              <div className="management-entry-action-icon"><QrIcon /></div>
              <div className="management-entry-action-copy">
                <span>管理者認証</span>
                <h2>管理者QRで認証して続ける</h2>
                <p>認証を開始するまでカメラは起動しません。</p>
              </div>
              <button type="button" className="management-entry-primary-button" onClick={() => { onOpenAdminAuth(); setView("auth"); }}>
                認証を開始
                <ArrowIcon />
              </button>
            </>
          ) : (
            <>
              <div className="management-entry-action-icon"><ShieldIcon /></div>
              <div className="management-entry-action-copy">
                <span>管理画面</span>
                <h2>管理画面を開く</h2>
                <p>イベント開始前・終了後はQR認証なしで管理できます。</p>
              </div>
              <button type="button" className="management-entry-primary-button" onClick={() => { onOpenAdmin(); setView("admin"); }}>
                管理画面へ
                <ArrowIcon />
              </button>
            </>
          )}
        </section>

        <p className="management-entry-note">管理画面を開いたあとも、必要な機能だけを順番に読み込みます。</p>
      </main>
    </div>
  );
}

export default ManagementEntryPage;
