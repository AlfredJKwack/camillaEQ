import { FastifyInstance } from 'fastify';
import { ConfigStore } from '../services/configStore.js';

export function registerConfigRoutes(app: FastifyInstance): void {
  const configStore = new ConfigStore();

  // Get config endpoint
  app.get('/api/config', async (request, reply) => {
    const config = await configStore.readConfig();
    return config;
  });

  // Put config endpoint
  app.put('/api/config', {
    schema: {
      body: {
        type: 'object',
        required: ['devices', 'filters', 'mixers', 'pipeline'],
        properties: {
          devices: { type: 'object' },
          filters: { type: 'object' },
          mixers: { type: 'object' },
          pipeline: { type: 'array' },
          processors: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    await configStore.writeConfig(request.body);
    return { success: true };
  });
}
