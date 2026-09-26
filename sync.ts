import type { CardEntry, VocabItem } from "./types";

const ANKI_CONNECT_URL = process.env.ANKI_CONNECT_URL || "http://127.0.0.1:8765";
const MODEL_NAME = "GermanCard";
const MODEL_FIELDS = ["UID", "FrontEn", "FrontSentence", "BackDe", "BackSentence", "Notes"];

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
  const css = await Bun.file("./templates/card.css").text();
  const front = await Bun.file("./templates/front.html").text();
  const back = await Bun.file("./templates/back.html").text();
  const cardTemplates = [{ Name: "German Card", Front: front.trim(), Back: back.trim() }];

  const models: string[] = await ankiConnect("modelNames");
  if (!models.includes(MODEL_NAME)) {
    await ankiConnect("createModel", {
      modelName: MODEL_NAME,
      inOrderFields: MODEL_FIELDS,
      css,
      cardTemplates,
    });
    console.log(`✓ Created Note Type "${MODEL_NAME}"`);
  } else {
    try {
      await ankiConnect("updateModelTemplates", {
        model: {
          name: MODEL_NAME,
          templates: {
            "German Card": {
              Front: cardTemplates[0].Front,
              Back: cardTemplates[0].Back,
            },
          },
        },
      });
      await ankiConnect("updateModelStyling", {
        model: { name: MODEL_NAME, css },
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

const cardLabel = (uid: string) => uid.split("::").slice(1).join("::");

function extractCards(deckName: string, item: VocabItem, categoryTag?: string): NormalizedCard[] {
  const baseId = slugify(item.de);
  const tags = categoryTag ? [...(item.tags || []), categoryTag] : [...(item.tags || [])];
  const entries = item.cards?.length ? item.cards : [""];

  return entries.map((entry: CardEntry, index: number) => {
    const isString = typeof entry === "string";
    const sentence = isString ? entry : entry.sentence;
    const cardNotes = isString ? "" : (entry.notes || "");
    const { frontSentence, backSentence } = parseSentence(sentence);

    return {
      uid: `${deckName}::${baseId}::${index}`,
      deck: deckName,
      frontEn: item.en,
      frontSentence,
      backDe: item.de,
      backSentence,
      notes: [item.notes, cardNotes].filter(Boolean).join(" | "),
      tags,
    };
  });
}

interface ExistingNote {
  id: number;
  fields: Record<string, { value: string; order: number }>;
}

interface SyncResult {
  status: "created" | "updated" | "unchanged";
  diffs?: string[];
}

async function syncCard(
  card: NormalizedCard,
  existingMap: Map<string, ExistingNote>
): Promise<SyncResult> {
  const fields = {
    UID: card.uid,
    FrontEn: card.frontEn,
    FrontSentence: card.frontSentence,
    BackDe: card.backDe,
    BackSentence: card.backSentence,
    Notes: card.notes,
  };

  const existing = existingMap.get(card.uid);

  if (!existing) {
    const newNoteId = await ankiConnect("addNote", {
      note: {
        deckName: card.deck,
        modelName: MODEL_NAME,
        fields,
        tags: card.tags,
        options: { allowDuplicate: false, duplicateScope: "deck" },
      },
    });
    existingMap.set(card.uid, {
      id: newNoteId,
      fields: Object.fromEntries(Object.entries(fields).map(([k, v], i) => [k, { value: v, order: i }])),
    });
    return { status: "created" };
  }

  const cur = existing.fields;
  const diffs: string[] = [];

  if (cur.FrontEn?.value !== fields.FrontEn) {
    diffs.push(`FrontEn: "${cur.FrontEn?.value ?? ""}" -> "${fields.FrontEn}"`);
  }
  if (cur.FrontSentence?.value !== fields.FrontSentence) {
    diffs.push(`FrontSentence: "${cur.FrontSentence?.value ?? ""}" -> "${fields.FrontSentence}"`);
  }
  if (cur.BackDe?.value !== fields.BackDe) {
    diffs.push(`BackDe: "${cur.BackDe?.value ?? ""}" -> "${fields.BackDe}"`);
  }
  if (cur.BackSentence?.value !== fields.BackSentence) {
    diffs.push(`BackSentence: "${cur.BackSentence?.value ?? ""}" -> "${fields.BackSentence}"`);
  }
  if (cur.Notes?.value !== fields.Notes) {
    diffs.push(`Notes: "${cur.Notes?.value ?? ""}" -> "${fields.Notes}"`);
  }

  if (diffs.length > 0) {
    await ankiConnect("updateNoteFields", { note: { id: existing.id, fields } });
    if (card.tags.length > 0) {
      await ankiConnect("addTags", { notes: [existing.id], tags: card.tags.join(" ") });
    }
    for (const [k, v] of Object.entries(fields)) {
      if (cur[k]) cur[k].value = v;
    }
    return { status: "updated", diffs };
  }

  return { status: "unchanged" };
}

async function loadModule(file: string): Promise<{ deckName: string; cards: NormalizedCard[] }> {
  const mod = await import(`./data/${file}`);
  const data = mod.default || mod;
  const deckName = (typeof data.deck === "string" ? data.deck : mod.deck) || "Deutsch";

  const groups: Array<[string | undefined, any[]]> = Array.isArray(data)
    ? [[undefined, data]]
    : Object.entries({ ...mod, ...data })
        .filter(([k, v]) => k !== "deck" && k !== "default" && Array.isArray(v))
        .map(([k, v]) => [k.endsWith("s") && k.length > 3 ? k.slice(0, -1) : k, v as any[]]);

  const cards: NormalizedCard[] = [];
  for (const [tag, items] of groups) {
    for (const item of items) {
      if (item?.de && item?.en) cards.push(...extractCards(deckName, item, tag));
    }
  }

  return { deckName, cards };
}

async function main() {
  console.log("⚡ Connecting to AnkiConnect...");
  const version = await ankiConnect("version");
  console.log(`✓ Connected to AnkiConnect v${version}`);

  await ensureModelExists();

  // Batch pre-fetch all existing GermanCard notes in 2 requests for instant in-memory sync
  const allIds: number[] = await ankiConnect("findNotes", { query: `note:${MODEL_NAME}` });
  const allNotes: any[] = allIds.length > 0 ? await ankiConnect("notesInfo", { notes: allIds }) : [];
  const existingMap = new Map<string, ExistingNote>(
    allNotes
      .filter((n) => n?.fields?.UID?.value)
      .map((n) => [n.fields.UID.value, { id: n.noteId, fields: n.fields }])
  );

  const files = Array.from(new Bun.Glob("*.ts").scanSync("data"));

  if (files.length === 0) {
    console.log("No .ts files found in data/.");
    return;
  }

  const seenUids = new Map<string, string>(); // uid -> filePath

  for (const file of files) {
    const { deckName, cards } = await loadModule(file);
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
        const res = await syncCard(card, existingMap);
        if (res.status === "created") {
          created++;
          console.log(`  + Created: ${card.backDe} [${cardLabel(card.uid)}]`);
        } else if (res.status === "updated") {
          updated++;
          console.log(`  ~ Updated: ${card.backDe} [${cardLabel(card.uid)}]`);
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
