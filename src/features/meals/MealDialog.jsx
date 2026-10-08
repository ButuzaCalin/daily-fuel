import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Clock, Eraser, History, Plus, ScanBarcode, Sparkles, Undo2, X } from 'lucide-react';
import { BarcodeScanner } from '../barcode/BarcodeScanner.jsx';
import { currentHour, loggedLabel, matchMeals, mealTextMaxLength } from './meals.js';
import { blankNutrition, blankPerValues, hasNutrition, perFromPortion, portionFromPer, productNameIn, productText, scaleNutrition } from './nutrition.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';
import { decimalInput } from '../../lib/format.js';
import { loadLocal, saveLocal } from '../../lib/storage.js';

export function MealDialog({ draft, title, submitLabel, collapsibleNutrition = false, suggestions, clearable = false, scannable = false, onQuickAdd, onReestimate, onChange, onClose, onSubmit }) {
  const [shown, closing] = usePresence(draft, 150);
  const id = useId();
  const open = Boolean(draft);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [entryMode, setEntryMode] = useState('total');
  const [perValues, setPerValues] = useState(blankPerValues);
  // What the draft looked like before a previous meal was picked, so the pick can be undone.
  const [beforePick, setBeforePick] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [serving, setServing] = useState(null);
  // Name of the scanned product, so the portion can be kept in the text as it changes.
  const [product, setProduct] = useState(null);
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(() => loadLocal('daily-fuel-suggestions-collapsed', false));
  useEffect(() => saveLocal('daily-fuel-suggestions-collapsed', suggestionsCollapsed), [suggestionsCollapsed]);
  // Each time the dialog opens, start collapsed unless the draft already has values.
  useEffect(() => {
    if (open) setNutritionOpen(!collapsibleNutrition || Object.values(draft.nutrition || {}).some((value) => value !== '' && Number(value) !== 0));
    if (open) {
      // A meal saved by weight reopens by weight, so changing the grams still rescales from the label.
      const saved = draft.portion;
      setEntryMode(saved ? 'per' : 'total');
      setPerValues(saved ? perFromPortion(saved) : blankPerValues);
      setServing(saved?.serving ?? null);
      setProduct(saved ? productNameIn(draft.text, saved) : null);
      setBeforePick(null);
    }
    if (!open) setScanning(false);
  }, [open]);
  // Per-amount values are kept locally; the draft always holds the scaled totals.
  function updatePer(patch) {
    const next = { ...perValues, ...patch };
    setPerValues(next);
    const keepText = product && 'portion' in patch && shown.text === productText(product, perValues.portion);
    onChange({ nutrition: scaleNutrition(next), portion: portionFromPer(next, serving), ...(keepText && { text: productText(product, next.portion) }) });
  }
  function changeMode(mode) {
    setEntryMode(mode);
    onChange({ portion: mode === 'per' ? portionFromPer(perValues, serving) : null });
  }
  const textRef = useRef(null);
  // Grow with the text; CSS max-height caps it, after which it scrolls.
  useLayoutEffect(() => {
    const textarea = textRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [shown?.text]);
  useEscape(Boolean(draft), onClose);
  if (!shown) return null;
  const matches = suggestions ? matchMeals(suggestions, shown.text) : [];
  function snapshot(source) {
    return { source, text: shown.text, nutrition: shown.nutrition, portion: shown.portion ?? null, nutritionOpen, entryMode, perValues, serving, product };
  }
  function pickSuggestion(meal) {
    setBeforePick(snapshot('a previous meal'));
    onChange({ text: meal.text, nutrition: Object.fromEntries(Object.entries(meal.nutrition).map(([key, value]) => [key, value ? String(value) : ''])), portion: meal.portion ?? null });
    setEntryMode(meal.portion ? 'per' : 'total');
    setPerValues(meal.portion ? perFromPortion(meal.portion) : blankPerValues);
    setServing(meal.portion?.serving ?? null);
    setProduct(meal.portion ? productNameIn(meal.text, meal.portion) : null);
    if (hasNutrition(meal)) setNutritionOpen(true);
  }
  const hasInput = shown.text.trim() || Object.values(shown.nutrition || {}).some((value) => value !== '') || Object.entries(perValues).some(([key, value]) => key !== 'base' && value !== '');
  // Scanned products fill the per-100g form so changing the portion rescales the totals.
  function fillFromProduct(product) {
    setBeforePick(snapshot(product.per100 ? 'a barcode' : 'a barcode · no nutrition data'));
    setScanning(false);
    const name = product.name.slice(0, mealTextMaxLength - 12);
    setProduct(null);
    if (!product.per100) {
      onChange({ text: name, portion: null });
      return;
    }
    const next = { base: '100', portion: product.servingGrams ? String(product.servingGrams) : '', ...Object.fromEntries(Object.entries(product.per100).map(([key, value]) => [key, String(value)])) };
    const text = productText(name, next.portion);
    setProduct(name);
    setPerValues(next);
    setServing(product.servingGrams);
    setEntryMode('per');
    setNutritionOpen(true);
    onChange({ text, nutrition: scaleNutrition(next), portion: portionFromPer(next, product.servingGrams) });
  }
  function clearForm() {
    onChange({ text: '', time: currentHour(), nutrition: blankNutrition, portion: null });
    setPerValues(blankPerValues);
    setServing(null);
    setProduct(null);
    setEntryMode('total');
    setNutritionOpen(!collapsibleNutrition);
    setBeforePick(null);
    setScanning(false);
  }
  function undoPick() {
    onChange({ text: beforePick.text, nutrition: beforePick.nutrition, portion: beforePick.portion });
    setNutritionOpen(beforePick.nutritionOpen);
    setEntryMode(beforePick.entryMode);
    setPerValues(beforePick.perValues);
    setServing(beforePick.serving);
    setProduct(beforePick.product);
    setBeforePick(null);
  }
  function submitOnShortcut(event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form.requestSubmit();
    }
  }
  const showTools = scannable || (shown.nutrition && !nutritionOpen);
  const hasPortion = perValues.portion !== '' && Number(perValues.base) > 0;
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading">
          <h2 id={`${id}-title`}>{title}</h2>
          <div className="dialog-heading-actions"><TimePicker value={shown.time} onChange={(time) => onChange({ time })} /><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        </div>
        <form className="meal-form" onSubmit={onSubmit}>
          <div className="meal-input">
            <label className="sr-only" htmlFor={`${id}-text`}>What did you eat?</label>
            <textarea ref={textRef} id={`${id}-text`} value={shown.text} onChange={(event) => { setBeforePick(null); onChange({ text: event.target.value }); }} onKeyDown={submitOnShortcut} placeholder="What did you eat?" maxLength={mealTextMaxLength} rows="2" autoFocus />
            {showTools && <div className="meal-tools">
              {scannable && <button className="tool-chip" type="button" onClick={() => setScanning((current) => !current)} aria-pressed={scanning}><ScanBarcode aria-hidden="true" />Scan barcode</button>}
              {shown.nutrition && !nutritionOpen && <button className="tool-chip" type="button" onClick={() => setNutritionOpen(true)}><Plus aria-hidden="true" />Add values</button>}
            </div>}
          </div>
          {scanning && <BarcodeScanner onProduct={fillFromProduct} onClose={() => setScanning(false)} />}
          {beforePick && <div className="suggestion-undo"><span>Filled from {beforePick.source}</span><button type="button" onClick={undoPick}><Undo2 aria-hidden="true" />Undo</button></div>}
          {!beforePick && matches.length > 0 && <div className="meal-suggestions" role="group" aria-label="Previously logged meals">
            <button className="suggestions-toggle" type="button" onClick={() => setSuggestionsCollapsed((current) => !current)} aria-expanded={!suggestionsCollapsed}>
              Previously logged ({matches.length})<ChevronDown aria-hidden="true" data-collapsed={suggestionsCollapsed || undefined} />
            </button>
            {!suggestionsCollapsed && matches.map((meal) => (
              <div className="suggestion-row" key={meal.text}>
                <button type="button" onClick={() => pickSuggestion(meal)} title="Fill the form to edit before adding">
                  <History aria-hidden="true" />
                  <span className="suggestion-main">
                    <span>{meal.text}</span>
                    <small>{loggedLabel(meal.date)} · {meal.time}{meal.count > 1 && ` · ${meal.count}× logged`}</small>
                  </span>
                  {hasNutrition(meal) && <small>{Math.round(meal.nutrition.calories)} kcal</small>}
                </button>
                {onQuickAdd && <button className="suggestion-add" type="button" onClick={() => onQuickAdd(meal)} aria-label={`Add ${meal.text} at ${shown.time}`} title={`Add now at ${shown.time}`}><Plus aria-hidden="true" /></button>}
              </div>
            ))}
          </div>}
          {shown.nutrition && nutritionOpen && <fieldset className="nutrition-panel" aria-labelledby={`${id}-nutrition`}>
            <div className="nutrition-head">
              <h3 id={`${id}-nutrition`}>Nutrition</h3>
              <div className="period-toggle" role="group" aria-label="How to enter values">
                <button className={entryMode === 'total' ? 'active' : ''} type="button" onClick={() => changeMode('total')} aria-pressed={entryMode === 'total'}>Total</button>
                <button className={entryMode === 'per' ? 'active' : ''} type="button" onClick={() => changeMode('per')} aria-pressed={entryMode === 'per'}>By weight</button>
              </div>
            </div>
            {entryMode === 'total' ? <div className="macro-inputs">
              {macroFields.map((field) => <MacroInput key={field.key} {...field} value={shown.nutrition[field.key]} onChange={(value) => onChange({ nutrition: { [field.key]: value } })} />)}
            </div> : <>
              <p className="per-base"><label htmlFor={`${id}-base`}>Values on the label, per</label><input id={`${id}-base`} type="text" inputMode="decimal" value={perValues.base} onChange={(event) => updatePer({ base: decimalInput(event.target.value) })} />g</p>
              <div className="macro-inputs">
                {macroFields.map((field) => <MacroInput key={field.key} {...field} value={perValues[field.key]} onChange={(value) => updatePer({ [field.key]: value })} />)}
              </div>
              <div className="portion-card">
                <label htmlFor={`${id}-portion`}>Portion eaten<small>How much you had</small></label>
                <span className="portion-field"><input id={`${id}-portion`} type="text" inputMode="decimal" value={perValues.portion} onChange={(event) => updatePer({ portion: decimalInput(event.target.value) })} placeholder="0" /><span>g</span></span>
                {serving && <div className="portion-chips">
                  {[[0.5, '½ serving'], [1, '1 serving'], [2, '2 servings']].map(([count, label]) => {
                    const grams = String(Math.round(serving * count * 10) / 10);
                    return <button key={count} className="portion-chip" type="button" onClick={() => updatePer({ portion: grams })} aria-pressed={perValues.portion === grams} aria-label={`${label}, ${grams} g`}>{label}</button>;
                  })}
                </div>}
                {hasPortion ? <dl className="portion-result">{macroFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{shown.nutrition[field.key] || 0}<small>{field.unit}</small></dd></div>)}</dl> : <p className="portion-empty">Enter a portion to see the totals</p>}
              </div>
            </>}
          </fieldset>}
          <div className="dialog-actions">
            {clearable && <button className="clear-meal-form" type="button" onClick={clearForm} disabled={!hasInput}><Eraser aria-hidden="true" />Clear</button>}
            {onReestimate && <button className="reestimate-meal" type="button" onClick={onReestimate} disabled={!shown.text.trim()} title="Replace values with a new AI estimate" aria-label={hasNutrition(shown) ? 'Re-estimate with AI' : 'Estimate with AI'}><Sparkles aria-hidden="true" />{hasNutrition(shown) ? 'Re-estimate' : 'Estimate'}</button>}
            <button className="confirm-add" type="submit" disabled={!shown.text.trim()}>{submitLabel}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

const macroFields = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'proteins', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fats', label: 'Fat', unit: 'g' },
];

function MacroInput({ label, unit, value, onChange }) {
  return <label className="macro-input">{label}<span className="macro-field"><input type="text" inputMode="decimal" value={value} onChange={(event) => onChange(decimalInput(event.target.value))} placeholder="0" /><small>{unit}</small></span></label>;
}

function TimePicker({ value, onChange }) {
  return <div className="time-picker"><Clock aria-hidden="true" /><strong>{value}</strong><input aria-label="Meal time" type="time" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
