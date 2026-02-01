import { FastifyInstance } from 'fastify';
import { ConfigsLibrary, type PipelineConfig } from '../services/configsLibrary.js';

export function registerConfigsRoutes(app: FastifyInstance): void {
  const configsLibrary = new ConfigsLibrary();

  // List all configs
  app.get('/api/configs', async (request, reply) => {
    const configs = await configsLibrary.listConfigs();
    return configs;
  });

  // Get specific config by ID
  app.get('/api/configs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const config = await configsLibrary.getConfig(id);
    return config;
  });

  // Save config by ID
  app.put('/api/configs/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['configName', 'filterArray'],
        properties: {
          configName: { type: 'string' },
          filterArray: { type: 'array' },
          accessKey: { type: 'string' },
          // Extended format fields
          title: { type: 'string' },
          description: { type: 'string' },
          filters: { type: 'object' },
          mixers: { type: 'object' },
          processors: { type: 'object' },
          pipeline: { type: 'array' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await configsLibrary.saveConfig(id, request.body as PipelineConfig);
    return { success: true };
  });
}
