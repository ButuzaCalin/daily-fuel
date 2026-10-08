import { ChevronDown, Menu as MenuIcon, ShieldCheck } from 'lucide-react';
import { HeaderQuota } from '../../components/HeaderQuota.jsx';
import { Menu } from '../../components/Menu.jsx';
import { Toast } from '../../components/Toast.jsx';
import { helpSections } from './helpSections.js';

export function HelpView({ goal, quota, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast }) {
  return (
    <main className="app-shell help-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">Ghid</p><h1>Cum se folosește</h1></div></div>
      <p className="help-intro">Deschide meniul din stânga sus ca să ajungi la oricare dintre paginile de mai jos.</p>
      <p className="help-privacy"><ShieldCheck aria-hidden="true" /><span>Toate datele tale sunt salvate doar pe acest dispozitiv. Nimeni, nici măcar dezvoltatorul, nu le poate vedea. </span></p>
      <div className="help-sections">
        {helpSections.map(({ icon: Icon, title, items }) => (
          <details className="help-section" key={title}>
            <summary><span className="menu-icon"><Icon aria-hidden="true" /></span>{title}<ChevronDown className="help-chevron" aria-hidden="true" /></summary>
            <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
        ))}
      </div>
    </main>
  );
}
