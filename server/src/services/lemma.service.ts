import { Request, Response } from 'express';
import Lemma from '../models/lemma.model';
import { getPromisePerLemma, replaceUnderscores, splitGlossToExamples } from '../util/string.util';
import { Definition, LemmaDefinition, LemmaToDefinition, QueryDefinition } from './lemma.types';

const DEFAULT_SUGGESTION_LIMIT = 12;
const MAX_SUGGESTION_LIMIT = 25;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default class LemmaService {
  public getAllLemmata(req: Request, res: Response): void {
    Lemma.find({})
      .lean()
      .then((wordnet) => res.json(wordnet))
      .catch((error) => res.status(500).send(error));
  }

  public getSuggestions(req: Request, res: Response): void {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : DEFAULT_SUGGESTION_LIMIT;
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), MAX_SUGGESTION_LIMIT)
      : DEFAULT_SUGGESTION_LIMIT;

    if (rawQuery.length < 2) {
      res.json([]);
      return;
    }

    Lemma.find({ lemma: { $regex: `^${escapeRegex(rawQuery)}`, $options: 'i' } })
      .select({ _id: 0, lemma: 1, pos: 1, synsets: 1 })
      .sort({ lemma: 1, pos: 1 })
      .limit(limit)
      .lean()
      .then((lemmata) => res.json(lemmata.map(({ lemma, pos, synsets }) => ({
        lemma,
        pos,
        synsetCount: synsets?.length ?? 0,
      }))))
      .catch((error) => res.status(500).send(error));
  }

  /**
   * Replaces underscores with spaces in synset terms,
   * splits glosses into definitions and examples.
   */
  static formatGlosses(glosses: QueryDefinition): LemmaToDefinition {
    const lemmaToSynset = Object.create(null);
    glosses.forEach((lemmaInfo: LemmaDefinition) => {
      if (lemmaInfo.length > 0) {
        const posToGlosses = Object.create(null);
        const currentLemma = lemmaInfo[0].lemma;
        lemmaInfo.forEach(({ pos, synsets }: Definition) => {
          posToGlosses[pos] = synsets.map(({ gloss, terms }) => (
            {
              ...splitGlossToExamples(gloss),
              terms: terms
                .filter((term) => term !== currentLemma)
                .map((term) => replaceUnderscores(term)),
            }
          ));
        });
        lemmaToSynset[currentLemma] = posToGlosses;
      }
    });
    return lemmaToSynset;
  }

  static getAggregatedGlosses(lemma: string) {
    return Lemma.aggregate([
      { $match: { lemma } },
      { $unwind: '$synsets' },
      {
        $lookup: {
          from: 'synsets',
          let: { synsets: '$synsets' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$synsets'] } } },
            {
              $project: {
                _id: 0,
                gloss: 1,
                terms: '$word',
              },
            },
          ],
          as: 'synsetObjects',
        },
      },
      { $unwind: '$synsetObjects' },
      {
        $group: {
          _id: '$pos',
          lemma: { $first: '$lemma' },
          synsets: {
            $push: {
              gloss: '$synsetObjects.gloss',
              terms: '$synsetObjects.terms',
            },
          },
        },
      },
      {
        $project: {
          _id: 0, lemma: 1, pos: '$_id', synsets: 1,
        },
      },
      {
        $sort: {
          lemma: 1, pos: 1,
        },
      },
    ]);
  }

  public getGlosses(req: Request, res: Response): void {
    const word = Array.isArray(req.params.word) ? req.params.word[0] : req.params.word;
    const promises = getPromisePerLemma(word, [LemmaService.getAggregatedGlosses]);
    Promise.all(promises)
      .then((results) => {
        const filteredResults = results.filter((result) => result.length > 0);
        res.json(LemmaService.formatGlosses(filteredResults));
      })
      .catch((error) => {
        res.status(500).send(error);
      });
  }
}
