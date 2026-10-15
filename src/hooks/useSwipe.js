import { useRef } from 'react';

const MIN_DISTANCE = 60;
const MAX_DURATION = 600;

export function useSwipe(onSwipeLeft, onSwipeRight) {
  const start = useRef(null);
  return {
    onTouchStart(event) {
      const touch = event.touches[0];
      start.current = event.touches.length === 1 && !event.target.closest('input, textarea, select, [role="dialog"]')
        ? { x: touch.clientX, y: touch.clientY, time: Date.now() }
        : null;
    },
    onTouchEnd(event) {
      const origin = start.current;
      start.current = null;
      if (!origin) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - origin.time > MAX_DURATION) return;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
    onTouchCancel() { start.current = null; },
  };
}
