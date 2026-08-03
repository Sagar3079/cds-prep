"use client";

import { useEffect } from "react";

/**
 * The two JS-driven effects on the landing page. Renders nothing.
 *
 * Both are progressive enhancement: the deck has a resting pose in CSS and
 * every `.lp-reveal` is visible without `is-in` under reduced motion, so a
 * failure here costs the motion and never the page.
 *
 * `prefers-reduced-motion` is checked in JS as well as CSS. globals.css
 * neutralises CSS animation app-wide under that query, but nothing there can
 * stop a `requestAnimationFrame` loop writing inline transforms — so this bails
 * out before installing the listener at all, rather than animating invisibly.
 */
export default function LandingMotion() {
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cleanups: Array<() => void> = [];

    // ---- scroll reveal ----
    const revealed = Array.from(
      document.querySelectorAll<HTMLElement>(".lp-reveal"),
    );
    let io: IntersectionObserver | null = null;
    if (calm.matches) {
      for (const el of revealed) el.classList.add("is-in");
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            // Stagger by position within its own group, so a row of three
            // cards arrives as a row rather than three unrelated events.
            const el = e.target as HTMLElement;
            const delay = Number(el.dataset.revealDelay ?? 0);
            window.setTimeout(() => el.classList.add("is-in"), delay);
            io!.unobserve(el);
          }
        },
        // Fires a little before the element reaches the fold: by the time the
        // reader's eye lands on it the transition has already finished, which
        // is the difference between "alive" and "slow".
        { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
      );
      for (const el of revealed) io.observe(el);

      // Safety sweep. That -12% bottom margin creates a band the observer
      // treats as off-screen, and an element that happens to sit inside it at
      // every scroll position the reader stops at never fires — it stays at
      // opacity 0 while being perfectly visible. Rare with a continuous
      // gesture, reproducible with paging keys, and the failure is invisible
      // copy on a page whose whole job is copy. So: anything genuinely inside
      // the real viewport gets revealed regardless of what the observer thinks.
      let sweeping = false;
      const sweep = () => {
        sweeping = false;
        for (const el of revealed) {
          if (el.classList.contains("is-in")) continue;
          const r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) {
            el.classList.add("is-in");
            io!.unobserve(el);
          }
        }
      };
      const onScrollSweep = () => {
        if (sweeping) return;
        sweeping = true;
        requestAnimationFrame(sweep);
      };
      window.addEventListener("scroll", onScrollSweep, { passive: true });
      window.addEventListener("resize", onScrollSweep, { passive: true });

      // One sweep on mount, not just on scroll. Content that is ON SCREEN at
      // first paint but inside the -12% band never gets a scroll event to
      // rescue it — that was the hero's "Free. No account, no card" line,
      // sitting under the primary button and invisible until you scrolled.
      // Delayed past the hero's own stagger so the entrance still plays.
      const first = window.setTimeout(sweep, 900);
      cleanups.push(() => {
        window.clearTimeout(first);
        window.removeEventListener("scroll", onScrollSweep);
        window.removeEventListener("resize", onScrollSweep);
      });
    }

    // ---- the deck's 3D pose ----
    // Driven by the pointer on a mouse, and by SCROLL on a touch screen. This
    // page is advertised to phones only, where there is no hover and a finger
    // on the card is a finger covering it — so scroll position is the input
    // that actually exists. The deck turns as it travels up the screen, which
    // makes the tilt legible in the one gesture every visitor performs.
    const deck = document.querySelector<HTMLElement>(".lp-deck");
    const stage = document.querySelector<HTMLElement>(".lp-stage");
    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let running = false;

    // The resting pose, matching the CSS defaults. The deck eases back to this
    // when the pointer leaves rather than snapping flat.
    const REST_X = 8;
    const REST_Y = -16;
    const RANGE = 12;

    const frame = () => {
      // Critically-damped-ish follow. A spring would overshoot, and overshoot
      // on a pointer-tracked object reads as lag, not life.
      curX += (targetX - curX) * 0.09;
      curY += (targetY - curY) * 0.09;
      deck!.style.setProperty("--rx", `${(REST_X + curX).toFixed(2)}deg`);
      deck!.style.setProperty("--ry", `${(REST_Y + curY).toFixed(2)}deg`);
      if (Math.abs(targetX - curX) > 0.02 || Math.abs(targetY - curY) > 0.02) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
      }
    };
    const kick = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      // Coarse pointers get nothing: a finger IS the cursor, so tracking it
      // means the card only tilts while it is hidden under a thumb.
      if (e.pointerType !== "mouse") return;
      const box = stage!.getBoundingClientRect();
      const nx = (e.clientX - (box.left + box.width / 2)) / (box.width / 2);
      const ny = (e.clientY - (box.top + box.height / 2)) / (box.height / 2);
      targetY = Math.max(-1, Math.min(1, nx)) * RANGE;
      targetX = Math.max(-1, Math.min(1, -ny)) * (RANGE * 0.6);
      deck!.dataset.live = "true";
      kick();
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      delete deck!.dataset.live;
      kick();
    };

    // Touch: the deck's own travel through the viewport is the input.
    const onScrollTilt = () => {
      const box = stage!.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) return;
      // -1 when the deck sits at the bottom of the screen, +1 at the top.
      const centre = box.top + box.height / 2;
      const t = 1 - (centre / window.innerHeight) * 2;
      targetY = Math.max(-1, Math.min(1, t)) * RANGE;
      targetX = Math.max(-1, Math.min(1, t)) * (RANGE * 0.45);
      kick();
    };

    const fine = window.matchMedia("(pointer: fine)").matches;
    const canTilt = Boolean(deck && stage) && !calm.matches;
    if (canTilt && fine) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    } else if (canTilt) {
      deck!.dataset.live = "true";
      window.addEventListener("scroll", onScrollTilt, { passive: true });
      onScrollTilt();
    }

    // ---- sticky action bar ----
    // Shown once the hero's own button has left the screen, so there is never
    // a moment with two competing calls to action on one viewport.
    const sticky = document.querySelector<HTMLElement>(".lp-sticky");
    const heroBtn = document.querySelector<HTMLElement>(".lp-hero .lp-btn");
    let stickyIo: IntersectionObserver | null = null;
    if (sticky && heroBtn) {
      stickyIo = new IntersectionObserver(
        ([e]) => {
          sticky.dataset.shown = String(!e.isIntersecting);
        },
        { threshold: 0 },
      );
      stickyIo.observe(heroBtn);
    }

    return () => {
      for (const c of cleanups) c();
      io?.disconnect();
      stickyIo?.disconnect();
      if (canTilt && fine) {
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerleave", onLeave);
      } else if (canTilt) {
        window.removeEventListener("scroll", onScrollTilt);
      }
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
