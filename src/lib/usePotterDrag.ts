"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DragOffset {
  x: number;
  y: number;
}

const ZERO: DragOffset = { x: 0, y: 0 };

/** Below this, the gesture was a tap, not a drag. Fingers wobble. */
const SLOP = 5;

/** How much of him has to stay inside the panel, in px. */
const KEEP_VISIBLE = 32;

/**
 * Lets Potter be dragged out of the way and stay there.
 *
 * The offset is stored per placement (`home` / `test` / `review`), because a
 * position that works on one screen is meaningless on another, and it survives
 * reloads.
 *
 * Returns `wasDragged`, which the tap handler must check: without it, every
 * drag would also fire the mute toggle on release.
 */
export function usePotterDrag(key: string) {
  const storageKey = `cds-potter-pos-${key}`;
  const [offset, setOffset] = useState<DragOffset>(ZERO);
  const [dragging, setDragging] = useState(false);
  /** Which way his speech should open so it stays inside the panel. */
  const [side, setSide] = useState<"left" | "right">("left");
  const hostRef = useRef<HTMLDivElement | null>(null);

  const start = useRef<{ px: number; py: number; ox: number; oy: number } | null>(
    null,
  );
  const moved = useRef(false);
  /** The applied offset, readable synchronously from the pointer handlers. */
  const applied = useRef<DragOffset>(ZERO);
  applied.current = offset;

  /**
   * Clamp so he can never be pushed out of the panel.
   *
   * Without this one hard drag strands him permanently: the panel is
   * `overflow: hidden`, so he is simply gone, and the offset persists across
   * reloads — the only way back was a Settings button nobody would think to
   * look for. Measured live rather than from stored numbers, because the panel
   * and his own size both change with the viewport.
   */
  const clamp = useCallback((want: DragOffset): DragOffset => {
    const host = hostRef.current;
    const panel = host?.closest(".app-panel");
    if (!host || !panel) return want;

    const p = panel.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    // Where he sits with NO offset — the rect already includes the current one.
    const baseLeft = h.left - applied.current.x;
    const baseTop = h.top - applied.current.y;

    return {
      x: Math.min(
        Math.max(want.x, p.left + KEEP_VISIBLE - (baseLeft + h.width)),
        p.right - KEEP_VISIBLE - baseLeft,
      ),
      y: Math.min(
        Math.max(want.y, p.top + KEEP_VISIBLE - (baseTop + h.height)),
        p.bottom - KEEP_VISIBLE - baseTop,
      ),
    };
  }, []);

  // Read after mount only — the server cannot see localStorage.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as Partial<DragOffset>;
      if (typeof p?.x !== "number" || typeof p?.y !== "number") return;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      // Clamp on the way in as well: an offset stored before a resize, or from
      // a wider window, can be off-screen here.
      setOffset(clamp({ x: p.x, y: p.y }));
    } catch {
      /* unreadable — he just starts where he was designed to */
    }
  }, [storageKey, clamp]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    start.current = {
      px: e.clientX,
      py: e.clientY,
      ox: applied.current.x,
      oy: applied.current.y,
    };
    moved.current = false;
    // Capture is deliberately NOT taken here. Capturing on pointerdown
    // redirects every following pointer event to this wrapper, so the click
    // never reaches the <button> inside it — which is why tapping him to mute
    // stopped working. It is taken below, once it is a real drag.
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.px;
      const dy = e.clientY - s.py;
      if (!moved.current && Math.hypot(dx, dy) < SLOP) return;
      if (!moved.current) {
        moved.current = true;
        setDragging(true);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* some pointer types refuse capture; the drag still works */
        }
      }
      setOffset(clamp({ x: s.ox + dx, y: s.oy + dy }));
    },
    [clamp],
  );

  const finish = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current) return;
      start.current = null;
      setDragging(false);
      if (!moved.current) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(applied.current));
      } catch {
        /* private mode — the position just won't survive a reload */
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* capture already lost */
      }
    },
    [storageKey],
  );

  /**
   * Flip his speech to whichever side has room. Dragged to the left edge, the
   * text would otherwise run off the panel, where overflow: hidden eats it.
   */
  useEffect(() => {
    const host = hostRef.current;
    const panel = host?.closest(".app-panel");
    if (!host || !panel) return;
    const h = host.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const NEEDED = 190; // widest bubble plus its gap
    const roomLeft = h.left - p.left;
    const roomRight = p.right - h.right;
    setSide(roomLeft >= NEEDED || roomLeft >= roomRight ? "left" : "right");
  }, [offset.x, offset.y]);

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
    /** Attach to the draggable wrapper so position can be measured. */
    hostRef,
    side,
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
