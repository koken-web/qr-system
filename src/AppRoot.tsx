import {
  Component,
  lazy,
  Suspense,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";

import AppSplashScreen from "./AppSplashScreen";

import AdminModeGuideBridge from "./AdminModeGuideBridge";
import ControlPairingBridge from "./ControlPairingBridge";
import DeviceAuthGate from "./DeviceAuthGate";
import EventDeletionCleanup from "./EventDeletionCleanup";
import ReceptionGuideBridge from "./ReceptionGuideBridge";
import TutorialHighlightOverlayBridge from "./TutorialHighlightOverlayBridge";

const DeviceAccessGate = lazy(() =>
  import("./DeviceAccessGate")
);

const App = lazy(() =>
  import("./App")
);

type StartupState =
  | "checking"
  | "ready"
  | "error";

type StartupErrorBoundaryState = {
  error: Error | null;
};

class StartupErrorBoundary extends Component<
  { children: ReactNode },
  StartupErrorBoundaryState
> {
  state: StartupErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(
    error: Error
  ): StartupErrorBoundaryState {
    return { error };
  }

  componentDidCatch(
    error: Error,
    errorInfo: ErrorInfo
  ) {
    console.error(
      "受付システムの起動中に画面エラーが発生しました。",
      error,
      errorInfo
    );
  }

  render() {
    if (this.state.error !== null) {
      const error = this.state.error;

      return (
        <main
          style={{
            minHeight: "100vh",
            boxSizing: "border-box",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            background: "#f7f7fb",
            color: "#202536",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Hiragino Sans', 'Yu Gothic UI', 'Yu Gothic', sans-serif",
          }}
        >
          <section
            style={{
              width: "min(680px, 100%)",
              boxSizing: "border-box",
              padding: "28px",
              borderRadius: "24px",
              background: "#ffffff",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.08)",
            }}
          >
            <p
              style={{
                margin: "0 0 8px",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity: 0.6,
              }}
            >
              Startup Error
            </p>
            <h1
              style={{
                margin: "0 0 12px",
                fontSize: "26px",
                lineHeight: 1.3,
              }}
            >
              受付システムの画面を読み込めませんでした
            </h1>
            <p
              style={{
                margin: "0 0 18px",
                lineHeight: 1.7,
              }}
            >
              Firebaseの接続状態に関係なく発生する起動エラーです。下のエラー内容を確認できます。
            </p>
            <pre
              style={{
                margin: 0,
                padding: "14px",
                borderRadius: "12px",
                background: "#f1f2f6",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              {error.message || String(error)}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: "18px",
                minHeight: "46px",
                padding: "0 18px",
                border: 0,
                borderRadius: "12px",
                background: "#282d3d",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              再読み込み
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

const pageLoadingFallback = (
  <main
    className="app-route-loading"
    aria-live="polite"
  >
    <span
      className="app-route-loading-spinner"
      aria-hidden="true"
    />

    <strong>
      画面を読み込んでいます
    </strong>
  </main>
);

function AppRoot() {
  const [
    authState,
    setAuthState,
  ] = useState<StartupState>(
    "checking"
  );

  const [
    accessState,
    setAccessState,
  ] = useState<StartupState>(
    "checking"
  );

  const canFinishSplash =
    authState === "error" ||
    (
      authState === "ready" &&
      accessState !== "checking"
    );

  return (
    <AppSplashScreen
      canFinish={
        canFinishSplash
      }
    >
      <DeviceAuthGate
        onScreenStateChange={
          setAuthState
        }
      >
        <StartupErrorBoundary>
          <Suspense
            fallback={
              pageLoadingFallback
            }
          >
            <DeviceAccessGate
              onScreenStateChange={
                setAccessState
              }
            >
              <>
                <App />
                <EventDeletionCleanup />
                <ReceptionGuideBridge />
                <AdminModeGuideBridge />
                <ControlPairingBridge />
                <TutorialHighlightOverlayBridge />
              </>
            </DeviceAccessGate>
          </Suspense>
        </StartupErrorBoundary>
      </DeviceAuthGate>
    </AppSplashScreen>
  );
}

export default AppRoot;
