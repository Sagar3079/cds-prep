"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DragOffset {
  x: number;
  y: number;
}

const ZERO: DragOffset = { x: 0, y: 0 };

/** Below this, the gesture was a tap, not a drag. Fingers wobble. */
const SLOP = 5;

/**
 * Lets Potter be dragged out of the way and stay there.
 *
 * The offset is stored per placement (`home` / `test` / `review`) because the
 * position that works on one screen is meaningless on another, and it survives
 * reloads.
 *
 * Returns `moved`, which the tap handler must check: without it, every drag
 * would also fire the mute toggle on release.
 */
export function usePotterDrag(key: string) {
  const storageKey = `cds-potter-pos-${key}`;
  const [offset, setOffset] = useState<DragOffset>(ZERO);
  const [dragging, setDragging] = useState(false);

  const start = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
  } | null>(null);
  const moved = useRef(false);

  // Read after mount only — the server cannot see localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<DragOffset>;
      if (typeof p?.x === "number" && typeof p?.y === "number") {
        setOffset({ x: p.x, y: p.y });
      }
    } catch {
      /* unreadable or malformed — he just starts where he was designed to */
    }
  }, [storageKey]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Left button / touch / pen only.
      if (e.button !== 0) return;
      start.current = {
        px: e.clientX,
        py: e.clientY,
        ox: offset.x,
        oy: offset.y,
      };
      moved.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offset.x, offset.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    if (!moved.current && Math.hypot(dx, dy) < SLOP) return;
    if (!moved.current) {
      moved.current = true;
      setDragging(true);
    }
    setOffset({ x: s.ox + dx, y: s.oy + dy });
  }, []);

  const finish = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current) return;
      start.current = null;
      if (!moved.current) {
        setDragging(false);
        return;
      }
      setDragging(false);
      try {
        localStorage.setItem(storageKey, JSON.stringify(offset));
      } catch {
        /* private mode — the position just won't survive a reload */
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* capture already lost */
      }
    },
    [offset, storageKey],
  );

  const reset = useCallback(() => {
    setOffset(ZERO);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  return {
    offset,
    dragging,
    /** True if the pointer travelled far enough that this was a drag, not a tap. */
    wasDragged: () => moved.current,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
