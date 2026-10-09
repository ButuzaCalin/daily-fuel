import { useId } from 'react';
import { decimalInput } from '../lib/format.js';

// `suggestion` shows as the placeholder, with a button to fill it in.
export function ManualInput({ label, value, onChange, suggestion }) {
  const id = useId();
  return (
    <div className="manual-input">
      <span className="manual-input-label">
        <label htmlFor={id}>{label}</label>
        {suggestion != null && <button className="manual-input-suggest" type="button" onClick={() => onChange(String(suggestion))}>Use {suggestion}</button>}
      </span>
      <input id={id} type="text" inputMode="decimal" value={value} placeholder={suggestion ?? undefined} onChange={(event) => onChange(decimalInput(event.target.value))} />
    </div>
  );
}
