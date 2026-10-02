import { useEffect, useRef, useState } from 'react';

export function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function shiftDate(value, amount) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function loadLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

export function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

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

export function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onEscape]);
}
