export const ALLOWED_TAGS = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "phrase",
  "idiom",
] as const;

export type Tag = (typeof ALLOWED_TAGS)[number];

export type CardEntry = string | { sentence: string; notes?: string };

export interface VocabItem {
  de: string;
  en: string;
  notes?: string;
  tags?: Tag[];
  cards?: CardEntry[];
}
