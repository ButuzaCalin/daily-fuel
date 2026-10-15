import { useEffect } from 'react';

const EDGE_WIDTH = 28;
const MIN_DISTANCE = 50;

export function useEdgeSwipe(active, onSwipe) {
  useEffect(() => {
    if (!active) return undefined;
    let start = null;
    const handleStart = (event) => {
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch.clientX <= EDGE_WIDTH && !event.target.closest('[role="dialog"]')
        ? { x: touch.clientX, y: touch.clientY }
        : null;
    };
    const handleEnd = (event) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      start = null;
      if (dx >= MIN_DISTANCE && dx > Math.abs(dy) * 1.5) onSwipe();
    };
    const handleCancel = () => { start = null; };
    window.addEventListener('touchstart', handleStart, { passive: true });
    window.addEventListener('touchend', handleEnd, { passive: true });
    window.addEventListener('touchcancel', handleCancel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleStart);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleCancel);
    };
  }, [active, onSwipe]);
}
