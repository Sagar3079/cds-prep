/**
 * The study companion's three preferences: whether they appear, whether they
 * think out loud, and which character they are.
 *
 * Every copy on screen shares them, so tapping any one of them silences all of
 * them. A tiny emitter rather than context: the character is mounted in three
 * unrelated subtrees (home, test, results) and threading a provider through all
 * of them to carry two booleans and an id would be worse than this.
 */

const KEY = "cds-potter-thoughts";
const EVENT = "cds-potter-thoughts-change";
const SHOW_KEY = "cds-potter-visible";
const SHOW_EVENT = "cds-potter-visible-change";
const CHAR_KEY = "cds-potter-character";
const CHAR_EVENT = "cds-potter-character-change";

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


/* ── which character appears ────────────────────────────────────────────────
   The id only. What each one looks like, and the two ledge ratios that say
   where a card cuts them, live in the character registry
   (`src/components/potter/characters.ts`) — this file stays React-free and must
   not know about art. */

export type CharacterId = "potter" | "kuromi";

/**
 * Potter is both the default and the fallback. An id from a newer build, a
 * hand-edited value, or a character whose art fails to load all resolve back to
 * him rather than to an empty screen.
 */
export const DEFAULT_CHARACTER: CharacterId = "potter";
const CHARACTER_IDS: readonly string[] = ["potter", "kuromi"];

/**
 * `usePotterDrag`'s placement keys, duplicated on purpose.
 *
 * The hook is a `"use client"` React module and this one must stay importable
 * from anywhere, so it cannot import the key builder. The Settings "reset his
 * position" button already carries the same list for the same reason; if a
 * fourth placement is ever added, both need it.
 */
const DRAG_KEYS = ["home", "test", "review"];

export function character(): CharacterId {
  if (typeof window === "undefined") return DEFAULT_CHARACTER;
  try {
    const raw = localStorage.getItem(CHAR_KEY);
    return raw !== null && CHARACTER_IDS.includes(raw)
      ? (raw as CharacterId)
      : DEFAULT_CHARACTER;
  } catch {
    return DEFAULT_CHARACTER;
  }
}

export function setCharacter(id: CharacterId): void {
  if (typeof window === "undefined") return;
  const changed = id !== character();
  try {
    localStorage.setItem(CHAR_KEY, id);
    // A stored drag offset belongs to ONE figure's geometry: it was measured
    // against that character's size and the position they perch in. Carried
    // over to a taller or shorter one it is not where anybody put anything —
    // so switching characters starts them back on the ledge. The clamp would
    // keep the old offset inside the panel, but "inside the panel" is not the
    // same as "where I left him".
    if (changed) {
      for (const k of DRAG_KEYS) localStorage.removeItem(`cds-potter-pos-${k}`);
    }
  } catch {
    /* private mode — the choice just won't survive a reload */
  }
  window.dispatchEvent(new CustomEvent(CHAR_EVENT, { detail: id }));
}

export function onCharacterChange(fn: (id: CharacterId) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const local = (e: Event) => fn((e as CustomEvent<CharacterId>).detail);
  const cross = (e: StorageEvent) => {
    if (e.key === CHAR_KEY) {
      fn(
        e.newValue !== null && CHARACTER_IDS.includes(e.newValue)
          ? (e.newValue as CharacterId)
          : DEFAULT_CHARACTER,
      );
    }
  };
  window.addEventListener(CHAR_EVENT, local);
  window.addEventListener("storage", cross);
  return () => {
    window.removeEventListener(CHAR_EVENT, local);
    window.removeEventListener("storage", cross);
  };
}
