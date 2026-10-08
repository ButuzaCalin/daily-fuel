import { BarChart3, CircleHelp, Dumbbell, Home, Medal, Scale, Settings, Target, X } from 'lucide-react';
import { scoringAvailable } from '../features/score/score.js';
import { useEscape } from '../hooks/useEscape.js';
import { usePresence } from '../hooks/usePresence.js';

export function Menu({ open, onClose, onNavigate, onLogout, username, goal }) {
  const [visible, closing] = usePresence(open, 200);
  useEscape(open, onClose);
  if (!visible) return null;
  return (
    <div className="menu-layer" data-closing={closing || undefined} role="presentation" onClick={onClose}>
      <aside className="menu-panel" role="dialog" aria-label="Navigation" onClick={(event) => event.stopPropagation()}>
        <div className="menu-header"><strong>Daily Fuel</strong><button type="button" onClick={onClose} aria-label="Close menu"><X /></button></div>
        <p className="menu-user">{username}</p>
        <nav className="menu-links">
          <div className="menu-group">
            <button type="button" onClick={() => onNavigate('home', true)}><span className="menu-link-label"><span className="menu-icon"><Home /></span>Today</span><span aria-hidden="true">&rarr;</span></button>
            <button type="button" onClick={() => onNavigate('reports')}><span className="menu-link-label"><span className="menu-icon"><BarChart3 /></span>Reports</span><span aria-hidden="true">&rarr;</span></button>
            <button type="button" onClick={() => onNavigate('goal')}><span className="menu-link-label"><span className="menu-icon"><Target /></span>Goal</span><span aria-hidden="true">&rarr;</span></button>
          </div>
          {(scoringAvailable(goal) || goal?.weightTracking || goal?.workouts) && (
            <div className="menu-group menu-group-secondary">
              {scoringAvailable(goal) && <button type="button" onClick={() => onNavigate('scores')}><span className="menu-link-label"><span className="menu-icon"><Medal /></span>Scores</span><span aria-hidden="true">&rarr;</span></button>}
              {goal?.weightTracking && <button type="button" onClick={() => onNavigate('weight')}><span className="menu-link-label"><span className="menu-icon"><Scale /></span>Weight</span><span aria-hidden="true">&rarr;</span></button>}
              {goal?.workouts && <button type="button" onClick={() => onNavigate('workouts')}><span className="menu-link-label"><span className="menu-icon"><Dumbbell /></span>Workouts</span><span aria-hidden="true">&rarr;</span></button>}
            </div>
          )}
          <div className="menu-group menu-group-secondary">
            <button type="button" onClick={() => onNavigate('settings')}><span className="menu-link-label"><span className="menu-icon"><Settings /></span>Settings</span><span aria-hidden="true">&rarr;</span></button>
            <button type="button" onClick={() => onNavigate('help')}><span className="menu-link-label"><span className="menu-icon"><CircleHelp /></span>How to use</span><span aria-hidden="true">&rarr;</span></button>
          </div>
        </nav>
      </aside>
    </div>
  );
}
