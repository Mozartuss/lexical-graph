import { Application } from 'express';

export default class Controller {
  constructor(private app: Application) {
    this.routes();
  }

  public routes(): void {
    this.app.get('/', (_req, res) => {
      res.json({ name: 'lexical-graph-api', status: 'ok' });
    });

    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
  }
}
