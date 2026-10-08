import { usePresence } from '../hooks/usePresence.js';

export function Toast({ toast }) {
  const [shown, closing] = usePresence(toast, 180);
  if (!shown) return null;
  return (
    <div className={`toast toast-${shown.type}`} data-closing={closing || undefined} role={shown.type === 'error' ? 'alert' : 'status'} key={shown.id}>
      <span>{shown.message}</span>
      {shown.action && <button className="toast-action" type="button" onClick={shown.action.onClick}>{shown.action.label}</button>}
    </div>
  );
}
