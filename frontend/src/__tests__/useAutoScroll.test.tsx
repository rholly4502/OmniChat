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

/**
 * A host whose scroll geometry can be driven, so "is the reader at the bottom"
 * is controllable. jsdom reports `scrollTop` as 0 and ignores writes on a
 * non-scrollable element, so the field is replaced with a backed property.
 */
function makeScrollableHost({ scrollHeight = 1234, clientHeight = 400, scrollTop = 0 } = {}) {
  const el = document.createElement('div');
  let top = scrollTop;
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    set: (value: number) => { top = value; },
    configurable: true,
  });
  const scrollTo = vi.fn();
  el.scrollTo = scrollTo as unknown as typeof el.scrollTo;
  document.body.appendChild(el);
  return {
    el,
    scrollTo,
    ref: { current: el } as RefObject<HTMLDivElement | null>,
    /** Move the reader without the browser synthesising a scroll event. */
    setScrollTop: (value: number) => { top = value; },
  };
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

  it('leaves the transcript alone while the reader is scrolled up mid-stream', () => {
    const { el, scrollTo, ref } = makeScrollableHost();
    const { rerender } = renderHook(({ messages }) => useAutoScroll(messages, ref), {
      initialProps: { messages: [] as Message[] },
    });
    rerender({ messages: [msg('hi')] });
    // scrollTop 0 of 1234 with a 400px viewport: 834px above the bottom.
    el.dispatchEvent(new Event('scroll'));
    scrollTo.mockClear();
    // A token arriving must not yank the reader back down.
    rerender({ messages: [msg('hi there')] });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('resumes pinning once the reader scrolls back to the bottom', () => {
    const { el, scrollTo, ref, setScrollTop } = makeScrollableHost();
    const { rerender } = renderHook(({ messages }) => useAutoScroll(messages, ref), {
      initialProps: { messages: [] as Message[] },
    });
    rerender({ messages: [msg('hi')] });
    el.dispatchEvent(new Event('scroll'));
    setScrollTop(834); // exactly at the bottom
    el.dispatchEvent(new Event('scroll'));
    scrollTo.mockClear();
    rerender({ messages: [msg('hi there')] });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'auto' });
  });

  it('still pins when a message is appended after the reader scrolled up', () => {
    const { el, scrollTo, ref } = makeScrollableHost();
    const { rerender } = renderHook(({ messages }) => useAutoScroll(messages, ref), {
      initialProps: { messages: [] as Message[] },
    });
    rerender({ messages: [msg('hi')] });
    el.dispatchEvent(new Event('scroll'));
    scrollTo.mockClear();
    // Sending is the reader's own action, so it always wins over the scroll lock.
    rerender({ messages: [msg('hi'), msg('there')] });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'smooth' });
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
