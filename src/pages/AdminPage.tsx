import type { ReactNode } from "react";

import OnlineStatus from "./OnlineStatus";
import "./AdminPage.css";

type AdminPageProps = {
  setPage: (page: string) => void;
  eventConfigured: boolean;
  eventName: string;
  adminOrigin: "home" | "entry" | "exit";
  onReturn: () => void;
};

type MenuCardProps = {
  className: string;
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
};

function ArrowIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 16H24M18 10L24 16L18 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AdminModeIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 7L51 15V29C51 42 43 52 32 57C21 52 13 42 13 29V15L32 7Z" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/><circle cx="32" cy="28" r="7" fill="none" stroke="currentColor" strokeWidth="4"/><path d="M21 45C23 38 27 35 32 35C37 35 41 38 43 45" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
}

function EventIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="14" width="44" height="42" rx="6" fill="none" stroke="currentColor" strokeWidth="4"/><path d="M10 27H54M21 9V20M43 9V20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M21 37H43M21 46H36" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
}

function MemberIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="21" r="10" fill="none" stroke="currentColor" strokeWidth="4"/><path d="M13 53C15 40 22 34 32 34C42 34 49 40 51 53" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
}

function TicketIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 16H56V25C51 25 48 28 48 32C48 36 51 39 56 39V48H8V39C13 39 16 36 16 32C16 28 13 25 8 25Z" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/><path d="M29 24V40" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="3 5"/></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="9" fill="none" stroke="currentColor" strokeWidth="4"/><path d="M32 8V17M32 47V56M8 32H17M47 32H56M15 15L22 22M42 42L49 49M49 15L42 22M22 42L15 49" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
}

function DeviceIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="8" width="36" height="48" rx="6" fill="none" stroke="currentColor" strokeWidth="4"/><path d="M22 19H42M22 32H42M22 45H34" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
}

function MenuCard({ className, icon, title, description, disabled = false, onClick }: MenuCardProps) {
  return <button type="button" className={`admin-menu-card ${className}`} disabled={disabled} onClick={onClick}><span className="admin-menu-card-icon">{icon}</span><span className="admin-menu-card-copy"><strong>{title}</strong><small>{disabled ? "イベントの設定が必要です" : description}</small></span><span className="admin-menu-card-arrow"><ArrowIcon /></span></button>;
}

function AdminPage({ setPage, eventConfigured, eventName, adminOrigin, onReturn }: AdminPageProps) {
  const getReturnButtonText = () => {
    if (adminOrigin === "entry") return "入口受付に戻る";
    if (adminOrigin === "exit") return "出口受付に戻る";
    return "ホームへ戻る";
  };

  return (
    <div className="admin-page">
      <div className="admin-background-circle admin-background-circle-one" />
      <div className="admin-background-circle admin-background-circle-two" />

      <header className="admin-header">
        <div className="admin-header-main">
          <h1>交通研究部QRコード管理システム</h1>
          <div className="admin-header-status">
            <OnlineStatus />
            <span className="admin-header-divider" aria-hidden="true" />
            <div className={eventConfigured ? "admin-event-pill" : "admin-event-pill admin-event-pill-warning"}>
              <span>EVENT</span>
              <strong>{eventConfigured ? eventName : "イベントを設定してください"}</strong>
            </div>
          </div>
        </div>
        <div className="admin-mode-label">
          <span className="admin-mode-icon"><AdminModeIcon /></span>
          <span className="admin-mode-copy"><small>ADMIN</small><strong>管理モード</strong></span>
        </div>
      </header>

      <main className="admin-content">
        <section className="admin-status-panel">
          <div className="admin-panel-heading">
            <div><span className="admin-panel-eyebrow">MANAGEMENT HOME</span><h2>管理メニュー</h2></div>
            <div className="admin-data-state admin-data-live"><span />準備完了</div>
          </div>
          <p className="admin-loading-message">管理画面は軽量モードで起動しています。リアルタイム情報は各機能を開いたときに読み込みます。</p>
          <div className="admin-status-grid">
            <div className="admin-metric-card admin-metric-visitors"><div className="admin-metric-header"><span className="admin-metric-label">現在のイベント</span></div><strong className="admin-metric-value">{eventConfigured ? eventName : "未設定"}</strong></div>
            <div className="admin-metric-card admin-metric-inside"><div className="admin-metric-header"><span className="admin-metric-label">読み込み方式</span></div><strong className="admin-metric-value">必要時のみ</strong></div>
          </div>
        </section>

        <section className="admin-menu-panel">
          <div className="admin-panel-heading admin-menu-heading">
            <div><span className="admin-panel-eyebrow">MANAGEMENT</span><h2>管理メニュー</h2></div>
            <p>操作する項目を選択してください</p>
          </div>
          <div className="admin-menu-grid">
            <MenuCard className="admin-events-card" icon={<EventIcon />} title="イベント管理" description="イベントの作成・設定・終了" onClick={() => setPage("events")} />
            <MenuCard className="admin-members-card" icon={<MemberIcon />} title="部員管理" description="部員名や部員QRを管理" disabled={!eventConfigured} onClick={() => setPage("members")} />
            <MenuCard className="admin-tickets-card" icon={<TicketIcon />} title="チケット管理" description="チケットの発行・印刷・状態確認" disabled={!eventConfigured} onClick={() => setPage("tickets")} />
            <MenuCard className="admin-settings-card" icon={<SettingsIcon />} title="設定" description="システム情報や初期化などの設定" onClick={() => setPage("settings")} />
            <MenuCard className="admin-devices-card" icon={<DeviceIcon />} title="端末管理" description="利用申請の承認・端末の停止" onClick={() => setPage("device-access")} />
          </div>
        </section>
      </main>

      <footer className="admin-footer">
        <button type="button" className="admin-return-button" onClick={onReturn}><span>←</span><span>{getReturnButtonText()}</span></button>
        <button type="button" className="admin-control-button" onClick={() => setPage("control")}><span className="admin-control-button-icon" aria-hidden="true">◎</span><span>管制画面を開く</span></button>
      </footer>
    </div>
  );
}

export default AdminPage;
