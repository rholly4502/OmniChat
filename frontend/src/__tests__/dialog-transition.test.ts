import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-level guards for the modal-dialog enter transition.
 *
 * Every full-screen modal (Stats, Audit) mounts instantly on open. To keep
 * them in the same stepped pixel register as the tab switches and the mobile
 * sidebar scrim, each dialog's backdrop must carry `pixel-overlay-fade` and
 * its panel `pixel-reveal`. jsdom cannot resolve CSS animations, so these
 * read source instead of rendering.
 */
const SRC = resolve(process.cwd(), 'src');

describe('dialog enter transition', () => {
  const stats = readFileSync(resolve(SRC, 'components/ChatStatsDialog.tsx'), 'utf8');
  const audit = readFileSync(resolve(SRC, 'components/ConversationAuditDialog.tsx'), 'utf8');
  const shortcuts = readFileSync(resolve(SRC, 'components/ShortcutsDialog.tsx'), 'utf8');

  it('ChatStatsDialog backdrop fades in (pixel-overlay-fade)', () => {
    expect(stats).toContain('bg-chill-bg/60 pixel-overlay-fade');
  });
  it('ChatStatsDialog panel reveals (pixel-reveal)', () => {
    expect(stats).toContain('pixel-shadow p-4 space-y-3 pixel-reveal');
  });
  it('ConversationAuditDialog backdrop fades in (pixel-overlay-fade)', () => {
    expect(audit).toContain('bg-chill-bg/60 pixel-overlay-fade');
  });
  it('ConversationAuditDialog panel reveals (pixel-reveal)', () => {
    expect(audit).toContain('pixel-shadow p-4 space-y-3 pixel-reveal');
  });

  it('ShortcutsDialog backdrop fades in (pixel-overlay-fade)', () => {
    expect(shortcuts).toContain('bg-chill-bg/60 pixel-overlay-fade');
  });
  it('ShortcutsDialog panel reveals (pixel-reveal)', () => {
    expect(shortcuts).toContain('pixel-shadow p-4 space-y-3 pixel-reveal');
  });
});
