import path from 'path';

export const PORT = Number(process.env.PORT ?? '8080');
export const MONGO_URL = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Wordnet';
// Drops the existing database and newly imports wordnet
export const DO_IMPORT_WORDNET = process.env.DO_IMPORT_WORDNET
  ? Boolean(parseInt(process.env.DO_IMPORT_WORDNET, 10))
  : false;
export const WORDNET_PATH = path.resolve(process.cwd(), 'data');
