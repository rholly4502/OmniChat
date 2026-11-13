import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-level guards for the transient popover / menu enter transition.
 *
 * Dialogs, bubbles, tab switches and views all enter with the stepped
 * `pixel-reveal` animation. The floating popover panels (chat-header export
 * menu, cost-details popover, sidebar session-row export menu) mount on a
 * click and should share the same register instead of appearing instantly.
 * jsdom cannot resolve CSS animations, so these read source instead of
 * rendering.
 */
const SRC = resolve(process.cwd(), 'src');

describe('popover/menu enter transition', () => {
  const header = readFileSync(resolve(SRC, 'components/ChatHeader.tsx'), 'utf8');
  const popover = readFileSync(resolve(SRC, 'components/CostDetailsPopover.tsx'), 'utf8');
  const sidebar = readFileSync(resolve(SRC, 'components/Sidebar.tsx'), 'utf8');
  const mobile = readFileSync(resolve(SRC, 'components/MobileTopBar.tsx'), 'utf8');

  it('ChatHeader export menu reveals (pixel-reveal)', () => {
    expect(header).toContain('bg-chill-elevated border-2 border-chill-border pixel-shadow pixel-reveal');
  });
  it('CostDetailsPopover panel reveals (pixel-reveal)', () => {
    expect(popover).toContain('bg-chill-elevated border-2 border-chill-border pixel-shadow p-3 pixel-reveal');
  });
  it('Sidebar session-row export menu reveals (pixel-reveal)', () => {
    expect(sidebar).toContain('bg-chill-elevated border-2 border-chill-border pixel-shadow pixel-reveal');
  });

  it('menu items have a distinct pressed state (active != hover)', () => {
    // Dropdown items: hover lightens to surface, press darkens to bg — a real
    // clicked step instead of hover==active. Pinned for all three export menus.
    expect(header.match(/active:bg-chill-bg/g)).toHaveLength(1);
    expect(mobile.match(/active:bg-chill-bg/g)).toHaveLength(1);
    expect(sidebar.match(/active:bg-chill-bg/g)).toHaveLength(2);
  });
});
