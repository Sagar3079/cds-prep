"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType } from "react";
import Potter, {
  LEDGE_RATIO,
  RIDE_LEDGE_RATIO,
  type PotterProps,
} from "./Potter";
import {
  DEFAULT_CHARACTER,
  character,
  onCharacterChange,
  type CharacterId,
} from "@/lib/potterPrefs";

/**
 * The character registry — the one place that knows what each companion looks
 * like and how a card cuts them.
 *
 * The two ratios are the reason this exists. `ledgeRatio` is the line the
 * perched art grips a card's top edge on; `rideLedgeRatio` is the line the
 * riding art straddles a broom on. They are properties of the DRAWING, not of
 * the placement, and every character's are different — so the three placements
 * read them from here rather than importing Potter's constants. Wired to
 * Potter's numbers, another character floats above the card or sinks into it.
 *
 * Everything is typed against `PotterProps`, which is the contract: a character
 * is a default export taking `mood / look / lookY / size / className / onToggle
 * / thoughtsOn / riding`, plus its own two exported ratios.
 */
export interface Character {
  id: CharacterId;
  /** What Settings calls them. */
  name: string;
  /** One line under the name in the picker. */
  blurb: string;
  Figure: ComponentType<PotterProps>;
  /** Fraction of the figure's height that stands ABOVE a perched ledge. */
  ledgeRatio: number;
  /** The same line for the riding pose. */
  rideLedgeRatio: number;
}

/**
 * Potter is imported statically: he is the default, so he must be on screen in
 * the first paint, never one chunk-load later.
 */
export const POTTER: Character = {
  id: "potter",
  name: "Potter",
  blurb: "Chibi wizard — glasses, scarf, wand.",
  Figure: Potter,
  ledgeRatio: LEDGE_RATIO,
  rideLedgeRatio: RIDE_LEDGE_RATIO,
};

/** Picker order. Potter first because he is the default, not because he is better. */
export const CHARACTER_ORDER: readonly CharacterId[] = ["potter", "kuromi"];

const META: Record<CharacterId, { name: string; blurb: string; file: string }> =
  {
    potter: { name: POTTER.name, blurb: POTTER.blurb, file: "Potter" },
    kuromi: {
      name: "Kuromi",
      blurb: "Jester hood, pink skull, all attitude.",
      file: "Kuromi",
    },
  };

/** The shape a character module has to have. Every field is checked at runtime. */
interface ArtModule {
  default?: ComponentType<PotterProps>;
  LEDGE_RATIO?: number;
  RIDE_LEDGE_RATIO?: number;
}

/**
 * Resolved art, by id. `null` is a *settled* answer — that character is not
 * available in this build — and is cached as firmly as a success, so a missing
 * file costs one failed request rather than one per placement per render.
 */
const cache = new Map<CharacterId, Character | null>([["potter", POTTER]]);
const inflight = new Map<CharacterId, Promise<Character | null>>();

const ratio = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 1;

/** What is known right now, without starting a load. `undefined` = not yet asked. */
export function peekCharacter(id: CharacterId): Character | null | undefined {
  return cache.get(id);
}

/**
 * Load a character's art, or resolve `null` if it is not in this build.
 *
 * The module specifier is BUILT rather than written out, and that is the whole
 * trick. A literal `import("./Kuromi")` is resolved when the app is compiled,
 * so it fails the entire build for as long as that file does not exist —
 * a picker whose second option cannot compile is worse than no picker at all.
 * Interpolated, the bundler defers the resolution to runtime, the failure
 * arrives as a rejected promise this can catch, and the app degrades to exactly
 * one character with nothing thrown.
 */
