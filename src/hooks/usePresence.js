import { useEffect, useRef, useState } from 'react';

// Keeps an overlay mounted for `duration` ms after it closes so its exit animation can play.
// Effects depend on open/closed only: callers pass a fresh object each render, and syncing it into state looped.
export function usePresence(value, duration) {
  const open = Boolean(value);
  const lastValue = useRef(value);
  if (value) lastValue.current = value;
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [open, duration]);
  return [value || (mounted ? lastValue.current : null), closing];
}
