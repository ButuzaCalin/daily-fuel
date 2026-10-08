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
