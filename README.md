# German Anki Sync Engine

A type-safe, progress-preserving Anki sync engine built in TypeScript and powered by Bun.

---

## How to Sync

### Prerequisites
1. [Bun](https://bun.sh) installed.
2. [Anki](https://apps.ankiweb.net/) open with the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on running.

### Run Sync
```bash
bun run sync
```

---

## Architecture

```text
anki/
├── data/
│   ├── 001_example.ts # Example dataset (noun, verb, adjective, idiom)
│   └── <topic>.ts     # Any .ts file placed here is auto-discovered!
├── templates/
│   ├── card.css       # Anki card styling (gender accents, night mode)
│   ├── front.html     # Front card layout (prompt + cloze question)
│   └── back.html      # Back card layout (answer, sentence, notes)
├── types.ts           # Strict TypeScript interfaces & Tag definitions
├── sync.ts            # Fast, pure-Bun sync engine
├── package.json
└── README.md
```

---

## Key Features

* **Lossless In-Place Upsert**: Updates existing cards (translations, cloze sentences, notes, tags) in Anki without resetting your spaced repetition review stats or interval history.
* **Bracket Cloze Parser**: Write example sentences using brackets like `"Ich [esse] einen Apfel."`. The engine automatically creates:
  * **Front**: `Ich <u>_____</u> einen Apfel.`
  * **Back**: `Ich <u><b>esse</b></u> einen Apfel.`
* **Dynamic Gender Accents**: Automatically highlights German noun articles in both light and dark/night mode:
* **Strict Tag System**: Tags are optional and strictly typed via a controlled union (`noun`, `verb`, `adjective`, `adverb`, `phrase`, `idiom`).
---

## The Data Format

Place any `.ts` file inside `data/`. You can organize words using any exported variable names:

```ts
import type { Tag, VocabItem } from "../types";

// Target deck in Anki
export const deck = "Deutsch";

// Optional: file-level tags inherited by all cards in this file
export const tags: Tag[] = ["verb"];

// Export arrays using any variable name you prefer
export const verbs: VocabItem[] = [
  {
    de: "essen",
    en: "to eat",
    notes: "irregular: du isst, er isst | Perfekt: hat gegessen",
    tags: ["verb"], // Optional item-level tags
    cards: [
      "Ich [esse] einen Apfel.",
    ],
  },
];

export const idioms: VocabItem[] = [
  {
    de: "jemandem die Daumen drücken",
    en: "to cross one's fingers for someone",
    tags: ["idiom"],
    cards: [
      "Ich [drücke] dir die Daumen für die Prüfung!",
    ],
  },
];
```

### Standalone Vocab (No Sentences Needed)

`cards` and `notes` are optional. If you just want to drill a word or phrase, omit `cards`:

```ts
export const quickWords: VocabItem[] = [
  {
    de: "genau",
    en: "exactly",
  },
  {
    de: "vielleicht",
    en: "maybe / perhaps",
  },
];
```
* Generates a base card at slot `0`.
* If you add example sentences later, slot `0` seamlessly upgrades in-place to your first sentence while preserving its Anki review history.

---

## Tagging System

Tags are strictly validated in `types.ts`:

```ts
export const ALLOWED_TAGS = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "phrase",
  "idiom",
] as const;
```

To add new tags (e.g. `A1`, `travel`, `food`), simply append them to `ALLOWED_TAGS` in `types.ts`.
