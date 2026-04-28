import { InferSchemaType, model, Schema } from 'mongoose';

export interface RelationType {
  rel: string;
  tgt: string;
}

const RelationSchema = new Schema({
  rel: String,
  tgt: String,
});

const SynsetSchema = new Schema({
  _id: String,
  pos: String,
  word: [String],
  edges: [RelationSchema],
  gloss: String,
});

export type SynsetType = InferSchemaType<typeof SynsetSchema> & { _id: string };

export default model<SynsetType>('Synset', SynsetSchema);
