import { InferSchemaType, model, Schema } from 'mongoose';

export const LemmaSchema = new Schema({
  _id: String,
  lemma: String,
  pos: String,
  synsets: [String],
});

export type LemmaType = InferSchemaType<typeof LemmaSchema> & { _id: string };

export default model<LemmaType>('Lemma', LemmaSchema);
