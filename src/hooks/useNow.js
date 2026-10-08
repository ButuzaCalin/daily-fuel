import { useEffect, useState } from 'react';

// Re-renders once a minute so time-based UI (day completion) stays current.
export function useNow(active) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}
