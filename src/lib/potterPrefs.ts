/**
 * Whether Potter is currently thinking out loud.
 *
 * Every Potter on screen shares this, so tapping any one of them silences all
 * of them. A tiny emitter rather than context: he is mounted in three unrelated
 * subtrees (home, test, results) and threading a provider through all of them
 * to carry one boolean would be worse than this.
 */

const KEY = "cds-potter-thoughts";
const EVENT = "cds-potter-thoughts-change";
const SHOW_KEY = "cds-potter-visible";
const SHOW_EVENT = "cds-potter-visible-change";

export function thoughtsOn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // Default ON — a companion that says nothing until you find a hidden
    // toggle is just a decoration.
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setThoughts(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode — the choice just won't survive a reload */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

export function toggleThoughts(): boolean {
  const next = !thoughtsOn();
  setThoughts(next);
  return next;
}

export function onThoughtsChange(fn: (on: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const local = (e: Event) => fn((e as CustomEvent<boolean>).detail);
  // `storage` fires only in OTHER tabs, so both listeners are needed to keep
  // every open copy of the app in sync.
  const cross = (e: StorageEvent) => {
    if (e.key === KEY) fn(e.newValue !== "off");
  };
  window.addEventListener(EVENT, local);
  window.addEventListener("storage", cross);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener("storage", cross);
  };
}


/* ── whether Potter appears at all ──────────────────────────────────────────
   Separate from the thoughts toggle on purpose: "stop talking" and "go away"
   are different asks, and someone who likes the character but finds the
   commentary noisy should not have to lose him to quieten him. */

export function potterVisible(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SHOW_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setPotterVisible(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHOW_KEY, on ? "on" : "off");
  } catch {
    /* private mode — the choice just won't survive a reload */
  }
  window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: on }));
}

export function onPotterVisibleChange(fn: (on: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const local = (e: Event) => fn((e as CustomEvent<boolean>).detail);
  const cross = (e: StorageEvent) => {
    if (e.key === SHOW_KEY) fn(e.newValue !== "off");
  };
  window.addEventListener(SHOW_EVENT, local);
  window.addEventListener("storage", cross);
  return () => {
    window.removeEventListener(SHOW_EVENT, local);
    window.removeEventListener("storage", cross);
  };
}
