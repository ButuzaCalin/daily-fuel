import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, Sparkles, X } from 'lucide-react';
import { objectives } from '../score/score.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';
import { decimalInput } from '../../lib/format.js';

const goalActivityOptions = [
  ['sedentary', 'Sedentary', 'Mostly sitting'],
  ['light', 'Light', 'Some walking or light exercise'],
  ['moderate', 'Moderate', 'Regular exercise'],
  ['high', 'High', 'Hard training most days'],
  ['very_high', 'Very high', 'Intense training or physical work'],
];

export function GoalWizardDialog({ open, selected, onClose, onGenerate, onApply }) {
  const [shown, closing] = usePresence(open || null, 150);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({ sex: '', age: '', height: '', weight: '', activity: '', objective: selected });
  const [generating, setGenerating] = useState(false);
  useEscape(open && !generating, onClose);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setProfile({ sex: '', age: '', height: '', weight: '', activity: '', objective: selected });
  }, [open, selected]);

  if (!shown) return null;

  const valid = [
    Boolean(profile.sex),
    Number.isInteger(Number(profile.age)) && Number(profile.age) >= 18 && Number(profile.age) <= 100,
    Number.isFinite(Number(profile.height)) && Number(profile.height) >= 100 && Number(profile.height) <= 250 && Number.isFinite(Number(profile.weight)) && Number(profile.weight) >= 30 && Number(profile.weight) <= 300,
    Boolean(profile.activity),
    Boolean(profile.objective),
  ][step];

  async function submit(event) {
    event.preventDefault();
    if (!valid || generating) return;
    if (step < 4) {
      setStep((current) => current + 1);
      return;
    }
    setGenerating(true);
    const targets = await onGenerate({ ...profile, age: Number(profile.age), height: Number(profile.height), weight: Number(profile.weight) });
    setGenerating(false);
    if (!targets) return;
    onApply(targets, profile.objective);
    onClose();
  }

  const select = (key, value) => setProfile((current) => ({ ...current, [key]: value }));

  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (!generating && event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog goal-wizard" role="dialog" aria-modal="true" aria-labelledby="goal-wizard-title">
        <div className="dialog-heading"><div><p className="eyebrow">Personalized targets · step {step + 1} of 5</p><h2 id="goal-wizard-title">Build your daily goal</h2></div><button type="button" onClick={onClose} disabled={generating} aria-label="Close"><X /></button></div>
        <div className="goal-wizard-progress" role="progressbar" aria-label="Wizard progress" aria-valuemin="1" aria-valuemax="5" aria-valuenow={step + 1}><i style={{ width: `${((step + 1) / 5) * 100}%` }} /></div>
        <form onSubmit={submit}>
          <div className="goal-wizard-question">
            {step === 0 && <><h3>Which sex should the estimate use?</h3><div className="goal-wizard-options" role="radiogroup" aria-label="Sex">{[['female', 'Female'], ['male', 'Male']].map(([value, label]) => <button type="button" role="radio" aria-checked={profile.sex === value} className={profile.sex === value ? 'active' : ''} onClick={() => select('sex', value)} key={value}>{label}</button>)}</div></>}
            {step === 1 && <><h3>How old are you?</h3><label className="goal-wizard-field">Age<input type="number" min="18" max="100" step="1" inputMode="numeric" value={profile.age} onChange={(event) => select('age', event.target.value)} placeholder="18–100" /></label></>}
            {step === 2 && <><h3>What are your height and weight?</h3><label className="goal-wizard-field">Height (cm)<input type="number" min="100" max="250" step="1" inputMode="numeric" value={profile.height} onChange={(event) => select('height', event.target.value)} placeholder="100–250 cm" /></label><label className="goal-wizard-field">Weight (kg)<input type="text" inputMode="decimal" value={profile.weight} onChange={(event) => select('weight', decimalInput(event.target.value))} placeholder="30–300 kg" /></label></>}
            {step === 3 && <><h3>How active are you most weeks?</h3><div className="goal-wizard-options goal-wizard-list" role="radiogroup" aria-label="Activity level">{goalActivityOptions.map(([value, label, description]) => <button type="button" role="radio" aria-checked={profile.activity === value} className={profile.activity === value ? 'active' : ''} onClick={() => select('activity', value)} key={value}><strong>{label}</strong><small>{description}</small></button>)}</div></>}
            {step === 4 && <><h3>What is your main purpose?</h3><div className="goal-wizard-options goal-wizard-list" role="radiogroup" aria-label="Goal purpose">{Object.entries(objectives).map(([value, objective]) => <button type="button" role="radio" aria-checked={profile.objective === value} className={profile.objective === value ? 'active' : ''} onClick={() => select('objective', value)} key={value}><strong>{objective.label}</strong><small>{objective.description}</small></button>)}</div></>}
          </div>
          <p className="goal-wizard-note">For adults 18+. Estimates are informational, not medical advice.</p>
          <div className="goal-wizard-actions">
            {step > 0 && <button type="button" className="wizard-back" onClick={() => setStep((current) => current - 1)} disabled={generating}><ChevronLeft aria-hidden="true" />Back</button>}
            <button type="submit" className="wizard-next" disabled={!valid || generating}>{generating ? <><LoaderCircle className="is-spinning" aria-hidden="true" />Thinking…</> : step === 4 ? <><Sparkles aria-hidden="true" />Generate targets</> : <>Continue<ChevronRight aria-hidden="true" /></>}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
