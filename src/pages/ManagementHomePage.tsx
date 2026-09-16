import "./ManagementHomePage.css";

type ManagementHomePageProps = {
  eventConfigured: boolean;
  eventName: string;
  onNavigate: (page: string) => void;
  onReturn: () => void;
};

function Icon({ type }: { type: "event" | "member" | "ticket" | "settings" | "device" }) {
  if (type === "event") {
    return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="14" width="44" height="42" rx="6" fill="none" stroke="currentColor" strokeWidth="4"/><path d="M10 27H54M21 9V20M43 9V20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M21 37H43M21 46H36" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
  }

  if (type === "member") {
    return <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="21" r="10" fill="none" stroke="currentColor" strokeWidth="4"/><path d="M13 53C15 40 22 34 32 34C42 34 49 40 51 53" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
  }

  if (type === "ticket") {
    return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 16H56V25C51 25 48 28 48 32C48 36 51 39 56 39V48H8V39C13 39 16 36 16 32C16 28 13 25 8 25Z" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/><path d="M29 24V40" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="3 5"/></svg>;
  }

  if (type === "settings") {
    return <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="9" fill="none" stroke="currentColor" strokeWidth="4"/><path d="M32 8V17M32 47V56M8 32H17M47 32H56M15 15L22 22M42 42L49 49M49 15L42 22M22 42L15 49" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
  }

  return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="8" width="36" height="48" rx="6" fill="none" stroke="currentColor" strokeWidth="4"/><path d="M22 19H42M22 32H42M22 45H34" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 16H24M18 10L24 16L18 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function ManagementHomePage({
  eventConfigured,
  eventName,
  onNavigate,
  onReturn,
}: ManagementHomePageProps) {
  const menu = [
    { key: "events", type: "event" as const, title: "イベント管理", description: "イベントの作成・設定・終了", enabled: true },
    { key: "members", type: "member" as const, title: "部員管理", description: "部員名や部員QRを管理", enabled: eventConfigured },
    { key: "tickets", type: "ticket" as const, title: "チケット管理", description: "チケットの発行・印刷・状態確認", enabled: eventConfigured },
    { key: "settings", type: "settings" as const, title: "設定", description: "システム情報や初期化などの設定", enabled: true },
    { key: "device-access", type: "device" as const, title: "端末管理", description: "利用申請の承認・端末の停止", enabled: true },
  ];

  return (
    <div className="management-home-page">
      <div className="management-home-orb management-home-orb-one" />
      <div className="management-home-orb management-home-orb-two" />

      <header className="management-home-header">
        <button type="button" className="management-home-back" onClick={onReturn}>
          ← 戻る
        </button>
        <span>MANAGEMENT</span>
      </header>

      <main className="management-home-main">
        <section className="management-home-hero">
          <div>
            <span className="management-home-eyebrow">ADMIN CONTROL</span>
            <h1>管理画面</h1>
            <p>必要な管理機能だけを選択して操作できます。</p>
          </div>
          <div className="management-home-event">
            <small>現在のイベント</small>
            <strong>{eventConfigured ? eventName : "イベント未設定"}</strong>
          </div>
        </section>

        <section className="management-home-grid">
          {menu.map((item) => (
            <button
              key={item.key}
              type="button"
              className="management-home-card"
              disabled={!item.enabled}
              onClick={() => onNavigate(item.key)}
            >
              <span className="management-home-card-icon"><Icon type={item.type} /></span>
              <span className="management-home-card-copy">
                <strong>{item.title}</strong>
                <small>{item.enabled ? item.description : "イベントの設定が必要です"}</small>
              </span>
              <span className="management-home-card-arrow"><ArrowIcon /></span>
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}

export default ManagementHomePage;
