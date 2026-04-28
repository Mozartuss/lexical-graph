import { Request, Response } from 'express';
import WiktionaryCache from '../models/wiktionary-cache.model';
import { replaceSpaces } from '../util/string.util';
import { WiktionaryEntry } from './wiktionary.types';

type WikimediaExtractPage = {
  extract?: string;
  missing?: boolean;
  title?: string;
};

type WikimediaExtractResponse = {
  query?: {
    pages?: WikimediaExtractPage[];
  };
};

const POS_HEADINGS = new Set([
  'Adjective',
  'Adverb',
  'Conjunction',
  'Determiner',
  'Interjection',
  'Noun',
  'Numeral',
  'Particle',
  'Phrase',
  'Preposition',
  'Pronoun',
  'Proper noun',
  'Verb',
]);

const LIST_SECTIONS = new Set([
  'Derived terms',
  'Related terms',
  'Descendants',
  'See also',
]);

const INLINE_RELATION_PREFIX = /^(coordinate terms|derived terms|descendants|holonyms|homophones|hypernyms|hyponyms|meronyms|related terms|rhymes|see also|synonyms|translations):/iu;
const CACHE_SCHEMA_VERSION = 3;

function getCacheKey(word: string): string {
  return replaceSpaces(word).toLocaleLowerCase();
}

function stripHeading(line: string): string {
  return line.replace(/^=+\s*/, '').replace(/\s*=+$/, '').trim();
}

function isHeading(line: string): boolean {
  return /^=+\s*[^=].*[^=]\s*=+$/u.test(line.trim());
}

function cleanLine(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/^[-*]\s*/, '')
    .trim();
}

function splitLabels(definition: string): { labels: string[]; definition: string } {
  const labels: string[] = [];
  let nextDefinition = definition.trim();

  while (nextDefinition.startsWith('(')) {
    const closingIndex = nextDefinition.indexOf(')');
    if (closingIndex < 0) {
      break;
    }

    labels.push(...nextDefinition.slice(1, closingIndex).split(',').map((label) => label.trim()).filter(Boolean));
    nextDefinition = nextDefinition.slice(closingIndex + 1).trim();
  }

  return { labels, definition: nextDefinition };
}

function takeSectionText(lines: string[], startHeading: string, stopHeadings: Set<string>): string | undefined {
  const startIndex = lines.findIndex((line) => stripHeading(line) === startHeading);
  if (startIndex < 0) {
    return undefined;
  }

  const collected: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (isHeading(line) && stopHeadings.has(stripHeading(line))) {
      break;
    }
    const cleaned = cleanLine(line);
    if (cleaned) {
      collected.push(cleaned);
    }
  }

  return collected.join(' ').trim() || undefined;
}

function takeListSection(lines: string[], startHeading: string, limit = 16): string[] {
  const startIndex = lines.findIndex((line) => stripHeading(line) === startHeading);
  if (startIndex < 0) {
    return [];
  }

  const items: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (isHeading(line)) {
      break;
    }
    const cleaned = cleanLine(line);
    if (cleaned && !cleaned.endsWith(':')) {
      items.push(cleaned);
    }
    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function compactTerms(items: string[], limit = 16): string[] {
  const normalizedItems = items.map((item) => item.replace(/\([^)]*\)/gu, ' '));

  return [...new Set(normalizedItems
    .flatMap((item) => item.split(/[,;]/u))
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length < 52))]
    .slice(0, limit);
}

function takePronunciationItems(lines: string[]): string[] {
  const section = takeSectionText(
    lines,
    'Pronunciation',
    new Set([...POS_HEADINGS, ...LIST_SECTIONS, 'Alternative forms']),
  );
  if (!section) {
    return [];
  }

  const items: string[] = [];
  const enpr = section.match(/enPR:?\s*([^,]+?)(?=\s+(?:IPA|Homophone|Rhymes)\b|,|$)/u)?.[1]?.trim();
  if (enpr) {
    items.push(`enPR ${enpr}`);
  }

  const ipaMatches = [...section.matchAll(/\/[^/]+\/|\[[^\]]+\]/gu)]
    .map((match) => match[0].trim())
    .filter(Boolean);
  ipaMatches.slice(0, 4).forEach((ipa) => items.push(ipa));

  const homophone = section.match(/Homophone:\s*([^]+?)(?=\s+Rhymes:|$)/u)?.[1]?.trim();
  if (homophone) {
    items.push(`Homophone ${homophone}`);
  }

  const rhyme = section.match(/Rhymes:\s*([^, ]+)/u)?.[1]?.trim();
  if (rhyme) {
    items.push(`Rhyme ${rhyme}`);
  }

  return [...new Set(items)].slice(0, 8);
}

