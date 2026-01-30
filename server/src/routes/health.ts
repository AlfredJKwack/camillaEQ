import { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => {
    return { status: 'ok' };
  });
}
