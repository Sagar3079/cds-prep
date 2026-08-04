"use client";

import { useEffect } from "react";

/**
 * Scroll reveals, counting numbers, and the sticky action bar. Renders nothing.
 *
 * All three are progressive enhancement. Every `.rise` is visible without its
 * `is-in` class under reduced motion, and every `[data-count]` ships its final
 * value as text — so if this never runs, the page is static and complete rather
 * than blank. That matters more here than anywhere else in the app: this is the
 * page a stranger arrives on from an advert, and it gets one chance.
 */
export default function LandingMotion() {
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cleanups: Array<() => void> = [];

    // ---- reveal ----
    const rising = Array.from(document.querySelectorAll<HTMLElement>(".rise"));
    if (calm.matches) {
      for (const el of rising) el.classList.add("is-in");
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const el = e.target as HTMLElement;
            window.setTimeout(
              () => el.classList.add("is-in"),
              Number(el.dataset.delay ?? 0),
            );
            io.unobserve(el);
          }
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.04 },
      );
      for (const el of rising) io.observe(el);

      // Anything genuinely inside the viewport gets revealed regardless of what
      // the observer's negative bottom margin thinks. Without this, an element
      // sitting in that band at first paint — or at every position a reader
      // happens to stop at — stays invisible while being perfectly on screen.
      let queued = false;
      const sweep = () => {
        queued = false;
        for (const el of rising) {
          if (el.classList.contains("is-in")) continue;
          const r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) {
            el.classList.add("is-in");
            io.unobserve(el);
          }
        }
      };
      const onScroll = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(sweep);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      const first = window.setTimeout(sweep, 900);
      cleanups.push(() => {
        io.disconnect();
        window.clearTimeout(first);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      });
    }

    // ---- counting numbers ----
    // The final value is already in the DOM; this only replays the climb once,
    // when the number arrives on screen. Eased out, so it decelerates into the
    // real figure instead of stopping dead on it.
    const counters = Array.from(
      document.querySelectorAll<HTMLElement>("[data-count]"),
    );
    if (!calm.matches && counters.length) {
      const fmt = new Intl.NumberFormat("en-IN");
      const run = (el: HTMLElement) => {
        const to = Number(el.dataset.count);
        if (!Number.isFinite(to)) return;
        const started = performance.now();
        const dur = 1100;
        const tick = (now: number) => {
          const t = Math.min(1, (now - started) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = fmt.format(Math.round(to * eased));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      const cio = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            run(e.target as HTMLElement);
            cio.unobserve(e.target);
          }
        },
        { threshold: 0.4 },
      );
      for (const el of counters) cio.observe(el);
      cleanups.push(() => cio.disconnect());
    }

    // ---- the deck's 3D pose ----
    // Three inputs, by capability, because the right one differs per device:
    //   phone  — the physical tilt of the handset (DeviceOrientation)
    //   phone without orientation access — the deck's travel up the screen
    //   desktop — the pointer
    // A finger is not a cursor: tracking touch would mean the card only tilts
    // while a thumb is covering it, so touch never drives this directly.
    const deck = document.querySelector<HTMLElement>(".deck");
    const stage = document.querySelector<HTMLElement>(".stage");
    if (deck && stage && !calm.matches) {
      // A phone is 390px wide: every degree of Y rotation costs real width off
      // the far edge of the card, so the swing is roughly half what a desktop
      // gets. Enough to read as dimensional, not enough to push the stem out
      // of frame — which it did at 11°.
      const narrow = window.innerWidth < 640;
      const REST_X = narrow ? 3 : 4;
      const REST_Y = narrow ? -4 : -7;
      const RANGE = narrow ? 5.5 : 11;
      let tx = 0;
      let ty = 0;
      let cx = 0;
      let cy = 0;
      let raf = 0;
      let running = false;

      const frame = () => {
        // Critically-damped follow. A spring would overshoot, and overshoot on
        // something tracking a continuous input reads as lag, not life.
        cx += (tx - cx) * 0.08;
        cy += (ty - cy) * 0.08;
        deck.style.setProperty("--rx", `${(REST_X + cx).toFixed(2)}deg`);
        deck.style.setProperty("--ry", `${(REST_Y + cy).toFixed(2)}deg`);
        if (Math.abs(tx - cx) > 0.02 || Math.abs(ty - cy) > 0.02) {
          raf = requestAnimationFrame(frame);
        } else {
          running = false;
        }
      };
      const kick = () => {
        if (running) return;
        running = true;
        deck.dataset.live = "true";
        raf = requestAnimationFrame(frame);
      };
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));

      const fine = window.matchMedia("(pointer: fine)").matches;

      const onPointer = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        const box = stage.getBoundingClientRect();
        ty = clamp((e.clientX - (box.left + box.width / 2)) / (box.width / 2)) * RANGE;
        tx = clamp(-(e.clientY - (box.top + box.height / 2)) / (box.height / 2)) * (RANGE * 0.6);
        kick();
      };
      const onScrollTilt = () => {
        const box = stage.getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) return;
        const centre = box.top + box.height / 2;
        const t = clamp(1 - (centre / window.innerHeight) * 2);
        ty = t * RANGE;
        tx = t * (RANGE * 0.45);
        kick();
      };
      let orientationLive = false;
      const onOrient = (e: DeviceOrientationEvent) => {
        if (e.beta === null && e.gamma === null) return;
        orientationLive = true;
        // gamma is left/right tilt, beta front/back. Beta is offset by the
        // angle people actually hold a phone at, not flat on a table.
        ty = clamp((e.gamma ?? 0) / 28) * RANGE;
        tx = clamp(((e.beta ?? 45) - 45) / 32) * (RANGE * 0.7);
        kick();
      };

      if (fine) {
        window.addEventListener("pointermove", onPointer, { passive: true });
        cleanups.push(() => window.removeEventListener("pointermove", onPointer));
      } else {
        // Scroll first so there is always motion, then let orientation take
        // over if the browser grants it without a permission prompt. iOS 13+
        // requires an explicit user gesture to request it, and interrupting a
        // landing page with a motion-access dialog would cost more visitors
        // than the effect wins.
        window.addEventListener("scroll", onScrollTilt, { passive: true });
        window.addEventListener("deviceorientation", onOrient, { passive: true });
        onScrollTilt();
        cleanups.push(() => {
          window.removeEventListener("scroll", onScrollTilt);
          window.removeEventListener("deviceorientation", onOrient);
        });
        // If orientation never reports, scroll keeps driving it.
        window.setTimeout(() => {
          if (!orientationLive) return;
          window.removeEventListener("scroll", onScrollTilt);
        }, 1200);
      }
      cleanups.push(() => cancelAnimationFrame(raf));
    }

    // ---- sticky action bar ----
    // Appears once the hero's own button has left, so there is never a moment
    // with two competing calls to action on one screen.
    const sticky = document.querySelector<HTMLElement>(".dock");
    const anchor = document.querySelector<HTMLElement>("[data-cta-anchor]");
    if (sticky && anchor) {
      const sio = new IntersectionObserver(
        ([e]) => {
          sticky.dataset.shown = String(!e.isIntersecting);
        },
        { threshold: 0 },
      );
      sio.observe(anchor);
      cleanups.push(() => sio.disconnect());
    }

    return () => {
      for (const c of cleanups) c();
    };
  }, []);

  return null;
}
