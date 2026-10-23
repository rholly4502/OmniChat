import { isValidElement, useRef, useState, type ReactNode } from 'react';

/**
 * Markdown `<pre>` renderer with language header and copy-to-clipboard button.
 * Re-exported from App.tsx for compatibility.
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

  // Extract language from className="language-xyz" if rendered by react-markdown
  let language = '';
  if (isValidElement(children) && typeof children.props === 'object' && children.props !== null) {
    const className = (children.props as { className?: string }).className || '';
    const match = /language-(\w+)/.exec(className);
    if (match) {
      language = match[1];
    }
  }

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-950/90 shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-xs text-slate-400 select-none">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs md:text-[11px] font-medium text-slate-400 hover:text-cyan-300 bg-slate-800/80 hover:bg-slate-800 rounded px-2.5 py-1.5 flex items-center gap-1.5 min-h-[44px] md:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 transition-colors"
          aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
        >
          {copied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              <span>Copied</span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre ref={preRef} className="code-block-pre px-4 py-3 text-sm font-mono overflow-x-auto text-slate-100 leading-relaxed">{children}</pre>
    </div>
  );
}
