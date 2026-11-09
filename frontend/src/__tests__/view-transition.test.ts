import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-level guards for the cross-tab enter transition.
 *
 * When the user switches between Chat / Pengeluaran / Lowongan, each top-level
 * view mounts fresh (the App renders one branch at a time). Each view's root
 * must carry `pixel-reveal` so the stepped opacity/translateY enter animation
 * replays on every switch, and the Chat branch must be wrapped in a keyed
 * `pixel-reveal` container so it transitions too. jsdom cannot resolve the
 * CSS animation, so these read source instead of rendering.
 */

const SRC = resolve(process.cwd(), 'src');

describe('view-switch enter transition', () => {
  const app = readFileSync(resolve(SRC, 'App.tsx'), 'utf8');
  const expenses = readFileSync(resolve(SRC, 'components/ExpensesView.tsx'), 'utf8');
  const jobs = readFileSync(resolve(SRC, 'components/JobsView.tsx'), 'utf8');
  const events = readFileSync(resolve(SRC, 'components/EventsView.tsx'), 'utf8');

  it('the Chat branch is wrapped in a keyed pixel-reveal container', () => {
    expect(app).toContain('key={activeView}');
    expect(app).toContain('pixel-reveal');
    // The wrapper must preserve the flex column so MessageList still scrolls.
    expect(app).toContain('flex-1 flex flex-col min-h-0 pixel-reveal');
  });

  it('ExpensesView root carries the pixel-reveal enter animation', () => {
    // Root is the flex-1 scroll container; the reveal replays on each mount.
    expect(expenses).toContain('pixel-grid-page pixel-reveal');
  });

  it('JobsView root carries the pixel-reveal enter animation', () => {
    expect(jobs).toContain('h-full flex flex-col min-h-0 pixel-reveal');
  });

  it('EventsView root carries the pixel-reveal enter animation', () => {
    expect(events).toContain('h-full flex flex-col min-h-0 pixel-reveal');
  });
});
