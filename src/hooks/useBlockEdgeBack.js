import { useEffect } from 'react';

// Safari in a tab starts its back gesture from the screen edge; claiming touches that begin right at the edge
// keeps it from taking over. Controls are left alone so they still get taps. The installed app has no such gesture.
export function useBlockEdgeBack(active) {
  useEffect(() => {
    if (!active) return undefined;
    const handleStart = (event) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || (touch.clientX > 20 && touch.clientX < window.innerWidth - 20)) return;
      if (event.target.closest('button, a, input, textarea, select, label, [role="dialog"]')) return;
      event.preventDefault();
    };
    window.addEventListener('touchstart', handleStart, { passive: false });
    return () => window.removeEventListener('touchstart', handleStart);
  }, [active]);
}
