import { useSyncExternalStore } from 'react';
import { loadLocal, saveLocal } from '../../lib/storage.js';
import { callProxy } from '../ai/proxy.js';
import { encodeSetupCode } from '../ai/setupCode.js';

// The invites function (supabase/functions/invites) answers { inviter: false } for users who can't invite.
export const INVITES_URL = 'https://inddklcpihbaobalkwrs.supabase.co/functions/v1/quick-worker';

// The invited user gets the same estimate URL as the inviter. Dev links open the dev server.
const APP_URL = import.meta.env.DEV ? window.location.origin : 'https://dailyfuel.shop';

export function inviteLink(settings, invite) {
  return `${APP_URL}/#setup=${encodeSetupCode({ proxyUrl: settings.proxyUrl, proxyUsername: invite.name, proxyKey: invite.accessKey })}`;
}

export function fetchInvites(settings) {
  return callProxy(settings, { action: 'list' }, INVITES_URL);
}

export function createInvite(settings, name) {
  return callProxy(settings, { action: 'create', name }, INVITES_URL);
}

export function cancelInvite(settings, name) {
  return callProxy(settings, { action: 'cancel', name }, INVITES_URL);
}

// Whether the menu shows "My invites". Remembered so the link doesn't pop in on every app open.
const listeners = new Set();
let canInvite = loadLocal('daily-fuel-can-invite', false);

export function setCanInvite(value) {
  if (value === canInvite) return;
  canInvite = value;
  saveLocal('daily-fuel-can-invite', value);
  listeners.forEach((listener) => listener());
}

export function useCanInvite() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, () => canInvite);
}
