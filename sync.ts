import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CardEntry, DeckModule, VocabItem } from "./types";

const ANKI_CONNECT_URL = process.env.ANKI_CONNECT_URL || "http://127.0.0.1:8765";
const MODEL_NAME = "GermanCard";
const MODEL_FIELDS = ["UID", "FrontEn", "FrontSentence", "BackDe", "BackSentence", "Notes"];

const CARD_CSS = `
.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}

.gender-der { color: #2563eb !important; }
.gender-die { color: #dc2626 !important; }
.gender-das { color: #16a34a !important; }

.nightMode .gender-der { color: #89b4fa !important; }
.nightMode .gender-die { color: #f38ba8 !important; }
.nightMode .gender-das { color: #a6e3a1 !important; }
`;

const CARD_TEMPLATES = [
  {
    Name: "German Card",
    Front: `
<div>{{FrontEn}}</div>
{{#FrontSentence}}
<br>
<div>{{FrontSentence}}</div>
{{/FrontSentence}}
    `.trim(),
    Back: `
<div>{{FrontEn}}</div>
{{#FrontSentence}}
<br>
<div>{{FrontSentence}}</div>
{{/FrontSentence}}
<hr id="answer">
<div id="de-text" style="font-size: 1.2em; font-weight: bold;">{{BackDe}}</div>
{{#BackSentence}}
<br>
<div>{{BackSentence}}</div>
{{/BackSentence}}
{{#Notes}}
<br>
<div style="font-size: 0.85em; color: gray;">{{Notes}}</div>
{{/Notes}}
<script>
(function() {
  var el = document.getElementById("de-text");
  if (!el) return;
  var txt = el.innerText.trim();
  if (txt.startsWith("der ") || txt.startsWith("der/")) el.classList.add("gender-der");
  else if (txt.startsWith("die ") || txt.startsWith("die/")) el.classList.add("gender-die");
  else if (txt.startsWith("das ") || txt.startsWith("das/")) el.classList.add("gender-das");
})();
</script>
    `.trim(),
  },
];

async function ankiConnect(action: string, params: Record<string, any> = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch (err: any) {
    throw new Error(`Could not connect to Anki at ${ANKI_CONNECT_URL} (${err.message})`);
  }

  const result = await res.json();
  if (result.error) throw new Error(`AnkiConnect Error [${action}]: ${result.error}`);
  return result.result;
}

