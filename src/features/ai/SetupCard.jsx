import { Sparkles, X } from 'lucide-react';
import { SetupCodePaste } from './SetupCodePaste.jsx';

// Home screen nudge while AI isn't set up: one tap pastes the code received from the app's admin.
export function SetupCard({ onCode, busy, notify, onOpenSettings, onDismiss }) {
  return (
    <aside className="setup-card" aria-labelledby="setup-card-title">
      <Sparkles className="setup-card-icon" aria-hidden="true" />
      <div className="setup-card-body">
        <h2 id="setup-card-title">Set up AI estimates</h2>
        <p>Paste the setup code you received, or <button className="setup-card-link" type="button" onClick={onOpenSettings}>use your own API key</button>.</p>
        <SetupCodePaste onCode={onCode} busy={busy} notify={notify} />
      </div>
      <button className="install-close" type="button" onClick={onDismiss} aria-label="Not now"><X aria-hidden="true" /></button>
    </aside>
  );
}
