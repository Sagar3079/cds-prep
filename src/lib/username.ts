import { randomInt } from "node:crypto";

/**
 * Names for accounts nobody signed up for.
 *
 * Every visitor who starts a test gets an account, and an account with no name
 * has to be shown as something. "Anonymous" repeated down a leaderboard tells a
 * candidate nothing about whether they beat anyone, so the generated name has
 * to read like a person picked it.
 *
 * There is no uniqueness index in this app — no account-creation path has ever
 * enforced one, and adding a permanent `uname:` key per account would grow a
 * second copy of the account table forever. So the space is made wide instead:
 * 96 x 96 x 32^4 is a little over nine billion, which puts a coin-flip
 * collision past ninety thousand accounts. Two identical rows on a leaderboard
 * is a cosmetic problem; a permanent index that outlives the accounts it names
 * is a structural one.
 */
const ADJECTIVES = [
  "Swift", "Bold", "Steady", "Keen", "Bright", "Calm", "Sharp", "Quick",
  "Brave", "Sure", "Alert", "Deft", "Stout", "Nimble", "True", "Firm",
  "Silent", "Rapid", "Iron", "Steel", "Granite", "Summit", "Northern", "Coastal",
  "Highland", "Desert", "Monsoon", "Tidal", "Polar", "Solar", "Lunar", "Stellar",
  "Vigilant", "Resolute", "Patient", "Precise", "Rugged", "Tireless", "Fearless", "Watchful",
  "Amber", "Azure", "Crimson", "Golden", "Silver", "Scarlet", "Emerald", "Cobalt",
  "Eastern", "Western", "Central", "Frontier", "Border", "Ridge", "Valley", "River",
  "Thunder", "Lightning", "Storm", "Gale", "Cinder", "Ember", "Frost", "Dawn",
  "Dusk", "Midnight", "Meridian", "Zenith", "Apex", "Prime", "Elite", "Select",
  "Rising", "Soaring", "Charging", "Guarding", "Leading", "Standing", "Holding", "Ranging",
  "Quiet", "Humble", "Earnest", "Ready", "Willing", "Able", "Capable", "Skilled",
  "Veteran", "Cadet", "Junior", "Senior", "Chief", "Major", "Field", "Line",
];

const NOUNS = [
  "Falcon", "Hawk", "Eagle", "Kite", "Osprey", "Harrier", "Kestrel", "Condor",
  "Tiger", "Lion", "Leopard", "Panther", "Jaguar", "Lynx", "Cheetah", "Puma",
  "Wolf", "Fox", "Bear", "Stag", "Bison", "Ibex", "Markhor", "Gaur",
  "Cobra", "Viper", "Python", "Krait", "Mamba", "Adder", "Racer", "Boa",
  "Ranger", "Scout", "Pilot", "Sailor", "Marine", "Trooper", "Sentry", "Guard",
  "Lancer", "Gunner", "Sapper", "Signaller", "Rifleman", "Grenadier", "Dragoon", "Hussar",
  "Compass", "Beacon", "Anchor", "Rudder", "Mast", "Keel", "Helm", "Prow",
  "Summit", "Ridge", "Peak", "Crest", "Bluff", "Cliff", "Spur", "Cairn",
  "Arrow", "Sabre", "Lance", "Shield", "Bastion", "Rampart", "Citadel", "Keep",
  "Comet", "Meteor", "Nova", "Quasar", "Pulsar", "Orbit", "Vector", "Apogee",
  "Monsoon", "Cyclone", "Typhoon", "Tempest", "Zephyr", "Breeze", "Current", "Tide",
  "Cadet", "Aspirant", "Scholar", "Student", "Candidate", "Contender", "Runner", "Climber",
];

/** No I, O, 0 or 1 — a name people read aloud should not turn on those. */
const SUFFIX_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SUFFIX_LEN = 4;

export function generateUsername(): string {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const noun = NOUNS[randomInt(NOUNS.length)];
  let suffix = "";
  for (let i = 0; i < SUFFIX_LEN; i += 1) {
    suffix += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)];
  }
  return `${adjective}${noun}-${suffix}`;
}

/**
 * Whether a name looks generated.
 *
 * The admin panel separates people who chose a name from people who were handed
 * one, and that is the only question this answers. It is a shape test, so a
 * candidate who happens to type `SwiftFalcon-2K9X` reads as generated — which
 * costs one misfiled row in a dashboard and nothing else.
 */
export function looksGenerated(name: string | undefined): boolean {
  if (!name) return false;
  return new RegExp(`^[A-Z][a-z]+[A-Z][a-z]+-[${SUFFIX_ALPHABET}]{${SUFFIX_LEN}}$`).test(name.trim());
}
