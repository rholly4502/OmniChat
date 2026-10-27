import { type FormEvent, useState } from 'react';

interface LoginScreenProps {
  /** Runs the credential check; resolves true on success. */
  onSubmit: (key: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  /** Enter the workspace as an anonymous guest (no key). */
  onGuest?: () => void;
}

/**
 * Full-screen sign-in gate, styled in the dark "Inception" register: near-black
 * canvas, one restrained accent, hairline borders, and a soft ambient glow. No
 * loud colours — the only chromatic note is a faint teal used purely to signal
 * focus.
 */
export default function LoginScreen({ onSubmit, busy, error, onGuest }: LoginScreenProps) {
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !key.trim()) return;
    void onSubmit(key.trim());
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#05060a] px-4 text-slate-100">
      {/* Ambient glow — deliberately faint, never a bright colour wash. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-teal-500/[0.07] blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-white/[0.04] blur-[110px]"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg font-semibold tracking-tight text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            ∞
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">OmniChat</h1>
          <p className="mt-2 text-sm text-slate-400">Personal AI workspace</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]"
        >
          <label
            htmlFor="apikey"
            className="block text-xs font-medium uppercase tracking-[0.14em] text-slate-400"
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
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-base md:text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-teal-400/40 focus-visible:ring-2 focus-visible:ring-teal-400/60"
          />

          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="mt-1 inline-flex min-h-[44px] items-center text-sm text-slate-400 transition hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
          >
            {reveal ? 'Tutup' : 'Tampilkan'} kunci
          </button>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="mt-5 w-full min-h-[44px] rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
          >
            {busy ? 'Memverifikasi…' : 'Masuk'}
          </button>
        </form>

        {onGuest && (
          <button
            type="button"
            onClick={onGuest}
            className="mt-3 w-full min-h-[44px] rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
          >
            Lanjut sebagai tamu
          </button>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
          Kunci hanya disimpan di peramban Anda
          <br />
          dan dikirim langsung ke server.
        </p>
      </div>
    </div>
  );
}
