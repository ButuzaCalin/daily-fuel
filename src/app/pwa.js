import { useSyncExternalStore } from 'react';

// Production registers the service worker; dev removes any stale one so Vite changes are never cached.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    if (import.meta.env.PROD) {
      await navigator.serviceWorker.register('/sw.js').catch(() => {});
      return;
    }
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  });
}

// Fetches the latest app files; only Cache Storage is cleared, so localStorage data is kept.
export async function updateApp() {
  if (!navigator.onLine) throw new Error('You are offline. Connect to update the app.');
  const registration = await navigator.serviceWorker?.getRegistration();
  await registration?.update();
  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }
  window.location.replace('/');
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// iPadOS reports itself as a Mac, so touch support tells the two apart.
export function platform() {
  const ua = navigator.userAgent;
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return 'ios';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua)) return 'mac-safari';
  return 'other';
}

// Chrome, Edge and Samsung Internet offer their own install dialog. The event can fire before React mounts,
// so it is captured at import time.
let installPrompt = null;
const installListeners = new Set();
const notifyInstall = () => installListeners.forEach((listener) => listener());
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  notifyInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  notifyInstall();
});

// Whether the browser's install dialog is available right now.
export function useCanInstall() {
  return useSyncExternalStore((listener) => {
    installListeners.add(listener);
    return () => installListeners.delete(listener);
  }, () => Boolean(installPrompt));
}

export async function promptInstall() {
  const prompt = installPrompt;
  if (!prompt) return;
  installPrompt = null;
  notifyInstall();
  await prompt.prompt();
}
