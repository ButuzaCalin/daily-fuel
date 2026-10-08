import { useId } from 'react';
import { X } from 'lucide-react';
import { metrics, objectives } from '../score/score.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';

// Explains every objective; picking one here selects it.
export function ObjectiveInfoDialog({ open, selected, onSelect, onClose }) {
  const [shown, closing] = usePresence(open || null, 150);
  const id = useId();
  useEscape(open, onClose);
  if (!shown) return null;
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog objective-info" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading"><h2 id={`${id}-title`}>Objectives</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        <p>Your targets stay the same. The objective only changes how going over or under them affects your score.</p>
        <ul>
          {Object.entries(objectives).map(([key, objective]) => (
            <li key={key}>
              <button className={selected === key ? 'active' : ''} type="button" onClick={() => onSelect(key)} aria-pressed={selected === key}>
                <strong>{objective.label}{selected === key && <small>Selected</small>}</strong>
                <span>{objective.description}</span>
                <small>{metrics.map((metric) => `${metric.label} ${Math.round(objective.weights[metric.key] * 100)}%`).join(' · ')}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
