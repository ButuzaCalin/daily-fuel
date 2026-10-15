import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { updateApp } from '../../app/pwa.js';
import { normalizeGoal } from '../goal/goal.js';
import { DockOrder } from './DockOrder.jsx';

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
  const navigation = settings?.navigation === 'legacy' ? 'legacy' : 'dock';
  return <>
    <section className="settings-form settings-navigation">
      <div className="goal-section-heading"><h2>Navigation</h2><p>{navigation === 'dock' ? 'Pages sit in a bar at the bottom of the screen, within reach of your thumb.' : 'Pages open from the menu button in the top left corner.'}</p></div>
      <div className="objective-toggle" role="radiogroup" aria-label="Navigation">
        {[['dock', 'Bottom dock'], ['legacy', 'Legacy']].map(([value, label]) => <button className={navigation === value ? 'active' : ''} type="button" role="radio" aria-checked={navigation === value} onClick={() => setSettings((current) => ({ ...current, navigation: value }))} key={value}>{label}</button>)}
      </div>
      {navigation === 'dock' && <DockOrder goal={goal} order={settings.dockOrder} onChange={(dockOrder) => setSettings((current) => ({ ...current, dockOrder }))} />}
    </section>
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
    <section className="settings-form settings-update">
      <div className="goal-section-heading"><h2>App</h2><p>Get the latest version. Your meals, goals and settings stay on this device.</p></div>
      <button className="auth-submit" type="button" onClick={handleUpdate} disabled={updating}><RefreshCw className={updating ? 'is-spinning' : undefined} aria-hidden="true" />{updating ? 'Updating…' : 'Update app'}</button>
    </section>
  </>;
}