async function ensureModelExists() {
  const models: string[] = await ankiConnect("modelNames");
  if (!models.includes(MODEL_NAME)) {
    await ankiConnect("createModel", {
      modelName: MODEL_NAME,
      inOrderFields: MODEL_FIELDS,
      css: CARD_CSS,
      cardTemplates: CARD_TEMPLATES,
    });
    console.log(`✓ Created Note Type "${MODEL_NAME}"`);
  } else {
    try {
      await ankiConnect("updateModelTemplates", {
        model: {
          name: MODEL_NAME,
          templates: {
            "German Card": {
              Front: CARD_TEMPLATES[0].Front,
              Back: CARD_TEMPLATES[0].Back,
            },
          },
        },
      });
      await ankiConnect("updateModelStyling", {
        model: { name: MODEL_NAME, css: CARD_CSS },
      });
    } catch {}
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSentence(raw?: string): { frontSentence: string; backSentence: string } {
  if (!raw) return { frontSentence: "", backSentence: "" };
  const trimmed = raw.trim();
  if (!trimmed.includes("[")) return { frontSentence: trimmed, backSentence: trimmed };
  return {
    frontSentence: trimmed.replace(/\[(.*?)\]/g, "<u>_____</u>"),
    backSentence: trimmed.replace(/\[(.*?)\]/g, "<u><b>$1</b></u>"),
  };
}

interface NormalizedCard {
  uid: string;
  deck: string;
  frontEn: string;
  frontSentence: string;
  backDe: string;
  backSentence: string;
  notes: string;
  tags: string[];
}

function extractCards(deckName: string, item: VocabItem, categoryTag?: string): NormalizedCard[] {
  const baseId = slugify(item.de);
  const tags = [...(item.tags || [])];
  if (categoryTag && !tags.includes(categoryTag)) tags.push(categoryTag);

  // If cards are omitted or empty, generate a single base card at slot 0
  if (!item.cards || item.cards.length === 0) {
    return [
      {
        uid: `${deckName}::${baseId}::0`,
        deck: deckName,
        frontEn: item.en,
        frontSentence: "",
        backDe: item.de,
        backSentence: "",
        notes: item.notes || "",
        tags,
      },
    ];
  }

  return item.cards.map((entry: CardEntry, index: number) => {
    const isString = typeof entry === "string";
    const subId = String(index);
    const sentence = isString ? entry : entry.sentence;
    const cardNotes = isString ? "" : (entry.notes || "");
    const combinedNotes = [item.notes, cardNotes].filter(Boolean).join(" | ");
    const { frontSentence, backSentence } = parseSentence(sentence);

    return {
      uid: `${deckName}::${baseId}::${subId}`,
      deck: deckName,
      frontEn: item.en,
      frontSentence,
      backDe: item.de,
      backSentence,
      notes: combinedNotes,
      tags,
    };
  });
}

interface SyncResult {
  status: "created" | "updated" | "unchanged";
  diffs?: string[];
}

async function syncCard(card: NormalizedCard): Promise<SyncResult> {
  const existing: number[] = await ankiConnect("findNotes", {
    query: `note:${MODEL_NAME} "UID:${card.uid}"`,
  });

  const fields = {
    UID: card.uid,
    FrontEn: card.frontEn,
    FrontSentence: card.frontSentence,
    BackDe: card.backDe,
    BackSentence: card.backSentence,
    Notes: card.notes,
  };

  if (existing.length === 0) {
    await ankiConnect("addNote", {
      note: {
        deckName: card.deck,
        modelName: MODEL_NAME,
        fields,
        tags: card.tags,
        options: { allowDuplicate: false, duplicateScope: "deck" },
      },
    });
    return { status: "created" };
  }

  const noteId = existing[0];
  const info = await ankiConnect("notesInfo", { notes: [noteId] });
  if (!info || info.length === 0) return { status: "unchanged" };

  const cur = info[0].fields;
  const diffs: string[] = [];

  if (cur.FrontEn.value !== fields.FrontEn) {
    diffs.push(`FrontEn: "${cur.FrontEn.value}" -> "${fields.FrontEn}"`);
  }
  if (cur.FrontSentence.value !== fields.FrontSentence) {
    diffs.push(`FrontSentence: "${cur.FrontSentence.value}" -> "${fields.FrontSentence}"`);
  }
  if (cur.BackDe.value !== fields.BackDe) {
    diffs.push(`BackDe: "${cur.BackDe.value}" -> "${fields.BackDe}"`);
  }
  if (cur.BackSentence.value !== fields.BackSentence) {
    diffs.push(`BackSentence: "${cur.BackSentence.value}" -> "${fields.BackSentence}"`);
  }
  if (cur.Notes.value !== fields.Notes) {
    diffs.push(`Notes: "${cur.Notes.value}" -> "${fields.Notes}"`);
  }

  if (diffs.length > 0) {
    await ankiConnect("updateNoteFields", { note: { id: noteId, fields } });
    if (card.tags.length > 0) {
      await ankiConnect("addTags", { notes: [noteId], tags: card.tags.join(" ") });
    }
    return { status: "updated", diffs };
  }

  return { status: "unchanged" };
}

async function loadModule(filePath: string): Promise<{ deckName: string; cards: NormalizedCard[] }> {
  const mod = await import(pathToFileURL(filePath).href);
  const data = mod.default || mod;
  const deckName = (typeof data.deck === "string" ? data.deck : mod.deck) || "Deutsch";
  const cards: NormalizedCard[] = [];

  // Case 1: File exports an array directly (e.g. export default [...])
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && item.de && item.en) {
        cards.push(...extractCards(deckName, item));
      }
    }
    return { deckName, cards };
  }

  // Case 2: Named exports or object keys (e.g. export const phrases = [...], export const food = [...])
  const combined = { ...mod, ...(typeof data === "object" ? data : {}) };
  for (const [key, value] of Object.entries(combined)) {
    if (key === "deck" || key === "default" || !Array.isArray(value)) continue;

    // Auto-tag with singularized key name (e.g. "nouns" -> "noun", "verbs" -> "verb", "slang" -> "slang")
    const tag = key.endsWith("s") && key.length > 3 ? key.slice(0, -1) : key;

    for (const item of value) {
      if (item && item.de && item.en) {
        cards.push(...extractCards(deckName, item, tag));
      }
    }
  }

  return { deckName, cards };
}

async function main() {
  console.log("⚡ Connecting to AnkiConnect...");
  const version = await ankiConnect("version");
  console.log(`✓ Connected to AnkiConnect v${version}`);

  await ensureModelExists();

  const dataDir = join(process.cwd(), "data");
  const files = (await readdir(dataDir)).filter((f) => f.endsWith(".ts"));

  if (files.length === 0) {
    console.log(`No .ts files found in ${dataDir}.`);
    return;
  }

  const seenUids = new Map<string, string>(); // uid -> filePath

  for (const file of files) {
    const fullPath = join(dataDir, file);
    const { deckName, cards } = await loadModule(fullPath);
    await ankiConnect("createDeck", { deck: deckName });

    console.log(`\n📂 ${file} -> "${deckName}" (${cards.length} cards)`);
    let [created, updated, unchanged] = [0, 0, 0];

    for (const card of cards) {
      if (seenUids.has(card.uid)) {
        console.warn(`  ⚠️ Duplicate UID detected: [${card.uid}]`);
        console.warn(`     First defined in: ${seenUids.get(card.uid)}`);
        console.warn(`     Skipping duplicate in: ${file}`);
        continue;
      }
      seenUids.set(card.uid, file);

      try {
        const res = await syncCard(card);
        if (res.status === "created") {
          created++;
          console.log(`  + Created: ${card.backDe} [${card.uid.split("::").slice(1).join("::")}]`);
        } else if (res.status === "updated") {
          updated++;
          console.log(`  ~ Updated: ${card.backDe} [${card.uid.split("::").slice(1).join("::")}]`);
          if (res.diffs && res.diffs.length > 0) {
            for (const diff of res.diffs) {
              console.log(`     • ${diff}`);
            }
          }
        } else {
          unchanged++;
        }
      } catch (err: any) {
        console.error(`  ✕ Error syncing [${card.uid}]: ${err.message}`);
      }
    }

    console.log(`  ${created} created | ${updated} updated | ${unchanged} unchanged`);
  }

  console.log("\n✨ Sync complete!");
}

main().catch((err) => {
  console.error("\n✕ Sync failed:", err.message);
  process.exit(1);
});
