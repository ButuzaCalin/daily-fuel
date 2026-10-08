import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function SecretInput({ label, value, onChange }) {
  const [shown, setShown] = useState(false);
  return (
    <label>{label}
      <span className="secret-input">
        <input type={shown ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck="false" />
        <button type="button" onClick={() => setShown((current) => !current)} aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} title={shown ? 'Hide' : 'Show'}>{shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
      </span>
    </label>
  );
}
