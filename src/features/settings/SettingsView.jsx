import { Cpu, Database, Menu as MenuIcon, SlidersHorizontal, Sparkles } from 'lucide-react';
import { HeaderQuota } from '../../components/HeaderQuota.jsx';
import { Menu } from '../../components/Menu.jsx';
import { Toast } from '../../components/Toast.jsx';
import { AiPanel } from './AiPanel.jsx';
import { DataPanel } from './DataPanel.jsx';
import { GeneralPanel } from './GeneralPanel.jsx';
import { TokensPanel } from './TokensPanel.jsx';

const settingsTabs = [
  { route: 'settings', label: 'General', icon: SlidersHorizontal },
  { route: 'ai', label: 'AI', icon: Sparkles },
  { route: 'usage', label: 'Tokens', icon: Cpu },
  { route: 'data-handling', label: 'Data', icon: Database },
];

export function SettingsView({ tab, goal, proxyQuota, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, ...props }) {
  return (
    <main className="app-shell settings-page">
      <header className="topbar"><button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button><button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button><HeaderQuota quota={proxyQuota} /></header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">On this device</p><h1>Settings</h1></div></div>
      <nav className="settings-tabs" aria-label="Settings sections">
        {settingsTabs.map(({ route, label, icon: Icon }) => (
          <button key={route} className={tab === route ? 'active' : ''} type="button" onClick={() => tab !== route && onNavigate(route)} aria-current={tab === route ? 'page' : undefined}><Icon aria-hidden="true" />{label}</button>
        ))}
      </nav>
      <div className="settings-panel">
        {tab === 'ai' ? <AiPanel {...props} /> : tab === 'usage' ? <TokensPanel usage={props.usage} /> : tab === 'data-handling' ? <DataPanel goal={goal} {...props} /> : <GeneralPanel goal={goal} {...props} />}
      </div>
    </main>
  );
}
