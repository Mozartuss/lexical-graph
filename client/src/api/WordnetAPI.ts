import axios from 'axios';
import {
  LemmaPosToHierarchy,
  LemmaSuggestion,
  LemmaToDefinition,
  RelationType,
  WiktionaryEntry,
} from './types';

axios.defaults.baseURL = import.meta.env.BASE_URL;

export default class WordnetAPI {
  public static RELATION_TYPES: RelationType[] = [
    'synonym',
    'antonym',
    'hypernym',
    'hyponym',
    'holonym',
    'meronym',
    'attribute',
    'entailment',
    'cause',
  ];

  public static colors: Record<RelationType, string> = {
    antonym: '#d95f02',
    attribute: '#a6761d',
    cause: '#1b9e77',
    entailment: '#666666',
    holonym: '#66a61e',
    hypernym: '#7570b3',
    hyponym: '#e7298a',
    meronym: '#e6ab02',
    synonym: '#1b9e77',
  };

  public static posMap = {
    a: 'adjective',
    n: 'noun',
    v: 'verb',
    r: 'adverb',
    s: 'adjective',
  } as const;

  public static async getDefinitions(word: string): Promise<LemmaToDefinition> {
    const { data } = await axios.get<LemmaToDefinition>(`api/wordnet/lemma/${word}`);
    return data;
  }

  public static async getSuggestions(query: string): Promise<LemmaSuggestion[]> {
    const { data } = await axios.get<LemmaSuggestion[]>('api/wordnet/lemma/suggest', {
      params: { q: query, limit: 12 },
    });
    return data;
  }

  public static async getRelations(word: string): Promise<LemmaPosToHierarchy> {
    const { data } = await axios.get<LemmaPosToHierarchy>(`api/wordnet/synset/${word}`);
    return data;
  }

  public static async getWiktionaryEntry(word: string): Promise<WiktionaryEntry | null> {
    const { data } = await axios.get<WiktionaryEntry | null>(`api/wiktionary/${word}`);
    return data;
  }
}
