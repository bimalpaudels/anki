import type { VocabItem } from "../types";

export const deck = "deutsch";

export const nouns: VocabItem[] = [
  {
    de: "der Kaffee",
    en: "the coffee",
    notes: "Masculine: der Kaffee",
    tags: ["noun"],
    cards: [
      "Möchtest du eine Tasse [Kaffee]?",
    ],
  },
];

export const verbs: VocabItem[] = [
  {
    de: "essen",
    en: "to eat",
    notes: "irregular: du isst, er isst | Perfekt: hat gegessen",
    tags: ["verb"],
    cards: [
      "Ich [esse] einen Apfel.",
    ],
  },
];

export const adjectives: VocabItem[] = [
  {
    de: "schnell",
    en: "fast / quick",
    tags: ["adjective"],
    cards: [
      "Er fährt sehr [schnell].",
    ],
  },
];

export const idioms: VocabItem[] = [
  {
    de: "jemandem die Daumen drücken",
    en: "to cross one's fingers for someone / wish someone luck",
    notes: "Literally: to press the thumbs for someone",
    tags: ["idiom"],
    cards: [
      "Ich [drücke] dir die Daumen für die Prüfung!",
    ],
  },
];
