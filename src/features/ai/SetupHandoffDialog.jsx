import { useId, useState } from 'react';
import { Check, Copy, Share, SquarePlus, X } from 'lucide-react';
import { platform } from '../../app/pwa.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';

// Shown after a setup link opens in Safari: the Home Screen app has its own storage, so the code is carried over by hand.
export function SetupHandoffDialog({ code, onClose }) {
  const [shown, closing] = usePresence(code, 150);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const id = useId();
  useEscape(Boolean(code), onClose);
  if (!shown) return null;

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
        <div className="dialog-heading"><h2 id={`${id}-title`}>AI is ready</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        <p>It works in this browser now. The app on your {platform() === 'mac-safari' ? 'Dock' : 'Home Screen'} keeps its own data, so bring your setup code along:</p>
        <ol className="setup-steps">
          <li>
            <button className="setup-code-paste" type="button" onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? 'Copied' : 'Copy setup code'}</button>
            {copyFailed && <input className="setup-code-input" value={shown} readOnly onFocus={(event) => event.target.select()} aria-label="Setup code" />}
          </li>
          {platform() === 'mac-safari'
            ? <li>In the menu bar choose <strong>File → Add to Dock</strong>.</li>
            : <li>Tap <Share aria-label="Share" /> <strong>Share</strong>, then <SquarePlus aria-label="Add" /> <strong>Add to Home Screen</strong>.</li>}
          <li>Open Daily Fuel from there and tap <strong>Paste setup code</strong>.</li>
        </ol>
        <div className="dialog-actions"><button className="confirm-add" type="button" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}
