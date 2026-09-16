import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";

import OnlineStatus from "./OnlineStatus";
import "./AdminAuthPage.css";

const CameraQrScanner = lazy(() =>
  import("./CameraQrScanner")
);

type AdminAuthPageProps = {
  setPage: (page: string) => void;
  eventName: string;
  returnPage: "home" | "entry" | "exit";
};

type AuthState = "waiting" | "processing" | "success" | "error";

type ParsedMemberQr = {
  qrNumber: string;
  authToken: string;
};

function parseMemberQr(qrValue: string): ParsedMemberQr | null {
  const parts = qrValue.trim().split(":");

  if (
    parts.length !== 4 ||
    parts[0] !== "QRM1" ||
    parts[1] !== "MEMBER" ||
    parts[2].trim() === "" ||
    parts[3].trim() === ""
  ) {
    return null;
  }

  return {
    qrNumber: parts[2],
    authToken: parts[3],
  };
}

function AdminAuthModeIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 7L51 15V29C51 42 43 52 32 57C21 52 13 42 13 29V15L32 7Z" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="32" cy="28" r="7" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M21 45C23 38 27 35 32 35C37 35 41 38 43 45" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function ScannerIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M9 23V14C9 11 11 9 14 9H23" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M41 9H50C53 9 55 11 55 14V23" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M55 41V50C55 53 53 55 50 55H41" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M23 55H14C11 55 9 53 9 50V41" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <rect x="20" y="20" width="9" height="9" rx="1" fill="currentColor" />
      <rect x="35" y="20" width="9" height="9" rx="1" fill="currentColor" />
      <rect x="20" y="35" width="9" height="9" rx="1" fill="currentColor" />
      <path d="M36 36H44V44H36V40H40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 25H22L36 13V51L22 39H10V25Z" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M43 23C47 27 47 37 43 41" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M49 16C58 25 58 39 49 48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function AdminAuthPage({ setPage, eventName, returnPage }: AdminAuthPageProps) {
  const [authState, setAuthState] = useState<AuthState>("waiting");
  const [authenticatedMemberName, setAuthenticatedMemberName] = useState("");
  const [scannerSession, setScannerSession] = useState(0);
  const [authenticationStarted, setAuthenticationStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    if (authState === "waiting" || authState === "processing") {
      return;
    }

    const timer = window.setTimeout(() => {
      if (authState === "success") {
        setPage("admin");
        return;
      }

      setAuthenticatedMemberName("");
      setAuthState("waiting");
      setScannerSession((current) => current + 1);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [authState, setPage]);

  const handleStartAuthentication = useCallback(async () => {
    if (starting) {
      return;
    }

    setStarting(true);
    setStartError("");

    try {
      const sound = await import("../receptionSound");
      const soundPlayed = await sound.playReceptionSuccessSound();

      if (!soundPlayed) {
        setStartError("音を有効にできませんでした。iPadの音量を確認して、もう一度押してください。");
        return;
      }

      setAuthenticationStarted(true);
    } catch (error) {
      console.error("管理者認証の開始に失敗しました。", error);
      setStartError("認証の準備に失敗しました。もう一度押してください。");
    } finally {
      setStarting(false);
    }
  }, [starting]);

  const handleQrScan = useCallback(async (scannedQrValue: string) => {
    if (authState !== "waiting") {
      return;
    }

    const parsedQr = parseMemberQr(scannedQrValue);

    if (parsedQr === null || eventName.trim() === "") {
      try {
        const sound = await import("../receptionSound");
        void sound.playReceptionErrorSound();
      } catch {
        // 認証エラー表示を優先するため、音声エラーは無視する
      }
      setAuthenticatedMemberName("");
      setAuthState("error");
      return;
    }

    setAuthState("processing");

    try {
      const [{ findMemberByQrInFirestore }, sound] = await Promise.all([
        import("../memberFirestore"),
        import("../receptionSound"),
      ]);

      const member = await findMemberByQrInFirestore(
        eventName,
        parsedQr.qrNumber,
        parsedQr.authToken
      );

      if (member === null) {
        void sound.playReceptionErrorSound();
        setAuthenticatedMemberName("");
        setAuthState("error");
        return;
      }

      const memberName = member.name.trim() || "部員";
      void sound.playReceptionSuccessSound();
      setAuthenticatedMemberName(memberName);
      setAuthState("success");
    } catch (error) {
      console.error("部員QR認証に失敗しました。", error);
      try {
        const sound = await import("../receptionSound");
        void sound.playReceptionErrorSound();
      } catch {
        // 認証エラー表示を優先するため、音声エラーは無視する
      }
      setAuthenticatedMemberName("");
      setAuthState("error");
    }
  }, [authState, eventName]);

  const returnText =
    returnPage === "entry"
      ? "入口受付へ戻る"
      : returnPage === "exit"
        ? "出口受付へ戻る"
        : "ホームへ戻る";

  const stateTitle =
    authState === "success"
      ? "認証しました"
      : authState === "error"
        ? "認証できませんでした"
        : authState === "processing"
          ? "認証しています"
          : "管理者認証";

  return (
    <div className={`admin-auth-page ${authState}`}>
      <div className="admin-auth-background-circle admin-auth-background-circle-one" />
      <div className="admin-auth-background-circle admin-auth-background-circle-two" />

      <header className="admin-auth-header">
        <div className="admin-auth-header-main">
          <h1>交通研究部QRコード管理システム</h1>
          <div className="admin-auth-header-meta">
            <OnlineStatus />
            <span className="admin-auth-header-divider" aria-hidden="true" />
            <div className="admin-auth-current-event">
              <span className="admin-auth-current-event-label">EVENT</span>
              <strong>{eventName || "イベント未設定"}</strong>
            </div>
          </div>
        </div>

        <div className="admin-auth-mode">
          <span className="admin-auth-mode-icon"><AdminAuthModeIcon /></span>
          <span className="admin-auth-mode-copy">
            <small>ADMIN AUTH</small>
            <strong>{stateTitle}</strong>
          </span>
        </div>
      </header>

      <main className="admin-auth-main" aria-live="polite" aria-busy={authState === "processing"}>
        {!authenticationStarted && authState === "waiting" && (
          <section className="admin-auth-sound-start-panel">
            <div className="admin-auth-sound-start-icon"><SpeakerIcon /></div>
            <span className="admin-auth-sound-start-eyebrow">ADMIN AUTH</span>
            <h2>管理者認証を開始</h2>
            <p className="admin-auth-sound-start-description">
              まず認証画面を準備します。<br />
              この段階ではカメラは起動しません。
            </p>
            <button
              type="button"
              className="admin-auth-sound-start-button"
              disabled={starting}
              onClick={() => void handleStartAuthentication()}
            >
              <span className="admin-auth-sound-start-button-icon"><SpeakerIcon /></span>
              <span>{starting ? "認証画面を準備しています…" : "認証を開始"}</span>
            </button>
            <p className="admin-auth-sound-start-note">
              認証開始後、必要になった時だけカメラを起動します
            </p>
            {startError !== "" && (
              <p className="admin-auth-sound-start-error" role="alert">{startError}</p>
            )}
          </section>
        )}

        {authenticationStarted && authState === "waiting" && (
          <section className="admin-auth-waiting-panel">
            <div className="admin-auth-scanner-card">
              <div className="admin-auth-scanner-card-header">
                <div className="admin-auth-scanner-heading">
                  <span className="admin-auth-scanner-heading-icon"><ScannerIcon /></span>
                  <span className="admin-auth-scanner-heading-copy">
                    <small>MEMBER QR SCANNER</small>
                    <strong>部員QRコード読み取り</strong>
                  </span>
                </div>
                <div className="admin-auth-scanner-ready">
                  <span className="admin-auth-scanner-ready-dot" aria-hidden="true" />
                  認証待機中
                </div>
              </div>

              <div className="admin-auth-scanner-wrapper">
                <Suspense fallback={
                  <div className="app-scanner-loading">
                    <span className="app-route-loading-spinner" aria-hidden="true" />
                    <strong>カメラを準備しています</strong>
                  </div>
                }>
                  <CameraQrScanner
                    key={scannerSession}
                    enabled
                    onScan={(qrValue) => void handleQrScan(qrValue)}
                  />
                </Suspense>
              </div>
            </div>
          </section>
        )}

        {authState === "processing" && (
          <section className="admin-auth-sound-start-panel">
            <span className="admin-auth-sound-start-eyebrow">AUTHENTICATING</span>
            <h2>認証しています</h2>
            <p className="admin-auth-sound-start-description">部員情報を確認しています。</p>
          </section>
        )}

        {authState === "success" && (
          <section className="admin-auth-sound-start-panel">
            <span className="admin-auth-sound-start-eyebrow">ACCESS GRANTED</span>
            <h2>{authenticatedMemberName}さんを認証しました</h2>
            <p className="admin-auth-sound-start-description">管理画面を開いています。</p>
          </section>
        )}

        {authState === "error" && (
          <section className="admin-auth-sound-start-panel">
            <span className="admin-auth-sound-start-eyebrow">ACCESS DENIED</span>
            <h2>認証できませんでした</h2>
            <p className="admin-auth-sound-start-description">もう一度QRコードを読み取ってください。</p>
          </section>
        )}

        <button
          type="button"
          onClick={() => setPage(returnPage)}
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            border: 0,
            background: "transparent",
            color: "inherit",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
            opacity: 0.72,
            padding: "8px 0",
          }}
        >
          ← {returnText}
        </button>
      </main>
    </div>
  );
}

export default AdminAuthPage;
