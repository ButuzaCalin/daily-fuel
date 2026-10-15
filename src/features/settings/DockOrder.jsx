import { GripVertical, Lock } from 'lucide-react';
import { availableDockPages, defaultDockOrder, DOCK_SLOTS, fullDockOrder, homePage, mergeDockOrder } from '../../components/dockPages.js';
import { useDragReorder } from '../../hooks/useDragReorder.js';
import { useCanInvite } from '../invites/invites.js';

// Drag pages to order the dock. Today stays first; the next few fill the dock and the rest go under "More".
export function DockOrder({ goal, order, onChange }) {
  const canInvite = useCanInvite();
  const pages = availableDockPages(order, goal, canInvite).map((page) => ({ ...page, id: page.route }));
  const reorder = useDragReorder(pages, (next) => onChange(mergeDockOrder(order, next.map((page) => page.route))));
  const isDefault = fullDockOrder(order).join() === defaultDockOrder.join();
  return (
    <div className="dock-order">
      <div className="dock-order-heading">
        <strong>Dock order</strong>
        {!isDefault && <button type="button" onClick={() => onChange(defaultDockOrder)}>Reset</button>}
      </div>
      <div className="dock-order-list" data-reordering={reorder.dragging || undefined}>
        <div className="dock-order-row is-locked">
          <span className="dock-order-handle" aria-hidden="true"><Lock /></span>
          <span className="dock-order-icon"><homePage.icon aria-hidden="true" /></span>
          <span className="dock-order-label">{homePage.label}</span>
          <span className="dock-order-place">Dock</span>
        </div>
        {pages.map((page, index) => (
          <div className="dock-order-row" key={page.id} {...reorder.rowProps(page.id, index)}>
            <button className="dock-order-handle" type="button" {...reorder.handleProps(page.id, index)} aria-label={`Move ${page.label}`} title="Drag to reorder"><GripVertical aria-hidden="true" /></button>
            <span className="dock-order-icon"><page.icon aria-hidden="true" /></span>
            <span className="dock-order-label">{page.label}</span>
            <span className={`dock-order-place${index < DOCK_SLOTS ? '' : ' is-more'}`}>{index < DOCK_SLOTS ? 'Dock' : 'More'}</span>
          </div>
        ))}
      </div>
      <small>The first {DOCK_SLOTS + 1} show in the dock, the rest under More.</small>
    </div>
  );
}
