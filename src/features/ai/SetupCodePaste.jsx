import { useState } from 'react';
import { ClipboardPaste, LoaderCircle } from 'lucide-react';
import { decodeSetupCode } from './setupCode.js';

// Reads a setup code from the clipboard; falls back to a text field when the browser won't share the clipboard.
export function SetupCodePaste({ onCode, notify, busy = false, label = 'Paste setup code' }) {
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');

  async function paste() {
    try {
      const settings = decodeSetupCode(await navigator.clipboard.readText());
      if (settings) return onCode(settings);
      notify('No setup code found in the clipboard. Copy it again, or paste it below.');
    } catch {
      // Clipboard access refused or unsupported.
    }
    setManual(true);
  }

  function change(value) {
    setText(value);
    const settings = decodeSetupCode(value);
    if (settings) {
      setText('');
      onCode(settings);
    }
  }

  return (
    <div className="setup-code">
      <button className="setup-code-paste" type="button" onClick={paste} disabled={busy}>
        {busy ? <LoaderCircle className="ai-loading" aria-hidden="true" /> : <ClipboardPaste aria-hidden="true" />}{busy ? 'Connecting…' : label}
      </button>
      {manual && !busy && <input className="setup-code-input" value={text} onChange={(event) => change(event.target.value)} placeholder="DF1.…" aria-label="Setup code" autoFocus autoComplete="off" autoCapitalize="none" spellCheck="false" />}
    </div>
  );
}
