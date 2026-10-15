import { useRef, useState, type ReactNode } from 'react';

/**
 * Markdown `<pre>` renderer with a copy-to-clipboard button.
 * Extracted from App.tsx (frontend decomposition step 4); still re-exported
 * from App.tsx so existing imports (`import { App, CodeBlock } from '../App'`)
 * keep working.
 */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = preRef.current?.textContent ?? '';
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 md:top-2 md:right-2 z-10 text-xs md:text-[11px] font-medium text-slate-400 hover:text-cyan-300 bg-slate-800/70 rounded px-3 py-2 md:px-2.5 md:py-1.5 flex items-center gap-1 min-h-[44px] md:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 transition-colors"
        aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre ref={preRef} className="code-block-pre">{children}</pre>
    </div>
  );
}
