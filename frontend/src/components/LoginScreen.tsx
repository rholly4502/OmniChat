import { type FormEvent, useState } from 'react';

interface LoginScreenProps {
  /** Runs the credential check; resolves true on success. */
  onSubmit: (key: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  /** Enters the workspace as an anonymous guest (no API key, direct LLM only). */
  onEnterGuest: () => void;
}

/**
 * Full-screen sign-in gate, styled in the warm "chill vibe" pixel-art register:
 * deep warm charcoal canvas, soft golden-sand accent, chunky hard-edge shadows
 * and a terminal-ish brand. No loud colours — the only chromatic note is the
 * accent used purely to signal focus and the primary action.
 */
export default function LoginScreen({ onSubmit, busy, error, onEnterGuest }: LoginScreenProps) {
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !key.trim()) return;
    void onSubmit(key.trim());
  }

  return (
    <div className="relative flex min-h-[100svh] min-h-dvh items-center justify-center overflow-hidden bg-chill-bg px-4 text-chill-text">
      {/* Pixel backdrop — one faint, full-canvas hard-edged checkerboard so the
          warm charcoal reads as a single consistent pixel register. Pure
          decoration, aria-hidden. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 text-chill-accent opacity-[0.05] pixel-grid"
      />

      <div className="relative w-full max-w-sm">
        <div className="group mb-10 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-none border border-chill-border bg-chill-surface text-lg font-semibold tracking-tight text-chill-accent pixel-shadow-sm">
            ∞
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-chill-text pixel-heading">OmniChat</h1>
          <span className="mt-2 text-sm text-chill-muted">Personal AI workspace</span>
          {/* Subtle easter egg — pixel nods to Stardew Valley & Dave the Diver:
              a sprout (sage) over calm waves (deep sea), revealed gently on hover.
              Pure decoration — aria-hidden, rect-only, never interactive, so it
              cannot affect usability or the a11y tree. */}
          <div aria-hidden="true" className="mt-3.5 flex items-center justify-center gap-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 select-none">
            <svg width="26" height="12" viewBox="0 0 26 12" fill="none" aria-hidden="true" className="text-chill-deepsea shrink-0">
              <rect x="1" y="5" width="4" height="2" fill="currentColor" />
              <rect x="1" y="8" width="4" height="2" fill="currentColor" opacity="0.65" />
              <rect x="5" y="3" width="7" height="6" fill="currentColor" />
              <rect x="12" y="3" width="5" height="6" fill="currentColor" opacity="0.85" />
              <rect x="17" y="4" width="5" height="4" fill="currentColor" />
              <rect x="5" y="6" width="7" height="3" fill="currentColor" opacity="0.45" />
            </svg>
            <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true" className="text-chill-sage shrink-0">
              <rect x="10" y="6" width="2" height="7" fill="currentColor" />
              <rect x="6" y="4" width="4" height="2" fill="currentColor" />
              <rect x="12" y="4" width="4" height="2" fill="currentColor" />
              <rect x="4" y="2" width="3" height="2" fill="currentColor" opacity="0.55" />
              <rect x="15" y="2" width="3" height="2" fill="currentColor" opacity="0.55" />
              <rect x="3" y="13" width="16" height="2" fill="currentColor" opacity="0.25" />
            </svg>
            <span className="text-xs text-chill-muted">a calm ocean farm</span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-none border border-chill-border bg-chill-surface p-6 pixel-shadow"
        >
          <label
            htmlFor="apikey"
            className="block text-xs font-medium uppercase tracking-[0.14em] text-chill-muted"
          >
            API key
          </label>
          <input
            id="apikey"
            type={reveal ? 'text' : 'password'}
            autoComplete="off"
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Masukkan API key Anda"
            className="mt-2 w-full rounded-none border border-chill-border bg-chill-bg px-3.5 py-2.5 text-base md:text-sm text-chill-text outline-none transition placeholder:text-chill-muted focus:border-chill-accent/40 focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          />

          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="mt-1 inline-flex min-h-[44px] items-center text-sm text-chill-muted transition hover:text-chill-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            {reveal ? 'Tutup' : 'Tampilkan'} kunci
          </button>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-none border border-chill-red/20 bg-chill-red/[0.06] px-3 py-2 text-xs text-chill-red"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="mt-5 w-full min-h-[44px] rounded-none bg-chill-accent px-4 py-2.5 text-sm font-medium text-chill-on-accent pixel-shadow transition hover:bg-chill-accent-hover active:bg-chill-accent-active active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            {busy ? 'Memverifikasi…' : 'Masuk'}
          </button>

          <button
            type="button"
            onClick={onEnterGuest}
            className="mt-3 w-full min-h-[44px] rounded-none border border-chill-border bg-transparent px-4 py-2.5 text-sm font-medium text-chill-text transition hover:border-chill-accent/60 hover:text-chill-accent active:bg-chill-surface/60 active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            Lanjut sebagai tamu
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-chill-muted">
          Kunci hanya disimpan di peramban Anda
          <br />
          dan dikirim langsung ke server.
        </p>
      </div>
    </div>
  );
}