function normalizeWiktionaryExtract(word: string, extract: string): WiktionaryEntry {
  const lines = extract.split('\n').map((line) => line.trim()).filter(Boolean);
  const englishIndex = lines.findIndex((line) => stripHeading(line) === 'English');
  const nextLanguageIndex = lines.findIndex((line, index) => index > englishIndex && /^==\s*[^=].*[^=]\s*==$/u.test(line));
  const englishLines = englishIndex >= 0
    ? lines.slice(englishIndex + 1, nextLanguageIndex >= 0 ? nextLanguageIndex : undefined)
    : lines;
  const stopHeadings = new Set([...POS_HEADINGS, ...LIST_SECTIONS, 'Pronunciation', 'Alternative forms']);

  const forms: string[] = [];
  const senses: WiktionaryEntry['senses'] = [];
  let currentPos = '';
  englishLines.forEach((line) => {
    if (isHeading(line)) {
      const heading = stripHeading(line);
      currentPos = POS_HEADINGS.has(heading) ? heading : '';
      return;
    }

    if (!currentPos) {
      return;
    }

    const cleaned = cleanLine(line);
    if (!cleaned) {
      return;
    }

    if (cleaned.toLocaleLowerCase().startsWith(`${word.toLocaleLowerCase()} `)) {
      forms.push(cleaned);
      return;
    }

    if (INLINE_RELATION_PREFIX.test(cleaned)) {
      return;
    }

    const parsed = splitLabels(cleaned);
    if (parsed.definition.length > 12 && /[.!?]$/u.test(parsed.definition)) {
      senses.push({
        pos: currentPos,
        definition: parsed.definition,
        labels: parsed.labels,
      });
    }
  });

  const pageWord = replaceSpaces(word);
  return {
    word,
    language: 'English',
    etymology: takeSectionText(englishLines, 'Etymology', stopHeadings),
    pronunciations: takePronunciationItems(englishLines),
    alternativeForms: compactTerms(takeListSection(englishLines, 'Alternative forms', 8), 8),
    forms: [...new Set(forms)].slice(0, 6),
    senses: senses.slice(0, 12),
    synonyms: compactTerms(takeListSection(englishLines, 'Synonyms')),
    hypernyms: compactTerms(takeListSection(englishLines, 'Hypernyms')),
    hyponyms: compactTerms(takeListSection(englishLines, 'Hyponyms')),
    meronyms: compactTerms(takeListSection(englishLines, 'Meronyms')),
    holonyms: compactTerms(takeListSection(englishLines, 'Holonyms')),
    derivedTerms: compactTerms(takeListSection(englishLines, 'Derived terms')),
    relatedTerms: compactTerms(takeListSection(englishLines, 'Related terms')),
    descendants: compactTerms(takeListSection(englishLines, 'Descendants', 10), 10),
    seeAlso: compactTerms(takeListSection(englishLines, 'See also', 10), 10),
    sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(pageWord)}`,
  };
}

export default class WiktionaryService {
  public async getEntry(req: Request, res: Response): Promise<void> {
    const word = Array.isArray(req.params.word) ? req.params.word[0] : req.params.word;
    const normalizedWord = word.replace(/_+/g, ' ').trim();

    if (!normalizedWord) {
      res.status(400).json({ error: 'Missing word' });
      return;
    }

    const cacheKey = getCacheKey(normalizedWord);
    const cachedEntry = await WiktionaryCache.findById(cacheKey).lean();
    if (cachedEntry?.schemaVersion === CACHE_SCHEMA_VERSION) {
      res.setHeader('X-Cache', 'HIT');
      res.json(cachedEntry.found ? cachedEntry.entry : null);
      return;
    }

    const params = new URLSearchParams({
      action: 'query',
      titles: normalizedWord,
      prop: 'extracts',
      explaintext: '1',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      origin: '*',
    });

    try {
      const response = await fetch(`https://en.wiktionary.org/w/api.php?${params.toString()}`, {
        headers: {
          'User-Agent': 'lexical-graph/1.0 (local linguistic analysis app)',
        },
      });
      if (!response.ok) {
        res.status(response.status).json({ error: 'Wiktionary request failed' });
        return;
      }

      const payload = await response.json() as WikimediaExtractResponse;
      const page = payload.query?.pages?.[0];
      if (!page || page.missing || !page.extract) {
        await WiktionaryCache.updateOne(
          { _id: cacheKey },
          {
            $set: {
              query: normalizedWord,
              schemaVersion: CACHE_SCHEMA_VERSION,
              found: false,
              entry: null,
              fetchedAt: new Date(),
            },
          },
          { upsert: true },
        );
        res.setHeader('X-Cache', 'MISS');
        res.json(null);
        return;
      }

      const entry = normalizeWiktionaryExtract(page.title ?? normalizedWord, page.extract);
      await WiktionaryCache.updateOne(
        { _id: cacheKey },
        {
          $set: {
            query: normalizedWord,
            schemaVersion: CACHE_SCHEMA_VERSION,
            found: true,
            entry,
            fetchedAt: new Date(),
          },
        },
        { upsert: true },
      );
      res.setHeader('X-Cache', 'MISS');
      res.json(entry);
    } catch (error) {
      res.status(502).json({ error: 'Could not fetch Wiktionary entry' });
    }
  }
}
