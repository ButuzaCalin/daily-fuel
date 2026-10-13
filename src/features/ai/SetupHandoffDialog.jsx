import { useId, useState } from 'react';
import { Check, Copy, Download, Share, SquarePlus, X } from 'lucide-react';
import { platform, promptInstall, useCanInstall } from '../../app/pwa.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';

// Shown when a setup link opens in the browser: AI is set up in the installed app, so the link is copied,
// the app installed, and the link pasted there.
export function SetupHandoffDialog({ link, onClose }) {
  const [shown, closing] = usePresence(link, 150);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const canInstall = useCanInstall();
  const id = useId();
  useEscape(Boolean(link), onClose);
  if (!shown) return null;
  const kind = platform();

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation">
      <section className="add-meal-dialog setup-handoff" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading"><h2 id={`${id}-title`}>Install Daily Fuel</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        <p>AI estimates are set up in the app, not in the browser. Keep this link in your clipboard while you install it:</p>
        <ol className="setup-steps">
          <li>
            <button className="setup-code-paste" type="button" onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? 'Copied' : 'Copy setup link'}</button>
            {copyFailed && <input className="setup-code-input" value={shown} readOnly onFocus={(event) => event.target.select()} aria-label="Setup link" />}
          </li>
          {kind === 'ios' && <li>Tap <Share aria-label="Share" /> <strong>Share</strong>, then <SquarePlus aria-label="Add" /> <strong>Add to Home Screen</strong>.</li>}
          {kind === 'mac-safari' && <li>In the menu bar choose <strong>File → Add to Dock</strong>.</li>}
          {kind === 'other' && (canInstall
            ? <li><button className="setup-code-paste" type="button" onClick={promptInstall}><Download aria-hidden="true" />Install the app</button></li>
            : <li>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>)}
          <li>Open Daily Fuel from your {kind === 'mac-safari' ? 'Dock' : 'home screen'} and tap <strong>Paste setup code</strong>.</li>
        </ol>
        <div className="dialog-actions"><button className="confirm-add" type="button" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}
