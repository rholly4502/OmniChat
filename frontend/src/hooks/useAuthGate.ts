import { useEffect, useState } from 'react';
import { validateApiKey } from '../authApi';

export interface AuthGate {
  /** True renders the login screen instead of the workspace. */
  locked: boolean;
  busy: boolean;
  error: string | null;
  /** Verifies `key`, stores it on success, and unlocks the workspace. */
  attemptLogin: (key: string) => Promise<boolean>;
  /** Clears the stored credential and returns to the login screen. */
  logout: () => void;
}

/**
 * Gates the workspace behind either a valid API key or an anonymous guest mode.
 *
 * On boot it quietly re-validates a stored key: a rejected key locks the app
 * rather than letting it limp along and surface 401s mid-chat. The check is
 * asynchronous, so the first paint of a valid session is not blocked — the app
 * renders unlocked and only snaps to login if the stored key turns out bad.
 * The boot check never touches `busy`: there is no visible spinner for a thing
 * the user did not initiate.
 */
export function useAuthGate(apiKey: string, setApiKey: (value: string) => void): AuthGate {
  const [locked, setLocked] = useState(() => !apiKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!apiKey) {
      setLocked(true);
      return;
    }

    void validateApiKey(apiKey).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setLocked(true);
        setError(result.reason ?? null);
      }
    });

    return () => {
      active = false;
    };
    // Boot-time check only — deliberately not keyed on apiKey changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function attemptLogin(key: string): Promise<boolean> {
    setBusy(true);
    setError(null);

    const result = await validateApiKey(key);
    if (result.ok) {
      setApiKey(key);
      setLocked(false);
      setBusy(false);
      return true;
    }

    setError(result.reason ?? 'Gagal masuk.');
    setBusy(false);
    return false;
  }

  function logout() {
    setApiKey('');
    setLocked(true);
    setError(null);
  }

  return { locked, busy, error, attemptLogin, logout };
}
