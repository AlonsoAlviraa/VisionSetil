/**
 * Session token persistence policy (E-08).
 * Cookie mode: never store raw session token in localStorage (HttpOnly only).
 * Bearer mode: token may live in localStorage under SESSION_TOKEN_KEY.
 */

export const SESSION_TOKEN_KEY = 'visionsetil_session_token'

/** True when the SPA is allowed to put the access token in web storage. */
export function shouldPersistTokenInLocalStorage(cookieMode: boolean): boolean {
  return cookieMode !== true
}

/**
 * Apply post-login/register storage policy against a Storage-like surface.
 * Always clears the key first in cookie mode (even if empty).
 */
export function applySessionAfterAuth(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  cookieMode: boolean,
  token: string,
): void {
  if (!shouldPersistTokenInLocalStorage(cookieMode)) {
    storage.removeItem(SESSION_TOKEN_KEY)
    return
  }
  if (token) {
    storage.setItem(SESSION_TOKEN_KEY, token)
  } else {
    storage.removeItem(SESSION_TOKEN_KEY)
  }
}

/** Read stored bearer token; cookie mode always returns null (token not in JS). */
export function readStoredSessionToken(
  storage: Pick<Storage, 'getItem'>,
  cookieMode: boolean,
): string | null {
  if (!shouldPersistTokenInLocalStorage(cookieMode)) return null
  return storage.getItem(SESSION_TOKEN_KEY)
}

/** Clear session token from storage (logout / auth failure). */
export function clearStoredSessionToken(
  storage: Pick<Storage, 'removeItem'>,
): void {
  storage.removeItem(SESSION_TOKEN_KEY)
}
