import { decimalInput } from '../lib/format.js';

export function ManualInput({ label, value, onChange }) {
  return <label className="manual-input">{label}<input type="text" inputMode="decimal" value={value} onChange={(event) => onChange(decimalInput(event.target.value))} /></label>;
}
