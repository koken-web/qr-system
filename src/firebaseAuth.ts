import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";

import {
  firebaseApp,
} from "./firebaseApp";

export const auth =
  getAuth(firebaseApp);

let authenticationPromise:
  Promise<User> | null = null;

export function ensureFirebaseAuthentication() {
  if (auth.currentUser !== null) {
    return Promise.resolve(auth.currentUser);
  }

  if (authenticationPromise !== null) {
    return authenticationPromise;
  }

  authenticationPromise =
    new Promise<User>((resolve, reject) => {
      let unsubscribe: (() => void) | null = null;
      let settled = false;

      const finish = (
        callback: () => void
      ) => {
        if (settled) {
          return;
        }

        settled = true;
        unsubscribe?.();
        callback();
      };

      unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user !== null) {
            finish(() => resolve(user));
          }
        },
        (error) => {
          finish(() => reject(error));
        }
      );

      if (auth.currentUser !== null) {
        finish(() =>
          resolve(auth.currentUser as User)
        );
        return;
      }

      void signInAnonymously(auth).catch((error) => {
        finish(() => reject(error));
      });
    }).finally(() => {
      authenticationPromise = null;
    });

  return authenticationPromise;
}
