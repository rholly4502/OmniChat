/** Props accepted by {@link SidebarOverlay}. */
export interface SidebarOverlayProps {
  /** Close the drawer when the backdrop is tapped. */
  onClose: () => void;
}

/**
 * Tappable backdrop behind the mobile sidebar drawer (frontend decomposition
 * step 9). Rendered only while the drawer is open, and hidden from `md` up
 * where the sidebar is a static column.
 */
export function SidebarOverlay({ onClose }: SidebarOverlayProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-40 md:hidden"
      onClick={onClose}
      aria-hidden="true"
    />
  );
}
