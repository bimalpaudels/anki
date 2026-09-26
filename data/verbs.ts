import type { VocabItem } from "../types";

export const deck = "Deutsch";

export const verbs: VocabItem[] = [
  {
    de: "essen",
    en: "to eat",
    notes: "irregular: du isst, er isst | Perfekt: hat gegessen",
    cards: [
      "Ich [esse] einen Apfel.",
    ],
  },
  {
    de: "trinken",
    en: "to drink",
    notes: "regular: er trinkt | Perfekt: hat getrunken",
    cards: [
      "Er [trinkt] jeden Morgen Kaffee.",
    ],
  },
  {
    de: "fahren",
    en: "to drive / travel",
    notes: "irregular: fährt, fuhr, ist gefahren (takes 'sein')",
    cards: [
      "Ich [fahre] jeden Tag mit der U-Bahn.",
      "Gestern [sind] wir nach Berlin [gefahren].",
    ],
  },
  {
    de: "anrufen",
    en: "to call (on the phone)",
    notes: "separable verb: ruft an | hat angerufen (+ Akkusativ)",
    cards: [
      "Ich [rufe] dich heute Abend [an].",
    ],
  },
];
