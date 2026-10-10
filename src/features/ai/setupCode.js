// A setup code bundles the proxy URL, username and access key, so a user taps a link or pastes one thing.
// Format: DF1.<base64url of {"u": url, "n": username, "k": key}>. Links carry it as /#setup=<code>.
const PREFIX = 'DF1.';

export function encodeSetupCode({ proxyUrl, proxyUsername, proxyKey }) {
  const bytes = new TextEncoder().encode(JSON.stringify({ u: proxyUrl, n: proxyUsername, k: proxyKey }));
  return PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Accepts the bare code or anything containing it (a pasted link or message). Returns proxy settings, or null.
export function decodeSetupCode(text) {
  const match = String(text || '').match(/DF1\.([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[1].replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
    const { u, n, k } = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof u !== 'string' || !/^https?:\/\//.test(u) || !n || !k) return null;
    return { aiMode: 'proxy', proxyUrl: u, proxyUsername: String(n), proxyKey: String(k) };
  } catch {
    return null;
  }
}

let linked;

// Reads a setup link once and removes it from the address bar, so the key doesn't stay in history.
export function takeLinkedSetup() {
  if (linked === undefined) {
    const code = new URLSearchParams(window.location.hash.slice(1)).get('setup');
    linked = code ? { code, settings: decodeSetupCode(code) } : null;
    if (code) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return linked;
}
