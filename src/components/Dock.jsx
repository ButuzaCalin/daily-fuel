import { useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { useCanInvite } from '../features/invites/invites.js';
import { useEscape } from '../hooks/useEscape.js';
import { usePresence } from '../hooks/usePresence.js';
import { availableDockPages, DOCK_SLOTS, homePage } from './dockPages.js';

const settingsRoutes = ['settings', 'ai', 'usage', 'data-handling'];

// Bottom navigation, the alternative to the side menu: the main pages sit in the dock, the rest in a "More" sheet.
// The order is chosen in Settings → General.
export function Dock({ route, goal, order, onNavigate }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheet, closing] = usePresence(moreOpen, 200);
  const canInvite = useCanInvite();
  useEscape(moreOpen, () => setMoreOpen(false));

  const pages = availableDockPages(order, goal, canInvite);
  const main = [homePage, ...pages.slice(0, DOCK_SLOTS)];
  const more = pages.slice(DOCK_SLOTS);
  const isActive = (item) => (item.route === 'settings' ? settingsRoutes.includes(route) : item.route === route);
  const moreActive = more.some(isActive);

  function go(next) {
    setMoreOpen(false);
    if (next === route) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    onNavigate(next, next === 'home');
  }

  return <>
    {sheet && (
      <div className="dock-sheet-layer" data-closing={closing || undefined} role="presentation" onClick={() => setMoreOpen(false)}>
        <nav className="dock-sheet" role="dialog" aria-label="More pages" onClick={(event) => event.stopPropagation()}>
          <span className="dock-sheet-grabber" aria-hidden="true" />
          <div className="dock-sheet-grid">
            {more.map((item) => (
              <button className={isActive(item) ? 'active' : ''} type="button" onClick={() => go(item.route)} aria-current={isActive(item) ? 'page' : undefined} key={item.route}>
                <span className="dock-sheet-icon"><item.icon aria-hidden="true" /></span>{item.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    )}
    <div className="dock-fade" aria-hidden="true" />
    <nav className="dock" aria-label="Main">
      <div className="dock-items">
        {main.map((item) => (
          <button className={isActive(item) && !moreOpen ? 'active' : ''} type="button" onClick={() => go(item.route)} aria-current={isActive(item) ? 'page' : undefined} key={item.route}>
            <span className="dock-icon"><item.icon aria-hidden="true" /></span>{item.label}
          </button>
        ))}
        {more.length > 0 && (
          <button className={moreOpen || moreActive ? 'active' : ''} type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-haspopup="dialog">
            <span className="dock-icon"><Ellipsis aria-hidden="true" /></span>More
          </button>
        )}
      </div>
    </nav>
  </>;
}
