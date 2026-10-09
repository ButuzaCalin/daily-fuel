import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, History, Plus, ScanBarcode, Undo2 } from 'lucide-react';
import { BarcodeScanner } from '../barcode/BarcodeScanner.jsx';
import { loggedLabel, matchMeals, mealTextMaxLength } from './meals.js';
import { blankPerValues, hasNutrition, perFromPortion, portionFromPer, productNameIn, productText, scaleNutrition } from './nutrition.js';
import { decimalInput } from '../../lib/format.js';
import { loadLocal, saveLocal } from '../../lib/storage.js';

// Text, scanner, suggestions and nutrition for one entry: a whole meal, or one item of it.
// Local state starts from `value` on mount; the parent remounts it (via key) to reset.
export function MealItemEditor({ value, time, placeholder, collapsibleNutrition = false, suggestions, scannable = false, tools, onQuickAdd, onPickMeal, onLocalInput, onChange }) {
  const id = useId();
  const saved = value.portion;
  const [nutritionOpen, setNutritionOpen] = useState(() => !collapsibleNutrition || Object.values(value.nutrition || {}).some((amount) => amount !== '' && Number(amount) !== 0));
  const [entryMode, setEntryMode] = useState(saved ? 'per' : 'total');
  const [perValues, setPerValues] = useState(saved ? perFromPortion(saved) : blankPerValues);
  // What the entry looked like before a previous meal was picked, so the pick can be undone.
  const [beforePick, setBeforePick] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [serving, setServing] = useState(saved?.serving ?? null);
  // Name of the scanned product, so the portion can be kept in the text as it changes.
  const [product, setProduct] = useState(saved ? productNameIn(value.text, saved) : null);
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(() => loadLocal('daily-fuel-suggestions-collapsed', false));
  useEffect(() => saveLocal('daily-fuel-suggestions-collapsed', suggestionsCollapsed), [suggestionsCollapsed]);
  // Label values typed without a portion don't reach the draft yet, but still count as input for Clear.
  const hasPerInput = Object.entries(perValues).some(([key, amount]) => key !== 'base' && amount !== '');
  useEffect(() => onLocalInput?.(hasPerInput), [hasPerInput]);
  // Per-amount values are kept locally; the draft always holds the scaled totals.
  function updatePer(patch) {
    const next = { ...perValues, ...patch };
    setPerValues(next);
    const keepText = product && 'portion' in patch && value.text === productText(product, perValues.portion);
    // Changing only the portion keeps a scanned label's source; editing the label values makes it manual.
    const source = Object.keys(patch).every((key) => key === 'portion') ? value.source : 'manual';
    onChange({ nutrition: scaleNutrition(next), portion: portionFromPer(next, serving), source, ...(keepText && { text: productText(product, next.portion) }) });
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
  }, [value.text]);
  const matches = suggestions ? matchMeals(suggestions, value.text) : [];
  function snapshot(source) {
    return { source, text: value.text, nutrition: value.nutrition, portion: value.portion ?? null, valueSource: value.source ?? null, nutritionOpen, entryMode, perValues, serving, product };
  }
  function pickSuggestion(meal) {
    if (meal.items && onPickMeal) {
      onPickMeal(meal);
      return;
    }
    setBeforePick(snapshot('a previous meal'));
    onChange({ text: meal.text, nutrition: Object.fromEntries(Object.entries(meal.nutrition).map(([key, amount]) => [key, amount ? String(amount) : ''])), portion: meal.portion ?? null, source: meal.source ?? null });
    setEntryMode(meal.portion ? 'per' : 'total');
    setPerValues(meal.portion ? perFromPortion(meal.portion) : blankPerValues);
    setServing(meal.portion?.serving ?? null);
    setProduct(meal.portion ? productNameIn(meal.text, meal.portion) : null);
    if (hasNutrition(meal)) setNutritionOpen(true);
  }
  // Scanned products fill the per-100g form so changing the portion rescales the totals.
  function fillFromProduct(scanned) {
    setBeforePick(snapshot(scanned.per100 ? 'a barcode' : 'a barcode · no nutrition data'));
    setScanning(false);
    const name = scanned.name.slice(0, mealTextMaxLength - 12);
    setProduct(null);
    if (!scanned.per100) {
      onChange({ text: name, portion: null });
      return;
    }
    const next = { base: '100', portion: scanned.servingGrams ? String(scanned.servingGrams) : '', ...Object.fromEntries(Object.entries(scanned.per100).map(([key, amount]) => [key, String(amount)])) };
    const text = productText(name, next.portion);
    setProduct(name);
    setPerValues(next);
    setServing(scanned.servingGrams);
    setEntryMode('per');
    setNutritionOpen(true);
    onChange({ text, nutrition: scaleNutrition(next), portion: portionFromPer(next, scanned.servingGrams), source: 'scan' });
  }
  function undoPick() {
    onChange({ text: beforePick.text, nutrition: beforePick.nutrition, portion: beforePick.portion, source: beforePick.valueSource });
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
  const showTools = scannable || !nutritionOpen || tools;
  const hasPortion = perValues.portion !== '' && Number(perValues.base) > 0;
  return (
    <>
      <div className="meal-input">
        <label className="sr-only" htmlFor={`${id}-text`}>{placeholder}</label>
        <textarea ref={textRef} id={`${id}-text`} value={value.text} onChange={(event) => { setBeforePick(null); onChange({ text: event.target.value }); }} onKeyDown={submitOnShortcut} placeholder={placeholder} maxLength={mealTextMaxLength} rows="2" autoFocus />
        {showTools && <div className="meal-tools">
          {scannable && <button className="tool-chip" type="button" onClick={() => setScanning((current) => !current)} aria-pressed={scanning}><ScanBarcode aria-hidden="true" />Scan barcode</button>}
          {!nutritionOpen && <button className="tool-chip" type="button" onClick={() => setNutritionOpen(true)}><Plus aria-hidden="true" />Add values</button>}
          {tools}
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
                <small>{loggedLabel(meal.date)} · {meal.time}{meal.items && ` · ${meal.items.length} items`}{meal.count > 1 && ` · ${meal.count}× logged`}</small>
              </span>
              {hasNutrition(meal) && <small>{Math.round(meal.nutrition.calories)} kcal</small>}
            </button>
            {onQuickAdd && <button className="suggestion-add" type="button" onClick={() => onQuickAdd(meal)} aria-label={`Add ${meal.text} at ${time}`} title={`Add now at ${time}`}><Plus aria-hidden="true" /></button>}
          </div>
        ))}
      </div>}
      {nutritionOpen && <fieldset className="nutrition-panel" aria-labelledby={`${id}-nutrition`}>
        <div className="nutrition-head">
          <h3 id={`${id}-nutrition`}>Nutrition</h3>
          <div className="period-toggle" role="group" aria-label="How to enter values">
            <button className={entryMode === 'total' ? 'active' : ''} type="button" onClick={() => changeMode('total')} aria-pressed={entryMode === 'total'}>Total</button>
            <button className={entryMode === 'per' ? 'active' : ''} type="button" onClick={() => changeMode('per')} aria-pressed={entryMode === 'per'}>By weight</button>
          </div>
        </div>
        {entryMode === 'total' ? <div className="macro-inputs">
          {macroFields.map((field) => <MacroInput key={field.key} {...field} value={value.nutrition[field.key]} onChange={(amount) => onChange({ nutrition: { [field.key]: amount }, source: 'manual' })} />)}
        </div> : <>
          <p className="per-base"><label htmlFor={`${id}-base`}>Values on the label, per</label><input id={`${id}-base`} type="text" inputMode="decimal" value={perValues.base} onChange={(event) => updatePer({ base: decimalInput(event.target.value) })} />g</p>
          <div className="macro-inputs">
            {macroFields.map((field) => <MacroInput key={field.key} {...field} value={perValues[field.key]} onChange={(amount) => updatePer({ [field.key]: amount })} />)}
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
            {hasPortion ? <dl className="portion-result">{macroFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{value.nutrition[field.key] || 0}<small>{field.unit}</small></dd></div>)}</dl> : <p className="portion-empty">Enter a portion to see the totals</p>}
          </div>
        </>}
      </fieldset>}
    </>
  );
}

export const macroFields = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'proteins', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fats', label: 'Fat', unit: 'g' },
];

function MacroInput({ label, unit, value, onChange }) {
  return <label className="macro-input">{label}<span className="macro-field"><input type="text" inputMode="decimal" value={value} onChange={(event) => onChange(decimalInput(event.target.value))} placeholder="0" /><small>{unit}</small></span></label>;
}
