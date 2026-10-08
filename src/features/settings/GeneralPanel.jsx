import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { updateApp } from '../../app/pwa.js';
import { normalizeGoal } from '../goal/goal.js';

export function GeneralPanel({ goal, setGoal, settings, setSettings, notify }) {
  const [updating, setUpdating] = useState(false);
  // Menu switches live on the goal so existing data and backups keep working.
  const menus = normalizeGoal(goal);
  const toggleMenu = (patch) => setGoal(normalizeGoal({ ...menus, ...patch }));
  async function handleUpdate() {
    setUpdating(true);
    try {
      await updateApp();
    } catch (error) {
      setUpdating(false);
      notify(error.message || 'The update failed.', 'error');
    }
  }
  return <>
    <section className="settings-form settings-menus">
      <div className="goal-section-heading"><h2>Menus</h2><p>Turn on extra pages in the menu.</p></div>
      <label className="scoring-toggle">
        <input type="checkbox" role="switch" checked={menus.weightTracking} onChange={(event) => toggleMenu({ weightTracking: event.target.checked })} />
        <span><strong>Weight track</strong><small>Log your weight and see your average daily macros between weigh-ins.</small></span>
      </label>
      <label className="scoring-toggle">
        <input type="checkbox" role="switch" checked={menus.workouts} onChange={(event) => toggleMenu({ workouts: event.target.checked })} />
        <span><strong>Workouts</strong><small>Save workouts and log your sets and reps on a calendar.</small></span>
      </label>
    </section>
    <section className="settings-form settings-menus">
      <div className="goal-section-heading"><h2>Meals</h2><p>Order of meals in the day list.</p></div>
      <div className="objective-toggle" role="radiogroup" aria-label="Meal order">
        {[['asc', 'Oldest first'], ['desc', 'Newest first']].map(([key, label]) => <button className={settings.mealOrder === key ? 'active' : ''} type="button" role="radio" aria-checked={settings.mealOrder === key} onClick={() => setSettings((current) => ({ ...current, mealOrder: key }))} key={key}>{label}</button>)}
      </div>
    </section>
    <section className="settings-form settings-update">
      <div className="goal-section-heading"><h2>App</h2><p>Get the latest version. Your meals, goals and settings stay on this device.</p></div>
      <button className="auth-submit" type="button" onClick={handleUpdate} disabled={updating}><RefreshCw className={updating ? 'is-spinning' : undefined} aria-hidden="true" />{updating ? 'Updating…' : 'Update app'}</button>
    </section>
  </>;
}
