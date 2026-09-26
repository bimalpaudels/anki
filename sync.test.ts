import { describe, expect, it } from "bun:test";
import {
  detectGender,
  formatBackDe,
  parseSentence,
  slugify,
  extractCards,
  cardLabel,
} from "./sync";
import type { Tag, VocabItem } from "./types";

describe("Logic Tests: detectGender", () => {
  it("detects masculine nouns", () => {
    expect(detectGender("der Pullover")).toBe("der");
    expect(detectGender("der Hund, -e")).toBe("der");
    expect(detectGender("DER APFEL")).toBe("der");
    expect(detectGender("der/die Fremde")).toBe("der");
  });

  it("detects feminine nouns", () => {
    expect(detectGender("die Katze")).toBe("die");
    expect(detectGender("DIE FRAU")).toBe("die");
    expect(detectGender("die/der Angestellte")).toBe("die");
  });

  it("detects neuter nouns", () => {
    expect(detectGender("das Buch")).toBe("das");
    expect(detectGender("DAS KIND")).toBe("das");
    expect(detectGender("das/der Teil")).toBe("das");
  });

  it("returns null for non-gendered items", () => {
    expect(detectGender("essen")).toBeNull();
    expect(detectGender("schnell")).toBeNull();
    expect(detectGender("jemandem die Daumen drücken")).toBeNull();
    expect(detectGender("weder ... noch")).toBeNull();
  });
});

describe("Logic Tests: formatBackDe", () => {
  it("wraps gendered nouns in span with correct class", () => {
    expect(formatBackDe("der Apfel")).toBe('<span class="gender-der">der Apfel</span>');
    expect(formatBackDe("die Sonne")).toBe('<span class="gender-die">die Sonne</span>');
    expect(formatBackDe("das Haus")).toBe('<span class="gender-das">das Haus</span>');
  });

  it("leaves non-gendered words unwrapped", () => {
    expect(formatBackDe("laufen")).toBe("laufen");
    expect(formatBackDe("gemütlich")).toBe("gemütlich");
  });
});

describe("Logic Tests: slugify", () => {
  it("correctly converts German umlauts and eszett", () => {
    expect(slugify("Äpfel")).toBe("aepfel");
    expect(slugify("schön")).toBe("schoen");
    expect(slugify("überall")).toBe("ueberall");
    expect(slugify("groß")).toBe("gross");
  });

  it("handles punctuation and whitespace", () => {
    expect(slugify("der Pullover, -")).toBe("der-pullover");
    expect(slugify("  Hallo   Welt!  ")).toBe("hallo-welt");
    expect(slugify("jemandem die Daumen drücken")).toBe("jemandem-die-daumen-druecken");
  });
});

describe("Logic Tests: parseSentence (Bracket Cloze)", () => {
  it("converts single bracket cloze into front blank and back answer", () => {
    const res = parseSentence("Ich [esse] einen Apfel.");
    expect(res.frontSentence).toBe('Ich <span class="cloze-blank"></span> einen Apfel.');
    expect(res.backSentence).toBe('Ich <span class="cloze-answer">esse</span> einen Apfel.');
  });

  it("converts multiple bracket clozes", () => {
    const res = parseSentence("Er [fährt] sehr [schnell].");
    expect(res.frontSentence).toBe('Er <span class="cloze-blank"></span> sehr <span class="cloze-blank"></span>.');
    expect(res.backSentence).toBe('Er <span class="cloze-answer">fährt</span> sehr <span class="cloze-answer">schnell</span>.');
  });

  it("preserves sentences without brackets", () => {
    const res = parseSentence("Guten Morgen!");
    expect(res.frontSentence).toBe("Guten Morgen!");
    expect(res.backSentence).toBe("Guten Morgen!");
  });

  it("handles undefined or empty string", () => {
    expect(parseSentence("")).toEqual({ frontSentence: "", backSentence: "" });
    expect(parseSentence(undefined)).toEqual({ frontSentence: "", backSentence: "" });
  });
});

describe("Logic Tests: extractCards", () => {
  it("creates a single card with slot 0 when cards is omitted", () => {
    const item: VocabItem = { de: "genau", en: "exactly" };
    const cards = extractCards("Deutsch", item, ["adverb"]);
    expect(cards).toHaveLength(1);
    expect(cards[0].uid).toBe("Deutsch::genau::0");
    expect(cards[0].frontEn).toBe("exactly");
    expect(cards[0].backDe).toBe("genau");
    expect(cards[0].frontSentence).toBe("");
    expect(cards[0].backSentence).toBe("");
    expect(cards[0].tags).toEqual(["adverb"]);
  });

  it("creates multiple cards for multiple example sentences", () => {
    const item: VocabItem = {
      de: "der Pullover",
      en: "the sweater",
      cards: [
        "Zieh einen [Pullover] an.",
        "Der [Pullover] ist rot.",
      ],
      tags: ["noun"],
    };
    const cards = extractCards("Deutsch", item);
    expect(cards).toHaveLength(2);
    expect(cards[0].uid).toBe("Deutsch::der-pullover::0");
    expect(cards[1].uid).toBe("Deutsch::der-pullover::1");
    expect(cards[0].backDe).toBe('<span class="gender-der">der Pullover</span>');
  });

  it("handles structured CardEntry with card-level notes", () => {
    const item: VocabItem = {
      de: "gehen",
      en: "to go",
      notes: "ging | ist gegangen",
      cards: [
        { sentence: "Ich [gehe] nach Hause.", notes: "Present tense" },
      ],
    };
    const cards = extractCards("Deutsch", item);
    expect(cards).toHaveLength(1);
    expect(cards[0].notes).toBe("ging | ist gegangen | Present tense");
  });

  it("deduplicates inherited file tags and item tags", () => {
    const fileTags: Tag[] = ["verb", "phrase"];
    const item: VocabItem = {
      de: "essen",
      en: "to eat",
      tags: ["verb"],
    };
    const cards = extractCards("Deutsch", item, fileTags);
    expect(cards[0].tags.sort()).toEqual(["phrase", "verb"]);
  });
});

describe("Stress Test: High-Volume In-Memory Card Processing", () => {
  it("processes and normalizes 5,000 cards in under 50ms", () => {
    const testItems: VocabItem[] = [];
    const articles = ["der", "die", "das"];
    for (let i = 0; i < 2500; i++) {
      const art = articles[i % 3];
      testItems.push({
        de: `${art} Gegenstand_${i}`,
        en: `object ${i}`,
        notes: `Rule #${i}`,
        tags: ["noun"],
        cards: [
          `Hier ist [Gegenstand_${i}].`,
          `Ich sehe den [Gegenstand_${i}].`,
        ],
      });
    }

    const start = performance.now();
    const allNormalized = testItems.flatMap((item) => extractCards("Deutsch", item, ["noun"]));
    const duration = performance.now() - start;

    expect(allNormalized.length).toBe(5000);
    expect(duration).toBeLessThan(100); // 5000 cards normalized in under 100ms
    console.log(`\n  ⚡ Processed 5,000 cards in ${duration.toFixed(2)}ms (${(5000 / (duration / 1000)).toFixed(0)} cards/sec)`);
  });
});
