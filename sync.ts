import type { CardEntry, Tag, VocabItem } from "./types";

const ANKI_CONNECT_URL = Bun.env.ANKI_CONNECT_URL || "http://127.0.0.1:8765";
const MODEL_NAME = "GermanCard";
const MODEL_FIELDS = ["UID", "FrontEn", "FrontSentence", "BackDe", "BackSentence", "Notes"];
const BATCH_SIZE = 100;

interface NormalizedCard {
  uid: string;
  deck: string;
  frontEn: string;
  frontSentence: string;
  rawDe: string;
  backDe: string;
  backSentence: string;
  notes: string;
  tags: Tag[];
}

interface ExistingNote {
  id: number;
  fields: Record<string, { value: string; order: number }>;
  tags: string[];
}

interface CardPlan {
  card: NormalizedCard;
  fields: Record<string, string>;
  status: "created" | "updated" | "unchanged" | "skipped";
  diffs?: string[];
  existingNote?: ExistingNote;
  fieldsChanged?: boolean;
  toRemoveTags?: string[];
  toAddTags?: string[];
  error?: string;
}

interface LoadedFile {
  file: string;
  deckName: string;
  cards: NormalizedCard[];
}

const cardLabel = (uid: string) => uid.split("::").slice(1).join("::");

async function ankiConnect<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not connect to Anki at ${ANKI_CONNECT_URL} (${msg})`);
  }

  const result = (await res.json()) as { error: string | null; result: T };
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
    console.log(`Created note type "${MODEL_NAME}"`);
  } else {
    try {
      // Check if templates or styling have actually changed before issuing updates
      const currentTemplates = await ankiConnect<Record<string, { Front: string; Back: string }>>("modelTemplates", {
        modelName: MODEL_NAME,
      });
      const currentStyling = await ankiConnect<{ css: string }>("modelStyling", {
        modelName: MODEL_NAME,
      });

      const templateNeedsUpdate =
        !currentTemplates["German Card"] ||
        currentTemplates["German Card"].Front.trim() !== cardTemplates[0].Front ||
        currentTemplates["German Card"].Back.trim() !== cardTemplates[0].Back;

      const stylingNeedsUpdate = currentStyling.css.trim() !== css.trim();

      if (templateNeedsUpdate) {
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
        console.log(`Updated model templates for "${MODEL_NAME}"`);
      }

      if (stylingNeedsUpdate) {
        await ankiConnect("updateModelStyling", {
          model: { name: MODEL_NAME, css },
        });
        console.log(`Updated model styling for "${MODEL_NAME}"`);
      }
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

function detectGender(de: string): "der" | "die" | "das" | null {
  const t = de.trim().toLowerCase();
  if (t.startsWith("der ") || t.startsWith("der/")) return "der";
  if (t.startsWith("die ") || t.startsWith("die/")) return "die";
  if (t.startsWith("das ") || t.startsWith("das/")) return "das";
  return null;
}

function formatBackDe(de: string): string {
  const gender = detectGender(de);
  if (!gender) return de;
  return `<span class="gender-${gender}">${de}</span>`;
}

function parseSentence(raw?: string): { frontSentence: string; backSentence: string } {
  if (!raw) return { frontSentence: "", backSentence: "" };
  const trimmed = raw.trim();
  if (!trimmed.includes("[")) return { frontSentence: trimmed, backSentence: trimmed };
  return {
    frontSentence: trimmed.replace(/\[(.*?)\]/g, '<span class="cloze-blank"></span>'),
    backSentence: trimmed.replace(/\[(.*?)\]/g, '<span class="cloze-answer">$1</span>'),
  };
}

function extractCards(deckName: string, item: VocabItem, fileTags: Tag[] = []): NormalizedCard[] {
  const baseId = slugify(item.de);
  const tagSet = new Set<Tag>([...fileTags, ...(item.tags || [])]);
  const tags = Array.from(tagSet);
  const entries = item.cards?.length ? item.cards : [""];
  const formattedDe = formatBackDe(item.de);

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
      rawDe: item.de,
      backDe: formattedDe,
      backSentence,
      notes: [item.notes, cardNotes].filter(Boolean).join(" | "),
      tags,
    };
  });
}

async function loadModule(file: string): Promise<{ deckName: string; cards: NormalizedCard[] }> {
  const mod = await import(`./data/${file}`);
  const data = mod.default || mod;
  const deckName = (typeof data.deck === "string" ? data.deck : mod.deck) || "Deutsch";
  const fileTags: Tag[] = Array.isArray(data.tags) ? data.tags : Array.isArray(mod.tags) ? mod.tags : [];

  const items: VocabItem[] = [];
  if (Array.isArray(data)) {
    items.push(...data);
  } else {
    for (const [k, v] of Object.entries({ ...mod, ...data })) {
      if (k !== "deck" && k !== "default" && k !== "tags" && Array.isArray(v)) {
        items.push(...(v as VocabItem[]));
      }
    }
  }

  const cards: NormalizedCard[] = [];
  for (const item of items) {
    if (item?.de && item?.en) {
      cards.push(...extractCards(deckName, item, fileTags));
    }
  }

  return { deckName, cards };
}

async function main() {
  console.log("Connecting to AnkiConnect...");
  const version = await ankiConnect("version");
  console.log(`Connected to AnkiConnect v${version}`);

  await ensureModelExists();

  // Batch pre-fetch all existing GermanCard notes in 2 requests for instant in-memory sync
  const allIds = await ankiConnect<number[]>("findNotes", { query: `note:${MODEL_NAME}` });
  const allNotes = allIds.length > 0 ? await ankiConnect<any[]>("notesInfo", { notes: allIds }) : [];
  const existingMap = new Map<string, ExistingNote>(
    allNotes
      .filter((n) => n?.fields?.UID?.value)
      .map((n) => [n.fields.UID.value, { id: n.noteId, fields: n.fields, tags: n.tags || [] }])
  );

  const files = Array.from(new Bun.Glob("*.ts").scanSync("data"));

  if (files.length === 0) {
    console.log("No .ts files found in data/.");
    return;
  }

  // Asynchronously load all files concurrently
  const loadedFiles: LoadedFile[] = await Promise.all(
    files.map(async (file) => {
      const { deckName, cards } = await loadModule(file);
      return { file, deckName, cards };
    })
  );

  // Batch deck creation: ensure unique decks exist once upfront
  const uniqueDecks = Array.from(new Set(loadedFiles.map((f) => f.deckName)));
  for (const deck of uniqueDecks) {
    await ankiConnect("createDeck", { deck });
  }

  const seenUids = new Map<string, string>(); // uid -> filePath
  const filePlans = new Map<string, CardPlan[]>();
  const toCreate: CardPlan[] = [];
  const toUpdate: CardPlan[] = [];

  // In-memory reconciliation and diff planning across all cards
  for (const { file, cards } of loadedFiles) {
    const plans: CardPlan[] = [];

    for (const card of cards) {
      if (seenUids.has(card.uid)) {
        console.warn(`  [warn] Duplicate UID detected: [${card.uid}]`);
        console.warn(`         First defined in: ${seenUids.get(card.uid)}`);
        console.warn(`         Skipping duplicate in: ${file}`);
        plans.push({ card, fields: {}, status: "skipped" });
        continue;
      }
      seenUids.set(card.uid, file);

      const fields: Record<string, string> = {
        UID: card.uid,
        FrontEn: card.frontEn,
        FrontSentence: card.frontSentence,
        BackDe: card.backDe,
        BackSentence: card.backSentence,
        Notes: card.notes,
      };

      const existing = existingMap.get(card.uid);

      if (!existing) {
        const plan: CardPlan = { card, fields, status: "created" };
        plans.push(plan);
        toCreate.push(plan);
        continue;
      }

      // Check fields differences
      const cur = existing.fields;
      const diffs: string[] = [];
      let fieldsChanged = false;

      for (const [key, value] of Object.entries(fields)) {
        if (key === "UID") continue;
        const currentVal = cur[key]?.value ?? "";
        if (currentVal !== value) {
          diffs.push(`${key}: "${currentVal}" -> "${value}"`);
          fieldsChanged = true;
        }
      }

      // Check tag differences (case-insensitive because Anki treats tags as case-insensitive)
      const existingTags = existing.tags || [];
      const curTagSet = new Set(existingTags.map((t) => t.toLowerCase()));
      const newTagSet = new Set(card.tags.map((t) => t.toLowerCase()));

      const curTagStr = [...curTagSet].sort().join(" ");
      const newTagStr = [...newTagSet].sort().join(" ");
      const tagsChanged = curTagStr !== newTagStr;

      let toRemoveTags: string[] = [];
      let toAddTags: string[] = [];

      if (tagsChanged) {
        diffs.push(`Tags: [${[...existingTags].sort().join(" ")}] -> [${[...card.tags].sort().join(" ")}]`);
        toRemoveTags = existingTags.filter((t) => !newTagSet.has(t.toLowerCase()));
        toAddTags = card.tags.filter((t) => !curTagSet.has(t.toLowerCase()));
      }

      if (diffs.length > 0) {
        const plan: CardPlan = {
          card,
          fields,
          status: "updated",
          diffs,
          existingNote: existing,
          fieldsChanged,
          toRemoveTags,
          toAddTags,
        };
        plans.push(plan);
        toUpdate.push(plan);
      } else {
        plans.push({ card, fields, status: "unchanged" });
      }
    }

    filePlans.set(file, plans);
  }

  // 1. Batch creation with addNotes
  if (toCreate.length > 0) {
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const chunk = toCreate.slice(i, i + BATCH_SIZE);
      const notePayloads = chunk.map((plan) => ({
        deckName: plan.card.deck,
        modelName: MODEL_NAME,
        fields: plan.fields,
        tags: plan.card.tags,
        options: { allowDuplicate: false, duplicateScope: "deck" },
      }));

      try {
        const newIds = await ankiConnect<(number | null)[]>("addNotes", { notes: notePayloads });
        for (let j = 0; j < chunk.length; j++) {
          const id = newIds[j];
          const plan = chunk[j];
          if (id) {
            existingMap.set(plan.card.uid, {
              id,
              fields: Object.fromEntries(Object.entries(plan.fields).map(([k, v], idx) => [k, { value: v, order: idx }])),
              tags: [...plan.card.tags],
            });
          } else {
            plan.error = "AnkiConnect rejected card creation (possible duplicate in deck).";
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        for (const plan of chunk) {
          plan.error = msg;
        }
      }
    }
  }

  // 2. Batch updates with AnkiConnect multi action
  if (toUpdate.length > 0) {
    const updateActions: { action: string; params: Record<string, unknown> }[] = [];
    for (const plan of toUpdate) {
      if (!plan.existingNote) continue;
      const noteId = plan.existingNote.id;

      if (plan.fieldsChanged) {
        updateActions.push({
          action: "updateNoteFields",
          params: { note: { id: noteId, fields: plan.fields } },
        });
      }

      if (plan.toRemoveTags && plan.toRemoveTags.length > 0) {
        updateActions.push({
          action: "removeTags",
          params: { notes: [noteId], tags: plan.toRemoveTags.join(" ") },
        });
      }

      if (plan.toAddTags && plan.toAddTags.length > 0) {
        updateActions.push({
          action: "addTags",
          params: { notes: [noteId], tags: plan.toAddTags.join(" ") },
        });
      }
    }

    for (let i = 0; i < updateActions.length; i += BATCH_SIZE) {
      const chunk = updateActions.slice(i, i + BATCH_SIZE);
      try {
        await ankiConnect("multi", { actions: chunk });
      } catch (err) {
        console.error(`  [error] Batch update failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 3. Print clean summary per file
  let [totalCreated, totalUpdated, totalUnchanged] = [0, 0, 0];

  for (const { file, deckName, cards } of loadedFiles) {
    console.log(`\n${file} -> "${deckName}" (${cards.length} cards)`);
    const plans = filePlans.get(file) || [];
    let [created, updated, unchanged] = [0, 0, 0];

    for (const plan of plans) {
      if (plan.status === "skipped") continue;

      if (plan.error) {
        console.error(`  [error] Error syncing [${plan.card.uid}]: ${plan.error}`);
        continue;
      }

      if (plan.status === "created") {
        created++;
        console.log(`  + Created: ${plan.card.rawDe} [${cardLabel(plan.card.uid)}]`);
      } else if (plan.status === "updated") {
        updated++;
        console.log(`  ~ Updated: ${plan.card.rawDe} [${cardLabel(plan.card.uid)}]`);
        if (plan.diffs && plan.diffs.length > 0) {
          for (const diff of plan.diffs) {
            console.log(`     - ${diff}`);
          }
        }
      } else {
        unchanged++;
      }
    }

    totalCreated += created;
    totalUpdated += updated;
    totalUnchanged += unchanged;
    console.log(`  ${created} created | ${updated} updated | ${unchanged} unchanged`);
  }

  const deckSummary = uniqueDecks.length === 1 ? "1 deck" : `${uniqueDecks.length} decks`;
  console.log(`\nSync complete: ${totalCreated} created | ${totalUpdated} updated | ${totalUnchanged} unchanged across ${deckSummary}.`);
}

export {
  slugify,
  detectGender,
  formatBackDe,
  parseSentence,
  extractCards,
  cardLabel,
  BATCH_SIZE,
  main,
};

if (import.meta.main) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("\nSync failed:", msg);
    process.exit(1);
  });
}
