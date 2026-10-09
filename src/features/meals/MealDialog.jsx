import { useEffect, useId, useState } from 'react';
import { Clock, Eraser, ListPlus, PencilLine, ScanBarcode, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { MealItemEditor } from './MealItemEditor.jsx';
import { blankItem, currentHour, mealFromDraft, reestimableEntries, withFreshIds } from './meals.js';
import { blankNutrition, cleanNutrition, hasNutrition, sumNutrition } from './nutrition.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';

export function MealDialog({ draft, title, submitLabel, collapsibleNutrition = false, suggestions, clearable = false, scannable = false, onQuickAdd, onReestimate, onChange, onClose, onSubmit }) {
  const [shown, closing] = usePresence(draft, 150);
  const id = useId();
  const open = Boolean(draft);
  // Bumped to remount the editor, so its local state restarts from the draft.
  const [editorKey, setEditorKey] = useState(0);
  const [openItem, setOpenItem] = useState(null);
  const [localInput, setLocalInput] = useState(false);
  // The single-entry draft before a previous meal with items replaced it, so the pick can be undone.
  const [beforeItems, setBeforeItems] = useState(null);
  useEffect(() => {
    if (!open) return;
    setEditorKey((key) => key + 1);
    setOpenItem(null);
    setBeforeItems(null);
  }, [open]);
  useEscape(Boolean(draft), onClose);
  if (!shown) return null;
  const items = shown.items;
  const hasValues = (nutrition) => Object.values(nutrition || {}).some((value) => value !== '' && Number(value) !== 0);
  const hasInput = localInput || shown.text.trim() || hasValues(shown.nutrition) || Boolean(items);
  const canSubmit = items ? items.some((item) => item.text.trim()) : Boolean(shown.text.trim());

  function changeItem(itemId, patch) {
    onChange({ items: items.map((item) => (item.id === itemId ? { ...item, ...patch, nutrition: patch.nutrition ? { ...item.nutrition, ...patch.nutrition } : item.nutrition } : item)) });
  }
  // The entry typed so far becomes the first item, and a blank one opens below it.
  function splitIntoItems() {
    const next = blankItem();
    const first = { ...blankItem(), text: shown.text.trim(), nutrition: shown.nutrition, portion: shown.portion ?? null, source: shown.source ?? null };
    onChange({ items: first.text || hasValues(first.nutrition) ? [first, next] : [next], text: '', nutrition: blankNutrition, portion: null, source: null });
    setOpenItem(next.id);
    setBeforeItems(null);
  }
  function addItem() {
    const next = blankItem();
    onChange({ items: [...items, next] });
    setOpenItem(next.id);
  }
  function removeItem(itemId) {
    const rest = items.filter((item) => item.id !== itemId);
    if (openItem === itemId) setOpenItem(null);
    if (rest.length > 1) {
      onChange({ items: rest });
      return;
    }
    // Back to one entry: the dialog returns to the plain single-meal form.
    const [last] = rest;
    onChange({ items: null, text: last?.text ?? '', nutrition: last?.nutrition ?? blankNutrition, portion: last?.portion ?? null, source: last?.source ?? null });
    setEditorKey((key) => key + 1);
  }
  function pickMeal(meal) {
    setBeforeItems({ text: shown.text, nutrition: shown.nutrition, portion: shown.portion ?? null, source: shown.source ?? null, items: null });
    onChange({ text: '', items: withFreshIds(meal.items), nutrition: blankNutrition, portion: null, source: null });
    setOpenItem(null);
  }
  function undoPickMeal() {
    onChange(beforeItems);
    setBeforeItems(null);
    setEditorKey((key) => key + 1);
  }
  function clearForm() {
    onChange({ text: '', time: currentHour(), nutrition: blankNutrition, portion: null, source: null, items: null });
    setEditorKey((key) => key + 1);
    setOpenItem(null);
    setBeforeItems(null);
    setLocalInput(false);
  }
  // Only items still missing values, or values the AI produced, are sent; scanned and typed ones stay.
  const estimable = items ? reestimableEntries(mealFromDraft(shown)).length > 0 : Boolean(shown.text.trim());
  const pendingItems = items ? items.filter((item) => item.text.trim() && !hasValues(item.nutrition)).length : 0;
  const estimateLabel = items ? (pendingItems ? 'Estimate missing' : 'Re-estimate') : hasNutrition(shown) ? 'Re-estimate' : 'Estimate';
  const itemSuggestions = suggestions?.filter((meal) => !meal.items);
  const total = items ? cleanNutrition(sumNutrition(items)) : null;
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading">
          <h2 id={`${id}-title`}>{title}</h2>
          <div className="dialog-heading-actions"><TimePicker value={shown.time} onChange={(time) => onChange({ time })} /><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        </div>
        <form className="meal-form" onSubmit={onSubmit}>
          {items ? <>
            {beforeItems && <div className="suggestion-undo"><span>Filled from a previous meal</span><button type="button" onClick={undoPickMeal}><Undo2 aria-hidden="true" />Undo</button></div>}
            <ul className="meal-item-list" aria-label="Items">
              {items.map((item) => (item.id === openItem ? (
                <li className="meal-item is-open" key={item.id}>
                  <MealItemEditor key={`${item.id}-${editorKey}`} value={item} time={shown.time} placeholder="Item, e.g. 3 eggs" collapsibleNutrition suggestions={itemSuggestions} scannable={scannable} onChange={(patch) => changeItem(item.id, patch)} />
                  <div className="meal-item-actions">
                    <button type="button" onClick={() => removeItem(item.id)}><Trash2 aria-hidden="true" />Remove</button>
                    <button type="button" onClick={() => setOpenItem(null)}>Done</button>
                  </div>
                </li>
              ) : (
                <li className="meal-item" key={item.id}>
                  <button className="meal-item-row" type="button" onClick={() => setOpenItem(item.id)} title="Edit item">
                    <span className={item.text.trim() ? '' : 'is-placeholder'}>{item.text.trim() || 'Untitled item'}</span>
                    <small>{hasValues(item.nutrition) ? `${Math.round(Number(item.nutrition.calories) || 0)} kcal` : 'no values'}</small>
                    <SourceBadge source={hasValues(item.nutrition) ? item.source : null} />
                  </button>
                  <button className="meal-item-remove" type="button" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.text.trim() || 'item'}`} title="Remove item"><X aria-hidden="true" /></button>
                </li>
              )))}
            </ul>
            <p className="meal-items-total"><span>Total</span> <strong>{Math.round(total.calories)} kcal</strong> · P {Math.round(total.proteins)}g · C {Math.round(total.carbs)}g · F {Math.round(total.fats)}g</p>
          </> : (
            <MealItemEditor
              key={editorKey}
              value={shown}
              time={shown.time}
              placeholder="What did you eat?"
              collapsibleNutrition={collapsibleNutrition}
              suggestions={suggestions}
              scannable={scannable}
              onQuickAdd={onQuickAdd}
              onPickMeal={pickMeal}
              onLocalInput={setLocalInput}
              onChange={onChange}
            />
          )}
          <div className="dialog-actions">
            {clearable && <button className="clear-meal-form" type="button" onClick={clearForm} disabled={!hasInput}><Eraser aria-hidden="true" />Clear</button>}
            {onReestimate && <button className="reestimate-meal" type="button" onClick={onReestimate} disabled={!estimable} title={items ? 'Estimate items without values, or re-estimate AI values. Scanned and typed values are kept.' : 'Replace values with a new AI estimate'}><Sparkles aria-hidden="true" />{estimateLabel}</button>}
            <button className="add-meal-item" type="button" onClick={items ? addItem : splitIntoItems} title="Log this meal as separate items"><ListPlus aria-hidden="true" />Add item</button>
            <button className="confirm-add" type="submit" disabled={!canSubmit}>{submitLabel}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

const sources = {
  scan: { Icon: ScanBarcode, label: 'Scanned' },
  manual: { Icon: PencilLine, label: 'Entered by hand' },
  ai: { Icon: Sparkles, label: 'AI estimate' },
};

export function SourceBadge({ source }) {
  const entry = sources[source];
  if (!entry) return <span className="source-badge" aria-hidden="true" />;
  const { Icon, label } = entry;
  return <span className="source-badge" data-source={source} title={label}><Icon aria-hidden="true" /><span className="sr-only">{label}</span></span>;
}

function TimePicker({ value, onChange }) {
  return <div className="time-picker"><Clock aria-hidden="true" /><strong>{value}</strong><input aria-label="Meal time" type="time" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
