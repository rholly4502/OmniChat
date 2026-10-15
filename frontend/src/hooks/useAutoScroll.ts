import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Message } from '../types';

/**
 * Keeps the transcript pinned to the bottom (frontend decomposition step 9).
 *
 * Scrolls smoothly only when a message is appended; a content-only update to
 * the trailing message (token streaming) jumps instantly, because restarting a
 * smooth animation on every token janks on mobile. Users who ask for reduced
 * motion always get the instant jump.
 */
export function useAutoScroll(messages: Message[], scrollRef: RefObject<HTMLDivElement | null>) {
  const prevMsgCount = useRef(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isNewMessage = messages.length !== prevMsgCount.current;
    prevMsgCount.current = messages.length;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: prefersReducedMotion || !isNewMessage ? 'auto' : 'smooth',
    });
  }, [messages, scrollRef]);
}