export function loadCharacter(id: CharacterId): Promise<Character | null> {
  const known = cache.get(id);
  if (known !== undefined) return Promise.resolve(known);
  const running = inflight.get(id);
  if (running) return running;

  const meta = META[id];
  const p = import(`./${meta.file}`)
    .then((mod: ArtModule): Character | null => {
      // A half-written module is rejected outright rather than patched up with
      // Potter's ratios. Borrowing them would put the new character on screen
      // at the wrong proportions — floating above the card or sunk into it —
      // which looks like a layout bug rather than like art that is not ready.
      if (!mod?.default) return null;
      if (!ratio(mod.LEDGE_RATIO) || !ratio(mod.RIDE_LEDGE_RATIO)) return null;
      return {
        id,
        name: meta.name,
        blurb: meta.blurb,
        Figure: mod.default,
        ledgeRatio: mod.LEDGE_RATIO,
        rideLedgeRatio: mod.RIDE_LEDGE_RATIO,
      };
    })
    .catch(() => null)
    .then((art) => {
      cache.set(id, art);
      inflight.delete(id);
      return art;
    });

  inflight.set(id, p);
  return p;
}

/** A store that never changes, for the "are we past hydration" flag below. */
const NEVER = () => () => {};
const onClient = () => true;
const onServer = () => false;
const serverCharacter = () => DEFAULT_CHARACTER;

/**
 * The character to draw right now, and whether that answer has settled.
 *
 * The preference is read through `useSyncExternalStore` rather than copied into
 * state by an effect. That is what makes it SSR-safe by construction: the
 * server has no localStorage, `getServerSnapshot` says so, and React re-reads
 * the real value once hydration is done — no guess, and therefore no hydration
 * mismatch. The same subscription keeps every mounted copy in step when the
 * choice changes in Settings or in another tab.
 *
 * `ready` is false until BOTH the client is live and the art has resolved, and
 * callers render nothing until then. The alternative — drawing Potter while
 * somebody else loads — is a visible pop into a different character on every
 * page load of a session that chose one.
 */
export function useCharacter(): { art: Character; ready: boolean } {
  const id = useSyncExternalStore(
    onCharacterChange,
    character,
    serverCharacter,
  );
  const hydrated = useSyncExternalStore(NEVER, onClient, onServer);

  // Straight from the registry's cache: `undefined` is "not resolved yet",
  // `null` is "settled, and this build has no such character".
  const known = peekCharacter(id);
  const [, redraw] = useState(0);

  useEffect(() => {
    if (known !== undefined) return;
    let live = true;
    // The re-render is requested from the load's own callback, not synced in
    // the effect body: this is an external thing finishing, which is exactly
    // what an effect is for.
    void loadCharacter(id).then(() => {
      if (live) redraw((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [id, known]);

  return { art: known ?? POTTER, ready: hydrated && known !== undefined };
}

/**
 * Run `reset` when the character CHANGES mid-session — never on the first
 * settle.
 *
 * The placements start on Potter and learn the stored preference an effect
 * later, so "the id changed" is also what a normal page load looks like.
 * Treating that as a switch would wipe a legitimately saved drag offset every
 * time the app opened; skipping the first settle is what tells the two apart.
 */
export function useCharacterSwitch(
  id: CharacterId,
  ready: boolean,
  reset: () => void,
): void {
  const seen = useRef<CharacterId | null>(null);
  useEffect(() => {
    if (!ready) return;
    const prev = seen.current;
    seen.current = id;
    if (prev !== null && prev !== id) reset();
  }, [id, ready, reset]);
}

/**
 * Every character whose art this build can actually draw, in picker order.
 *
 * Settings uses it to decide what to offer: with one entry there is no choice
 * to present, and the second character's file simply is not here yet. Probing
 * also warms the cache, so choosing one is instant rather than a chunk load
 * with the figure missing in between.
 */
export function useCharacterRoster(): { list: Character[]; probing: boolean } {
  const [list, setList] = useState<Character[]>([POTTER]);
  const [probing, setProbing] = useState(true);

  useEffect(() => {
    let live = true;
    void Promise.all(CHARACTER_ORDER.map(loadCharacter)).then((all) => {
      if (!live) return;
      setList(all.filter((c): c is Character => c !== null));
      setProbing(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return { list, probing };
}
