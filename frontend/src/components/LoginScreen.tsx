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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-chill-bg px-4 text-chill-text">
      {/* Ambient glow — deliberately faint, never a bright colour wash. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-chill-accent/[0.06] blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-white/[0.04] blur-[110px]"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-none border border-chill-border bg-chill-surface text-lg font-semibold tracking-tight text-chill-accent pixel-shadow-sm">
            ∞
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-chill-text pixel-heading">OmniChat</h1>
          <p className="mt-2 text-sm text-chill-muted">Personal AI workspace</p>
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
            className="mt-5 w-full min-h-[44px] rounded-none bg-chill-accent px-4 py-2.5 text-sm font-medium text-chill-on-accent transition hover:bg-chill-accent-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            {busy ? 'Memverifikasi…' : 'Masuk'}
          </button>

          <button
            type="button"
            onClick={onEnterGuest}
            className="mt-3 w-full min-h-[44px] rounded-none border border-chill-border bg-transparent px-4 py-2.5 text-sm font-medium text-chill-text transition hover:border-chill-accent/60 hover:text-chill-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
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
