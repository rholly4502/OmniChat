export function BotIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="11" width="18" height="10" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <circle cx="8.5" cy="16" r="1" fill="currentColor" />
      <circle cx="15.5" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

export function BoltIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function UnlockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}



/** Chill Mode sun glyph (relaxed persona). Shared so the Sidebar toggle and the
    ChatHeader/MobileTopBar mode pills render one identical mark. */
export function ChillIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42M18.36 18.36l-1.42-1.42M7.06 7.06 5.64 5.64M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" />
    </svg>
  );
}
