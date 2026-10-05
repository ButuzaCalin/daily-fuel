import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { loadLocal, saveLocal, usePresence } from './shared.js';

const DISMISS_KEY = 'daily-fuel-install-dismissed';
const INSTALLED_KEY = 'daily-fuel-install-hidden';
const SNOOZE_DAYS = 14;
const SHOW_DELAY = 2500;

// Chrome can fire this before React mounts, so capture it at import time.
let deferredPrompt = null;
const listeners = new Set();
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  listeners.forEach((listener) => listener());
});

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// iPadOS reports itself as a Mac, so touch support tells the two apart.
function platform() {
  const ua = navigator.userAgent;
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return 'ios';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua)) return 'mac-safari';
  return 'other';
}

function snoozed() {
  const dismissedAt = loadLocal(DISMISS_KEY, 0);
  return Date.now() - dismissedAt < SNOOZE_DAYS * 86400000;
}

export function InstallPrompt() {
  const [kind] = useState(platform);
  const [canPrompt, setCanPrompt] = useState(Boolean(deferredPrompt));
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => isStandalone() || loadLocal(INSTALLED_KEY, false) || snoozed());

  useEffect(() => {
    const update = () => setCanPrompt(Boolean(deferredPrompt));
    const installed = () => { deferredPrompt = null; setDismissed(true); };
    listeners.add(update);
    window.addEventListener('appinstalled', installed);
    const timer = window.setTimeout(() => setReady(true), SHOW_DELAY);
    return () => { listeners.delete(update); window.removeEventListener('appinstalled', installed); window.clearTimeout(timer); };
  }, []);

  const supported = kind !== 'other' || canPrompt;
  const [shown, closing] = usePresence(ready && supported && !dismissed ? kind : null, 180);
  if (!shown) return null;

  function dismiss() {
    saveLocal(DISMISS_KEY, Date.now());
    setDismissed(true);
  }

  // Safari can't tell a browser tab the app is installed, so let Apple users say so.
  function alreadyInstalled() {
    saveLocal(INSTALLED_KEY, true);
    setDismissed(true);
  }

  async function install() {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    setCanPrompt(false);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setDismissed(true);
    else dismiss();
  }

  return (
    <aside className="install-prompt" data-closing={closing || undefined} aria-labelledby="install-prompt-title">
      <img className="install-icon" src="/icon.svg" alt="" />
      <div className="install-body">
        <h2 id="install-prompt-title">Install Daily Fuel</h2>
        {shown === 'ios' && <p>Tap <Share aria-label="Share" /> <strong>Share</strong>, then <SquarePlus aria-label="Add" /> <strong>Add to Home Screen</strong>.</p>}
        {shown === 'mac-safari' && <p>In the menu bar choose <strong>File → Add to Dock</strong>.</p>}
        {shown === 'other' && <p>Open it from your home screen and use it offline.</p>}
        {shown !== 'other' && <button className="install-installed" type="button" onClick={alreadyInstalled}>Already installed</button>}
        {shown === 'other' && <button className="install-action" type="button" onClick={install}><Download aria-hidden="true" />Install</button>}
      </div>
      <button className="install-close" type="button" onClick={dismiss} aria-label="Not now"><X aria-hidden="true" /></button>
    </aside>
  );
}
