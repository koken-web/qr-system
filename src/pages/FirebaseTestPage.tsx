import {
  useState,
} from "react";

import {
  doc,
  getDocFromServer,
} from "firebase/firestore";

import {
  db,
} from "../firebase";

import {
  auth,
} from "../firebaseAuth";

type FirebaseTestPageProps = {
  setPage: (
    page: string
  ) => void;
};

type TestState =
  | "waiting"
  | "testing"
  | "success"
  | "error";

function getErrorCode(
  error: unknown
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return "unknown";
}

function getErrorMessage(
  error: unknown
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "原因不明のエラー";
}

function FirebaseTestPage({
  setPage,
}: FirebaseTestPageProps) {
  const [
    testState,
    setTestState,
  ] = useState<TestState>(
    "waiting"
  );

  const [
    message,
    setMessage,
  ] = useState(
    "まだ接続テストをしていません"
  );

  const [
    detail,
    setDetail,
  ] = useState("");

  const runConnectionTest =
    async () => {
      setTestState(
        "testing"
      );

      setMessage(
        "Firebaseの接続状態を確認しています…"
      );
      setDetail("");

      try {
        const currentUser =
          auth.currentUser;

        if (
          currentUser === null
        ) {
          throw new Error(
            "Firebase Authenticationにログインできていません。"
          );
        }

        const testDocument =
          doc(
            db,
            "system",
            "device-access"
          );

        const snapshot =
          await getDocFromServer(
            testDocument
          );

        setTestState(
          "success"
        );

        setMessage(
          "Firebaseへの接続に成功しました"
        );

        setDetail(
          [
            `Authentication: OK`,
            `UID: ${currentUser.uid}`,
            `Firestore: OK`,
            `device-access: ${snapshot.exists() ? "存在します" : "まだ存在しません"}`,
          ].join("\n")
        );
      } catch (error) {
        const code =
          getErrorCode(error);
        const errorMessage =
          getErrorMessage(error);

        console.error(
          "Firebase接続診断に失敗しました。",
          error
        );

        setTestState(
          "error"
        );

        setMessage(
          "Firebaseへの接続に失敗しました"
        );

        setDetail(
          [
            `Authentication: ${auth.currentUser !== null ? "OK" : "NG"}`,
            `UID: ${auth.currentUser?.uid ?? "なし"}`,
            `Error code: ${code}`,
            `Error message: ${errorMessage}`,
          ].join("\n")
        );
      }
    };

  return (
    <div
      style={{
        minHeight:
          "100vh",
        boxSizing:
          "border-box",
        padding:
          "30px",
        background:
          "#f5f5f5",
        color:
          "#111",
      }}
    >
      <h1>
        Firebase接続テスト
      </h1>

      <div
        style={{
          maxWidth:
            "800px",
          marginTop:
            "30px",
          padding:
            "30px",
          borderRadius:
            "18px",
          background:
            "#fff",
          fontSize:
            "26px",
          fontWeight:
            "bold",
        }}
      >
        <p>
          {message}
        </p>

        {detail !== "" && (
          <pre
            style={{
              whiteSpace:
                "pre-wrap",
              wordBreak:
                "break-word",
              marginTop:
                "20px",
              padding:
                "20px",
              borderRadius:
                "12px",
              background:
                "#f0f0f0",
              fontSize:
                "18px",
              fontWeight:
                "normal",
            }}
          >
            {detail}
          </pre>
        )}

        <button
          type="button"
          disabled={
            testState ===
            "testing"
          }
          onClick={() =>
            void runConnectionTest()
          }
          style={{
            minHeight:
              "70px",
            padding:
              "12px 26px",
            border:
              "none",
            borderRadius:
              "14px",
            background:
              "#9966ee",
            color:
              "#fff",
            fontSize:
              "24px",
            fontWeight:
              "bold",
            cursor:
              testState ===
              "testing"
                ? "wait"
                : "pointer",
          }}
        >
          {testState ===
          "testing"
            ? "診断しています…"
            : "Firebase接続を診断"}
        </button>
      </div>

      <button
        type="button"
        onClick={() =>
          setPage(
            "settings"
          )
        }
        style={{
          marginTop:
            "30px",
          border:
            "none",
          background:
            "transparent",
          fontSize:
            "28px",
          fontWeight:
            "bold",
          cursor:
            "pointer",
        }}
      >
        前のページに戻る
      </button>
    </div>
  );
}

export default FirebaseTestPage;
