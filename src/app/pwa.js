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

// Apple's Home Screen and Dock apps get their own storage, so what a Safari tab saves doesn't reach them.
// Chrome, Edge, Samsung Internet and Firefox share storage between the browser and the installed app.
export function sharesStorageWithInstalledApp() {
  return isStandalone() || platform() === 'other';
}
