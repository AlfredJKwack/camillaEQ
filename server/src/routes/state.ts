import { FastifyInstance } from 'fastify';
import { ConfigStore } from '../services/configStore.js';

export function registerStateRoutes(app: FastifyInstance): void {
  const latestStateStore = new ConfigStore({
    configDir: './data',
    configFileName: 'latest_dsp_state.json',
  });

  // Get latest DSP state
  app.get('/api/state/latest', async (request, reply) => {
    const state = await latestStateStore.readConfig();
    return state;
  });

  // Put latest DSP state
  app.put('/api/state/latest', {
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
    await latestStateStore.writeConfig(request.body);
    return { success: true };
  });
}
