import { Menu as MenuIcon } from 'lucide-react';
import { HeaderQuota } from '../../components/HeaderQuota.jsx';
import { Menu } from '../../components/Menu.jsx';
import { Toast } from '../../components/Toast.jsx';
import { ScoreCalendar } from './ScoreCalendar.jsx';

export function ScoresView({ goal, quota, mealsByDate, onOpenDay, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  return (
    <main className="app-shell reports-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home">
          <span className="brand-mark">DF</span>
          <span>Daily Fuel</span>
        </button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">Daily score history</p><h1>Scores</h1></div></div>
      <ScoreCalendar goal={goal} mealsByDate={mealsByDate} onOpenDay={onOpenDay} notify={notify} />
    </main>
  );
}
