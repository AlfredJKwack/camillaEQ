import { FastifyInstance } from 'fastify';

export function registerVersionRoutes(app: FastifyInstance): void {
  app.get('/api/version', async () => {
    return {
      version: '0.1.0',
      buildHash: process.env.BUILD_HASH || 'dev',
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
    };
  });
}
