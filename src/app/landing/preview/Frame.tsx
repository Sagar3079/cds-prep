"use client";

import { useState } from "react";

/**
 * A phone-shaped viewport around the real `/landing`, with the sizes that
 * matter for this campaign.
 *
 * 360×640 is the small Android that fails first; 390×844 is the iPhone most
 * traffic will arrive on; 430×932 is the large phone. Nothing here is bigger
 * than a phone on purpose — the ads are mobile-only, so a desktop preview of a
 * desktop layout would be reviewing a screen nobody in the campaign will see.
 */
const DEVICES = [
  { id: "small", label: "Small Android", w: 360, h: 640 },
  { id: "iphone", label: "iPhone 12/13/14", w: 390, h: 844 },
  { id: "large", label: "Large phone", w: 430, h: 932 },
] as const;

export default function Frame() {
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[1]);
  // Cache-busting the iframe on device change forces a fresh layout pass;
  // without it the page keeps the width it first rendered at.
  const [nonce, setNonce] = useState(0);

  return (
    <div className="pv">
      <header className="pv-bar">
        <div className="pv-title">
          <strong>/landing</strong>
          <span>mobile preview — this is the real page in an iframe</span>
        </div>
        <div className="pv-controls" role="group" aria-label="Device size">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={d.id === device.id}
              className={d.id === device.id ? "is-on" : ""}
              onClick={() => {
                setDevice(d);
                setNonce((n) => n + 1);
              }}
            >
              {d.label}
              <i>
                {d.w}×{d.h}
              </i>
            </button>
          ))}
          <button type="button" onClick={() => setNonce((n) => n + 1)}>
            Reload
            <i>fresh render</i>
          </button>
          <a href="/landing" target="_blank" rel="noreferrer">
            Open full
            <i>new tab</i>
          </a>
        </div>
      </header>

      <div className="pv-stage">
        <div
          className="pv-phone"
          style={{ width: `${device.w}px`, height: `${device.h}px` }}
        >
          {/* No notch. It sat on top of the page's own top bar and hid the
              countdown — a preview chrome that covers the thing being
              previewed is worse than no chrome. */}
          <iframe
            key={`${device.id}-${nonce}`}
            src="/landing"
            title={`Landing page at ${device.w}×${device.h}`}
            width={device.w}
            height={device.h}
          />
        </div>
        <p className="pv-note">
          Scroll inside the phone. Tap an answer on the question card — it is
          live, not a picture.
        </p>
      </div>

      <style>{`
        .pv {
          min-height: 100dvh;
          background: #0e1017;
          color: #e8ecf7;
          font: 400 14px/1.5 ui-sans-serif, system-ui, sans-serif;
          display: flex;
          flex-direction: column;
        }
        .pv-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.9rem 1.25rem;
          border-bottom: 1px solid #232838;
          background: #12151f;
        }
        .pv-title strong { font-family: ui-monospace, monospace; font-size: 0.9375rem; }
        .pv-title span { display: block; color: #8b95ad; font-size: 0.75rem; margin-top: 0.15rem; }
        .pv-controls { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .pv-controls button,
        .pv-controls a {
          display: grid;
          gap: 0.1rem;
          padding: 0.45rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid #2b3143;
          background: #171b28;
          color: #cfd6e8;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          text-align: left;
        }
        .pv-controls i { font-style: normal; font-size: 0.625rem; color: #7b849c; font-family: ui-monospace, monospace; }
        .pv-controls button:hover,
        .pv-controls a:hover { border-color: #3d4661; }
        .pv-controls .is-on { border-color: #ffb627; color: #ffb627; }
        .pv-controls .is-on i { color: #b98524; }
        .pv-stage {
          flex: 1;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 1rem;
          padding: 2rem 1rem 3rem;
        }
        .pv-phone {
          position: relative;
          border-radius: 2.25rem;
          border: 10px solid #1b1f2c;
          box-shadow: 0 40px 90px -30px rgba(0,0,0,0.9), 0 0 0 1px #333b52;
          overflow: hidden;
          background: #000;
          flex: none;
        }
        .pv-phone iframe { display: block; border: 0; }
        .pv-note { margin: 0; color: #8b95ad; font-size: 0.8125rem; text-align: center; }
      `}</style>
    </div>
  );
}
