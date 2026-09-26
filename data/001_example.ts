import type { VocabItem } from "../types";

export const deck = "Deutsch";

export const nouns: VocabItem[] = [
  {
    de: "der Pullover, -",
    en: "the sweater",
    notes: "Nouns ending in -er are typically masculine",
    tags: ["noun"],
    cards: [
      "Zieh einen warmen [Pullover] an.",
    ],
  },
];

export const verbs: VocabItem[] = [
  {
    de: "essen",
    en: "to eat",
    notes: "aß | hat gegessen",
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
    notes: "schneller | am schnellsten",
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
