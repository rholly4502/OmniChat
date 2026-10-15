import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { useAutoScroll } from '../hooks/useAutoScroll';
import type { Message } from '../types';

/**
 * Unit tests for the auto-scroll hook (frontend decomposition step 9).
 *
 * The behaviour that matters is which scroll *behavior* is chosen: a new
 * message animates, a token append to the trailing message jumps instantly
 * (a smooth animation restarted per token janks on mobile).
 */
function makeScrollHost() {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: 1234, configurable: true });
  const scrollTo = vi.fn();
  el.scrollTo = scrollTo as unknown as typeof el.scrollTo;
  document.body.appendChild(el);
  return { el, scrollTo, ref: { current: el } as RefObject<HTMLDivElement | null> };
}

function msg(content: string): Message {
  return { role: 'assistant', content };
}

function mockReducedMotion(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useAutoScroll', () => {
  it('pins the transcript to the bottom on first paint', () => {
    const { scrollTo, ref } = makeScrollHost();
    renderHook(({ messages }) => useAutoScroll(messages, ref), {
      initialProps: { messages: [] as Message[] },
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'auto' });
  });

  it('scrolls smoothly when a message is appended', () => {
    const { scrollTo, ref } = makeScrollHost();
    const { rerender } = renderHook(({ messages }) => useAutoScroll(messages, ref), {
      initialProps: { messages: [] as Message[] },
    });
    scrollTo.mockClear();
    rerender({ messages: [msg('hi')] });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'smooth' });
  });

  it('jumps instantly when only the trailing message content grows', () => {
    const { scrollTo, ref } = makeScrollHost();
    const { rerender } = renderHook(({ messages }) => useAutoScroll(messages, ref), {
      initialProps: { messages: [] as Message[] },
    });
    rerender({ messages: [msg('hi')] });
    scrollTo.mockClear();
    rerender({ messages: [msg('hi there')] });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'auto' });
  });

  it('always jumps instantly when the user prefers reduced motion', () => {
    mockReducedMotion(true);
    const { scrollTo, ref } = makeScrollHost();
    const { rerender } = renderHook(({ messages }) => useAutoScroll(messages, ref), {
      initialProps: { messages: [] as Message[] },
    });
    scrollTo.mockClear();
    rerender({ messages: [msg('hi')] });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'auto' });
  });

  it('does not throw when the scroll container is not mounted yet', () => {
    const ref = { current: null } as RefObject<HTMLDivElement | null>;
    expect(() =>
      renderHook(({ messages }) => useAutoScroll(messages, ref), {
        initialProps: { messages: [] as Message[] },
      }),
    ).not.toThrow();
  });
});
