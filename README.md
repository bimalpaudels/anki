# German Anki Sync Engine

A type-safe, progress-preserving Anki sync engine built in TypeScript and powered by Bun.

## Architecture

```text
anki/
├── data/
│   ├── verbs.ts       # Verbs data file
│   ├── nouns.ts       # Nouns data file
│   └── <topic>.ts     # Any .ts file placed here is auto-discovered!
├── templates/
│   ├── card.css       # Anki card CSS (gender colors, night mode)
│   ├── front.html     # Front card template
│   └── back.html      # Back card template
├── types.ts           # TypeScript interfaces (VocabItem, CardEntry)
├── sync.ts            # High-performance sync engine
├── package.json
└── README.md
```

---

## Card Styling (Default Anki + Gender Accents)

* Uses Anki's native default card styling (system fonts, colors, natural spacing).
* Only includes gender color accents for the German words:
  * **`der`** $\rightarrow$ Blue
  * **`die`** $\rightarrow$ Red
  * **`das`** $\rightarrow$ Green

---

## The Data Format

You can organize your files with **any export names you want** (e.g. `verbs`, `nouns`, `phrases`, `slang`, `travel`, `questions`), and the script will automatically use that key as a tag:

```ts
import type { VocabItem } from "../types";

export const deck = "German::A1::Daily";

// Any export name is supported and automatically tagged (#verb, #phrase, etc.)
export const verbs: VocabItem[] = [
  {
    de: "essen",
    en: "to eat",
    notes: "du isst | hat gegessen",
    cards: [
      "Ich [esse] einen Apfel.",
    ],
  },
];

export const phrases: VocabItem[] = [
  {
    de: "Guten Tag",
    en: "Good day / hello",
    cards: [
      "Ich sage höflich [Guten Tag].",
    ],
  },
];
```

Or simply export an array directly:
```ts
// data/quick.ts
export default [
  {
    de: "genau",
    en: "exactly",
  },
  {
    de: "vielleicht",
    en: "maybe / perhaps",
    cards: ["Das ist [vielleicht] wahr."],
  },
];
```

---

## How to Sync

With Anki open and AnkiConnect running:

```bash
bun run sync
```
