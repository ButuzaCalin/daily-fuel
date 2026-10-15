import { useEffect, useLayoutEffect, useRef } from 'react';

const IGNORED = 'input, textarea, select, [role="dialog"]';

// Swipes the day content sideways: it follows the finger, the day it leads to fades in at the edge,
// and a long or quick enough swipe slides the old day out before the new one slides in.
export function useDaySwipe(active, date, onShift) {
  const contentRef = useRef(null);
  const prevHintRef = useRef(null);
  const nextHintRef = useRef(null);
  const shownDate = useRef(date);
  const shift = useRef(onShift);
  shift.current = onShift;

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let gesture = null;

    const setHints = (dx) => {
      const progress = Math.min(1, Math.abs(dx) / (window.innerWidth * 0.25));
      for (const [hint, active] of [[prevHintRef.current, dx > 0], [nextHintRef.current, dx < 0]]) {
        if (!hint) continue;
        hint.style.opacity = active ? String(progress) : '0';
        hint.style.transform = active ? `translateY(-50%) scale(${0.85 + progress * 0.15})` : '';
      }
    };
    const clear = () => {
      element.style.transform = '';
      element.style.opacity = '';
      setHints(0);
    };

    const handleStart = (event) => {
      gesture = event.touches.length === 1 && !event.target.closest(IGNORED)
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now(), axis: null, dx: 0 }
        : null;
    };
    const handleMove = (event) => {
      if (!gesture) return;
      const dx = event.touches[0].clientX - gesture.x;
      const dy = event.touches[0].clientY - gesture.y;
      if (!gesture.axis) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      }
      if (gesture.axis !== 'x') return;
      event.preventDefault();
      gesture.dx = dx;
      if (!reduced()) {
        element.style.transform = `translateX(${dx * 0.6}px)`;
        element.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / window.innerWidth));
      }
      setHints(dx);
    };
    const handleEnd = () => {
      const current = gesture;
      gesture = null;
      if (!current || current.axis !== 'x') return;
      const { dx } = current;
      const fast = Math.abs(dx) / Math.max(1, Date.now() - current.time) > 0.5;
      const passed = Math.abs(dx) > window.innerWidth * 0.25 || (fast && Math.abs(dx) > 40);
      const from = { transform: element.style.transform || 'none', opacity: element.style.opacity || '1' };
      clear();
      if (!passed) {
        if (!reduced()) element.animate([from, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
        return;
      }
      const amount = dx < 0 ? 1 : -1;
      if (reduced()) { shift.current(amount); return; }
      const out = element.animate([from, { transform: `translateX(${dx < 0 ? -60 : 60}px)`, opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
      out.onfinish = () => shift.current(amount);
    };

    element.addEventListener('touchstart', handleStart, { passive: true });
    element.addEventListener('touchmove', handleMove, { passive: false });
    element.addEventListener('touchend', handleEnd);
    element.addEventListener('touchcancel', handleEnd);
    return () => {
      element.removeEventListener('touchstart', handleStart);
      element.removeEventListener('touchmove', handleMove);
      element.removeEventListener('touchend', handleEnd);
      element.removeEventListener('touchcancel', handleEnd);
    };
  }, [active]);

  // The new day slides in from the side it lies on; layout effect so the swapped content never shows unanimated.
  useLayoutEffect(() => {
    const previous = shownDate.current;
    shownDate.current = date;
    const element = contentRef.current;
    if (previous === date || !element) return;
    element.getAnimations().forEach((animation) => animation.cancel());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const offset = date > previous ? 60 : -60;
    element.animate([{ transform: `translateX(${offset}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }, [date]);

  return { contentRef, prevHintRef, nextHintRef };
}
