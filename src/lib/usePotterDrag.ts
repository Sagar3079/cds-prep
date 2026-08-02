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
 * Gap kept between him and the panel wall, in px.
 *
 * Wide enough to absorb the review rider's weave. The clamp is a snapshot taken
 * from a live rect, but on the review screen a second transform — the flight —
 * keeps moving him afterwards, so a flush 6px inset still let the weave carry
 * him a few px past the wall. This is the slack that costs nothing visually.
 */
const INSET = 18;

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
export function usePotterDrag(
  key: string,
  { clampOnScroll = false }: { clampOnScroll?: boolean } = {},
) {
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
   *
   * The bound is the WHOLE figure, not a sliver of it. An earlier version only
   * guaranteed 32px stayed inside, which let a drag park him straddling the
   * panel wall — half a wizard hanging off the edge of the phone, sheared by
   * the overflow. Inside the frame is the only place he belongs.
   */
  const clamp = useCallback((want: DragOffset): DragOffset => {
    const host = hostRef.current;
    const panel = host?.closest(".app-panel");
    if (!host || !panel) return want;

    const p = panel.getBoundingClientRect();
    // The figure, not the wrapper it hangs in. The wrapper's box is not his:
    // the rider's bank rotates him, so he reaches past it on both sides, and
    // clamping the wrapper still left ~12px of wizard outside the panel wall.
    const fig = host.querySelector<HTMLElement>(".potter") ?? host;
    const h = fig.getBoundingClientRect();
    // Where he sits with NO offset — the rect already includes the current one.
    const baseLeft = h.left - applied.current.x;
    const baseTop = h.top - applied.current.y;

    // If he is somehow larger than the panel, pin to the top-left rather than
    // inverting the range and snapping him to the far corner.
    const fit = (
      want: number,
      base: number,
      size: number,
      lo: number,
      hi: number,
    ) => {
      const min = lo + INSET - base;
      const max = hi - INSET - (base + size);
      return max < min ? min : Math.min(Math.max(want, min), max);
    };

    return {
      x: fit(want.x, baseLeft, h.width, p.left, p.right),
      y: fit(want.y, baseTop, h.height, p.top, p.bottom),
    };
  }, []);

  /**
   * Re-apply the clamp against the CURRENT layout.
   *
   * Restoring a stored offset cannot clamp on its own: the rider renders
   * `null` until the review list arrives, so at the moment the stored value is
   * read there is no host to measure and `clamp` passes it straight through.
   * A saved `{x: 900, y: -900}` therefore survived intact and put him 476px
   * above the panel — the "where has he gone" bug in a new disguise. This runs
   * again as soon as he is measurable, and on every resize, because a position
   * that fitted a wide window does not fit a narrow one.
   */
  const reclamp = useCallback(() => {
    // Nothing to correct if he has never been moved, and this runs on every
    // scroll frame of the review screen. `clamp` reads two rects, which during
    // a touch scroll is a forced synchronous layout per frame — paid by every
    // reader, for a drag almost none of them have made.
    if (applied.current.x === 0 && applied.current.y === 0) return;
    setOffset((cur) => {
      const next = clamp(cur);
      return next.x === cur.x && next.y === cur.y ? cur : next;
    });
  }, [clamp]);

  useEffect(() => {
    let raf = 0;
    let tries = 0;
    const tick = () => {
      if (hostRef.current?.closest(".app-panel")) {
        reclamp();
        return;
      }
      // ~1s of frames. He may never mount at all (hidden in Settings, or the
      // screen is too narrow for him), so this gives up rather than spinning.
      if (tries++ < 60) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Scroll is OPT-IN, and only the review rider opts in.
    //
    // There the drag offset is not the only transform on him: the flight loop
    // adds its own and clamps itself in list coordinates that know nothing
    // about a drag, so their sum can leave the panel, and their sum only exists
    // at paint time — one snapshot at mount cannot bound it.
    //
    // Everywhere else he is absolutely positioned against the page and is
    // SUPPOSED to scroll away with it. Clamping him on scroll pins him to the
    // panel while the card travels out from under him, which on the home screen
    // grew the offset from 0 to 365px of pure scrolling and slid him down
    // behind the card he was perched on. A clamp must correct a drag, never
    // invent one.
    //
    // Coalesced to a frame, and `reclamp` bails without a state update when
    // nothing changed, so an ordinary scroll costs one pair of rect reads and
    // no re-render.
    let pending = 0;
    const onScroll = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        reclamp();
      });
    };
    if (clampOnScroll) {
      document.addEventListener("scroll", onScroll, {
        capture: true,
        passive: true,
      });
    }
    window.addEventListener("resize", reclamp);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pending);
      if (clampOnScroll) {
        document.removeEventListener("scroll", onScroll, { capture: true });
      }
      window.removeEventListener("resize", reclamp);
    };
  }, [reclamp, clampOnScroll]);

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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const host = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      const s = {
        px: e.clientX,
        py: e.clientY,
        ox: applied.current.x,
        oy: applied.current.y,
      };
      start.current = s;
      moved.current = false;
      // Capture is deliberately NOT taken here. Capturing on pointerdown
      // redirects every following pointer event to this wrapper, so the click
      // never reaches the <button> inside it — which is why tapping him to
      // mute stopped working. It is taken below, once it is a real drag.
      //
      // The gesture is tracked on `window`, not on the wrapper. Until the
      // slop is crossed no capture is held, so a wrapper-bound handler only
      // hears moves whose target is inside his own subtree — and half of him
      // sits BEHIND a card on every perch, so a drag that set off downward
      // put its very first move on the card and died silently, storing
      // nothing. Window listeners hear the whole gesture wherever the
      // pointer is; per-gesture closures keep add/remove exactly paired.
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || start.current !== s) return;
        const dx = ev.clientX - s.px;
        const dy = ev.clientY - s.py;
        if (!moved.current && Math.hypot(dx, dy) < SLOP) return;
        if (!moved.current) {
          moved.current = true;
          setDragging(true);
          try {
            host.setPointerCapture(pointerId);
          } catch {
            /* some pointer types refuse capture; the drag still works */
          }
        }
        setOffset(clamp({ x: s.ox + dx, y: s.oy + dy }));
      };
      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (start.current !== s) return;
        start.current = null;
        setDragging(false);
        if (!moved.current) return;
        try {
          localStorage.setItem(storageKey, JSON.stringify(applied.current));
        } catch {
          /* private mode — the position just won't survive a reload */
        }
        try {
          host.releasePointerCapture(pointerId);
        } catch {
          /* capture already lost */
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [clamp, storageKey],
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
    // Only the start lives on the wrapper — move/up/cancel are window-level
    // for the length of each gesture, attached in onPointerDown.
    handlers: {
      onPointerDown,
    },
  };
}
