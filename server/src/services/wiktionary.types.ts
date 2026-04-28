export type WiktionaryEntry = {
  word: string;
  language: string;
  etymology?: string;
  pronunciations: string[];
  forms: string[];
  alternativeForms: string[];
  senses: Array<{
    pos: string;
    definition: string;
    labels: string[];
  }>;
  synonyms: string[];
  hypernyms: string[];
  hyponyms: string[];
  meronyms: string[];
  holonyms: string[];
  derivedTerms: string[];
  relatedTerms: string[];
  descendants: string[];
  seeAlso: string[];
  sourceUrl: string;
};
