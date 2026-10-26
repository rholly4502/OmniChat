import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Message } from '../types';

/**
 * How close to the bottom (in px) the transcript must be for a streaming token
 * to keep pinning it. Anything further away means the reader deliberately
 * scrolled up and must not be dragged back.
 */
export const STICK_THRESHOLD_PX = 64;

/**
 * Keeps the transcript pinned to the bottom (frontend decomposition step 9).
 *
 * Scrolling only happens while the reader is at the bottom. A content-only
 * update is a streaming token, and snapping the view down on every token made
 * it impossible to scroll up and read the start of a long answer: the next
 * token yanked you back. Pinning is tracked from real `scroll` events rather
 * than measured per update, because a large chunk (a table, a long code block)
 * grows the content by more than the threshold and would otherwise look like
 * the reader had scrolled away.
 *
 * An appended message still wins over the scroll lock: that is the reader's
 * own send, or a restored session, and both expect the newest turn on screen.
 *
 * Smooth scrolling is used only when a message is appended; a token append
 * jumps instantly, because restarting a smooth animation per token janks on
 * mobile. Users who ask for reduced motion always get the instant jump.
 */
export function useAutoScroll(messages: Message[], scrollRef: RefObject<HTMLDivElement | null>) {
  const prevMsgCount = useRef(0);
  /** false once the reader scrolls away from the bottom. */
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNewMessage = messages.length !== prevMsgCount.current;
    prevMsgCount.current = messages.length;
    if (!isNewMessage && !pinnedRef.current) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: prefersReducedMotion || !isNewMessage ? 'auto' : 'smooth',
    });
  }, [messages, scrollRef]);
}
