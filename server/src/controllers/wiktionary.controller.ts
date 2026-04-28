import { Application } from 'express';
import WiktionaryService from '../services/wiktionary.service';

export default class WiktionaryController {
  private wiktionaryService: WiktionaryService;

  constructor(private app: Application) {
    this.wiktionaryService = new WiktionaryService();
    this.routes();
  }

  public routes(): void {
    this.app.route('/api/wiktionary/:word')
      .get(this.wiktionaryService.getEntry.bind(this.wiktionaryService));
  }
}
