import { useLayoutEffect, useRef } from 'react';

// A one-line text field that wraps long names onto more lines instead of hiding them (an input cannot wrap).
// Line breaks are typed as Enter, which callers handle, so the value always stays a single line.
export function NameField({ value, onChange, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows="1" value={value} onChange={(event) => onChange(event.target.value.replace(/\s*\n\s*/g, ' '))} {...props} />;
}

export function TypeToggle({ value, onChange, label }) {
  return (
    <div className="exercise-type" role="radiogroup" aria-label={label}>
      {[['reps', 'Reps'], ['time', 'Time']].map(([type, text]) => <button className={value === type ? 'active' : ''} type="button" role="radio" aria-checked={value === type} onClick={() => onChange(type)} key={type}>{text}</button>)}
    </div>
  );
}
