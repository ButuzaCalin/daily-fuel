import { useRef, useState } from 'react';

// Reorders a list by dragging a row's handle. Row positions are measured once when the drag starts;
// the dragged row follows the pointer and the rows it passes slide out of its way.
export function useDragReorder(items, onReorder) {
  const rows = useRef(new Map());
  const [drag, setDrag] = useState(null);

  function move(from, to) {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    next.splice(to, 0, ...next.splice(from, 1));
    onReorder(next);
  }

  function handleProps(id, index) {
    return {
      onPointerDown(event) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const rects = items.map((item) => rows.current.get(item.id)?.getBoundingClientRect());
        if (rects.some((rect) => !rect)) return;
        setDrag({ id, from: index, to: index, startY: event.clientY, offset: 0, rects });
      },
      onPointerMove(event) {
        if (!drag || drag.id !== id) return;
        const own = drag.rects[drag.from];
        // Kept inside the list, which clips anything outside it.
        const offset = Math.min(Math.max(event.clientY - drag.startY, drag.rects[0].top - own.top), drag.rects[drag.rects.length - 1].bottom - own.bottom);
        const center = own.top + own.height / 2 + offset;
        const to = drag.rects.filter((rect, i) => i !== drag.from && rect.top + rect.height / 2 < center).length;
        setDrag({ ...drag, offset, to });
      },
      onPointerUp() {
        if (!drag || drag.id !== id) return;
        setDrag(null);
        move(drag.from, drag.to);
      },
      onPointerCancel() { setDrag(null); },
      onKeyDown(event) {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
      },
    };
  }

  function rowProps(id, index) {
    let transform;
    if (drag) {
      const height = drag.rects[drag.from].height;
      if (index === drag.from) transform = `translateY(${drag.offset}px)`;
      else if (drag.from < drag.to && index > drag.from && index <= drag.to) transform = `translateY(${-height}px)`;
      else if (drag.to < drag.from && index >= drag.to && index < drag.from) transform = `translateY(${height}px)`;
    }
    return {
      ref: (node) => { if (node) rows.current.set(id, node); else rows.current.delete(id); },
      'data-dragging': drag?.id === id || undefined,
      style: transform ? { transform } : undefined,
    };
  }

  return { dragging: Boolean(drag), handleProps, rowProps };
}
