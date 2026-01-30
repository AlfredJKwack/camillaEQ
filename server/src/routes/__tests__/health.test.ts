import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { registerHealthRoutes } from '../health.js';

describe('Health endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    registerHealthRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return status ok', async () => {
    
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
  });

  it('should include config directory writable check', async () => {
    
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('configDirWritable');
    expect(typeof body.checks.configDirWritable).toBe('boolean');
  });
});
