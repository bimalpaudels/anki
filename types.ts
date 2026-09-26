export type CardEntry = string | { sentence: string; notes?: string };

export interface VocabItem {
  de: string;
  en: string;
  notes?: string;
  tags?: string[];
  cards?: CardEntry[];
}
