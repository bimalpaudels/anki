import type { VocabItem } from "../types";

export const deck = "Deutsch";

export const nouns: VocabItem[] = [
  {
    de: "der Kaffee",
    en: "the coffee",
    notes: "Masculine: der Kaffee",
    cards: [
      "Möchtest du eine Tasse [Kaffee]?",
    ],
  },
  {
    de: "das Buch, ⸚er",
    en: "the book",
    notes: "Neuter: das Buch | Plural: die Bücher",
    cards: [
      "Ich lese gerade ein interessantes [Buch].",
      "In der Bibliothek gibt es viele [Bücher].",
    ],
  },
  {
    de: "die Wohnung, -en",
    en: "the apartment / flat",
    notes: "Feminine (-ung suffix is always 'die') | Plural: die Wohnungen",
    cards: [
      "Unsere neue [Wohnung] hat einen Balkon.",
      "Die [Wohnungen] in dieser Stadt sind teuer.",
    ],
  },
];
