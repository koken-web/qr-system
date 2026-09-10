import {
  type ReactNode,
  useEffect,
  useState,
} from "react";

import {
  onAuthStateChanged,
  signInAnonymously,
} from "firebase/auth";

import {
  auth,
} from "./firebaseAuth";

import {
  getDeviceAccessSnapshot,
} from "./localdb/deviceAccessSnapshotLocal";

import "./DeviceAuthGate.css";

type DeviceAuthGateProps = {
  children: ReactNode;
  onScreenStateChange?: (
    state: AuthScreenState
  ) => void;
};

type AuthScreenState =
  | "checking"
  | "ready"
  | "error";

function getFirebaseErrorDetails(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";

  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : String(error);

  return { code, message };
}

function getAnonymousAuthErrorMessage(error: unknown) {
  const { code } = getFirebaseErrorDetails(error);

  switch (code) {
    case "auth/operation-not-allowed":
      return "Firebaseで匿名認証がまだ有効になっていません。";
    case "auth/network-request-failed":
      return "Firebase Authenticationへの通信に失敗しました。Wi-Fi接続だけでなく、Firebaseへの通信が許可されているか確認してください。";
    case "auth/too-many-requests":
      return "接続が集中しています。少し待ってから、もう一度お試しください。";
    default:
      return "Firebase Authenticationへの接続に失敗しました。下に表示されるエラーコードを確認してください。";
  }
}

function AuthLogo() {
  return (
    <div className="device-auth-logo" aria-hidden="true">
      <span>QR</span>
    </div>
  );
}

function DeviceAuthGate({ children, onScreenStateChange }: DeviceAuthGateProps) {
  const [screenState, setScreenState] = useState<AuthScreenState>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    let signInStarted = false;

    const allowCachedOfflineSession = async () => {
      if (navigator.onLine !== false) {
        return false;
      }

      const snapshot = await getDeviceAccessSnapshot();

      if (
        !active ||
        snapshot === null ||
        !snapshot.uid ||
        !snapshot.device.active
      ) {
        return false;
      }

      setErrorMessage("");
      setErrorCode("");
      setErrorDetails("");
      setScreenState("ready");
      return true;
    };

    const startAnonymousSignIn = async () => {
      if (signInStarted) return;
      signInStarted = true;

      if (await allowCachedOfflineSession()) {
        return;
      }

      try {
        await signInAnonymously(auth);
      } catch (error) {
        if (!active) return;

        const details = getFirebaseErrorDetails(error);
        console.error("受付システムの自動認証に失敗しました。", error);

        if (await allowCachedOfflineSession()) {
          return;
        }

        setErrorMessage(getAnonymousAuthErrorMessage(error));
        setErrorCode(details.code);
        setErrorDetails(details.message);
        setScreenState("error");
      }
    };

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (!active) return;

        if (user !== null) {
          setErrorMessage("");
          setErrorCode("");
          setErrorDetails("");
          setScreenState("ready");
          return;
        }

        void startAnonymousSignIn();
      },
      (error) => {
        if (!active) return;

        const details = getFirebaseErrorDetails(error);
        console.error("自動認証の状態を読み込めませんでした。", error);
        void allowCachedOfflineSession().then((allowed) => {
          if (!active || allowed) return;

          setErrorMessage(
            "Firebase Authenticationの状態取得に失敗しました。下に表示されるエラーコードを確認してください。"
          );
          setErrorCode(details.code);
          setErrorDetails(details.message);
          setScreenState("error");
        });
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [retryCount]);

  useEffect(() => {
    if (screenState === "ready") {
      void import("./offlineReceptionSync")
        .then(({ startOfflineReceptionSync }) => {
          startOfflineReceptionSync();
        })
        .catch((error) => {
          console.warn("オフライン受付の同期準備を次回へ延期します。", error);
        });
    }
  }, [screenState]);

  useEffect(() => {
    onScreenStateChange?.(screenState);
  }, [onScreenStateChange, screenState]);

  if (screenState === "ready") {
    return children;
  }

  return (
    <main className="device-auth-page">
      <section className="device-auth-card">
        <AuthLogo />
        {screenState === "checking" ? (
          <div className="device-auth-loading" aria-live="polite">
            <span className="device-auth-spinner" aria-hidden="true" />
            <h1>受付システムを準備しています</h1>
            <p>そのままお待ちください</p>
          </div>
        ) : (
          <div className="device-auth-message">
            <h1>接続できませんでした</h1>
            <p role="alert">{errorMessage}</p>

            {errorCode && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  borderRadius: "10px",
                  background: "rgba(0, 0, 0, 0.06)",
                  textAlign: "left",
                  overflowWrap: "anywhere",
                }}
              >
                <strong>Firebaseエラーコード</strong>
                <div
                  style={{
                    marginTop: "4px",
                    fontFamily: "monospace",
                    fontSize: "14px",
                  }}
                >
                  {errorCode}
                </div>
                {errorDetails && (
                  <>
                    <strong
                      style={{
                        display: "block",
                        marginTop: "10px",
                      }}
                    >
                      Firebaseエラー詳細
                    </strong>
                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "13px",
                        lineHeight: 1.5,
                      }}
                    >
                      {errorDetails}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="device-auth-actions">
              <button
                type="button"
                onClick={() => {
                  setScreenState("checking");
                  setErrorMessage("");
                  setErrorCode("");
                  setErrorDetails("");
                  setRetryCount((currentCount) => currentCount + 1);
                }}
              >
                もう一度試す
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default DeviceAuthGate;
