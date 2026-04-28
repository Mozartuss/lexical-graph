import { SimulationLinkDatum, SimulationNodeDatum } from 'd3';
// Lemma API
export type POS = 'a' | 'n' | 'r' | 'v' | 's';
export type LemmaSuggestion = { lemma: string; pos: POS; synsetCount: number };
export type SynsetDefinition = { gloss: string; examples?: string[]; terms: string[] };
export type PosToGlosses = Record<POS, SynsetDefinition[]>;
export type LemmaToDefinition = Record<string, PosToGlosses>;
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

// Synset API
export type RelationType =
  'synonym'
  | 'antonym'
  | 'hypernym'
  | 'hyponym'
  | 'meronym'
  | 'holonym'
  | 'entailment'
  | 'attribute'
  | 'cause';

// Formatted graph types
export interface GraphNode extends SimulationNodeDatum {
  id: string;
  group: string;
  label?: string;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string;
  target: string;
  label?: string;
}

export type GraphData = { nodes: GraphNode[]; links: GraphLink[]; labelledLinks: GraphLink[] };
export type TypeToEdges = { [type in RelationType | string]: GraphData };

// Formatted hierarchy types
export type HierarchyNode = {
  label: string;
  type?: string;
  children?: HierarchyNode[];
};
export type TypeToHierarchy = { [type in RelationType | string]: HierarchyNode };
export type LemmaPosToHierarchy = Record<string, TypeToHierarchy>;
