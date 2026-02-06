import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { registerSettingsRoutes } from '../settings.js';

describe('Settings endpoint', () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    registerSettingsRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
  });

  it('should return null for both URLs when env vars are not set', async () => {
    delete process.env.CAMILLA_CONTROL_WS_URL;
    delete process.env.CAMILLA_SPECTRUM_WS_URL;

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      camillaControlWsUrl: null,
      camillaSpectrumWsUrl: null,
    });
  });

  it('should return valid WS URLs when env vars are set', async () => {
    process.env.CAMILLA_CONTROL_WS_URL = 'ws://localhost:3146';
    process.env.CAMILLA_SPECTRUM_WS_URL = 'ws://localhost:6413';

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      camillaControlWsUrl: 'ws://localhost:3146',
      camillaSpectrumWsUrl: 'ws://localhost:6413',
    });
  });

  it('should return null for invalid URLs (missing protocol)', async () => {
    process.env.CAMILLA_CONTROL_WS_URL = 'localhost:3146';
    process.env.CAMILLA_SPECTRUM_WS_URL = 'localhost:6413';

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      camillaControlWsUrl: null,
      camillaSpectrumWsUrl: null,
    });
  });

  it('should accept wss:// protocol', async () => {
    process.env.CAMILLA_CONTROL_WS_URL = 'wss://secure.example.com:3146';
    process.env.CAMILLA_SPECTRUM_WS_URL = 'wss://secure.example.com:6413';

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      camillaControlWsUrl: 'wss://secure.example.com:3146',
      camillaSpectrumWsUrl: 'wss://secure.example.com:6413',
    });
  });

  it('should handle domain names correctly', async () => {
    process.env.CAMILLA_CONTROL_WS_URL = 'ws://camillaeq.his.house:3146';
    process.env.CAMILLA_SPECTRUM_WS_URL = 'ws://camillaeq.his.house:6413';

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      camillaControlWsUrl: 'ws://camillaeq.his.house:3146',
      camillaSpectrumWsUrl: 'ws://camillaeq.his.house:6413',
    });
  });
});
