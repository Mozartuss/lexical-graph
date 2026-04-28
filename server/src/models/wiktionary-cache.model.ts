import { InferSchemaType, model, Schema } from 'mongoose';

const WiktionarySenseSchema = new Schema({
  pos: String,
  definition: String,
  labels: [String],
}, { _id: false });

const WiktionaryEntrySchema = new Schema({
  word: String,
  language: String,
  etymology: String,
  pronunciations: [String],
  forms: [String],
  alternativeForms: [String],
  senses: [WiktionarySenseSchema],
  synonyms: [String],
  hypernyms: [String],
  hyponyms: [String],
  meronyms: [String],
  holonyms: [String],
  derivedTerms: [String],
  relatedTerms: [String],
  descendants: [String],
  seeAlso: [String],
  sourceUrl: String,
}, { _id: false });

const WiktionaryCacheSchema = new Schema({
  _id: String,
  query: String,
  schemaVersion: Number,
  found: Boolean,
  entry: WiktionaryEntrySchema,
  fetchedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  collection: 'wiktionary_cache',
});

WiktionaryCacheSchema.index({ fetchedAt: 1 });

export type WiktionaryCacheType = InferSchemaType<typeof WiktionaryCacheSchema> & { _id: string };

export default model<WiktionaryCacheType>('WiktionaryCache', WiktionaryCacheSchema);
