import { ManualInput } from '../../components/ManualInput.jsx';
import { suggestTarget } from './goal.js';

const fields = [['calories', 'Calories (kcal)'], ['proteins', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fats', 'Fat (g)']];

// The four targets as text drafts; with three filled in, the fourth offers the value that matches them.
export function GoalTargetInputs({ draft, setDraft }) {
  const suggested = suggestTarget(draft);
  return fields.map(([key, label]) => (
    <ManualInput key={key} label={label} value={draft[key]} suggestion={suggested?.key === key ? suggested.value : null} onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} />
  ));
}
