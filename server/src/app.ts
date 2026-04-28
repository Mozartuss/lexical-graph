import compression from 'compression';
import express, { Application } from 'express';
import mongoose from 'mongoose';
import { DO_IMPORT_WORDNET, MONGO_URL } from './constants/app.constants';
import LemmaController from './controllers/lemma.controller';
import Lemma from './models/lemma.model';
import Synset from './models/synset.model';
import Controller from './controllers/main.controller';
import SynsetController from './controllers/synset.controller';
import WiktionaryController from './controllers/wiktionary.controller';
import logger from './util/logger';
import importWordnet from './util/wordnet.util';

class App {
  public app: Application;

  public mainController: Controller;

  public lemmaController: LemmaController;

  public synsetController: SynsetController;

  public wiktionaryController: WiktionaryController;

  constructor() {
    this.app = express();
    this.setConfig();
    this.setMongoConfig();
    this.lemmaController = new LemmaController(this.app);
    this.synsetController = new SynsetController(this.app);
    this.wiktionaryController = new WiktionaryController(this.app);
    this.mainController = new Controller(this.app);
  }

  private setConfig(): void {
    this.app.use(compression());
    this.app.use(express.json());
  }

  private async bootstrapWordnetIfNeeded(): Promise<void> {
    const [lemmaCount, synsetCount] = await Promise.all([
      Lemma.estimatedDocumentCount(),
      Synset.estimatedDocumentCount(),
    ]);

    if (DO_IMPORT_WORDNET || lemmaCount === 0 || synsetCount === 0) {
      logger.info(`Bootstrapping WordNet data (lemmas=${lemmaCount}, synsets=${synsetCount})`);
      importWordnet();
    }
  }

  private setMongoConfig(): void {
    mongoose.connect(MONGO_URL)
      .then(async () => {
        logger.info('Connected to Mongo');
        await this.bootstrapWordnetIfNeeded();
      })
      .catch((err: Error) => logger.error(err));
  }
}

export default new App().app;
