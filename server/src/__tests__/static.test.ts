import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Tests for production static file serving and SPA fallback
 * 
 * Creates a temporary fixture directory to simulate client/dist
 * without requiring an actual build
 */
describe('Production Static Serving', () => {
  let server: FastifyInstance;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary fixture directory
    tempDir = join(__dirname, '__fixtures__', 'client-dist');
    await fs.mkdir(tempDir, { recursive: true });

    // Create minimal index.html
    await fs.writeFile(
      join(tempDir, 'index.html'),
      '<!DOCTYPE html><html><head><title>CamillaEQ</title></head><body><div id="app">Test</div></body></html>'
    );

    // Create a static asset
    await fs.writeFile(join(tempDir, 'test.txt'), 'static file content');

    // Create server with static serving (simulating production mode)
    server = Fastify({ logger: false });

    // Register minimal health route (to test API routes still work)
    server.get('/health', async () => ({ status: 'ok' }));

    // Register API route
    server.get('/api/test', async () => ({ data: 'api response' }));

    // Register static file serving
    await server.register(fastifyStatic, {
      root: tempDir,
      prefix: '/',
    });

    // SPA fallback
    server.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/health')) {
        reply.sendFile('index.html');
      } else {
        reply.status(404).send({
          error: {
            code: 'ERR_NOT_FOUND',
            message: 'Resource not found',
            statusCode: 404,
          },
        });
      }
    });

    await server.ready();
  });

  afterAll(async () => {
    await server.close();

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Static File Serving', () => {
    it('should serve index.html at root', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('<div id="app">Test</div>');
    });

    it('should serve static assets', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test.txt',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('static file content');
    });
  });

  describe('SPA Fallback', () => {
    it('should return index.html for unknown UI routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/some-page',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('<div id="app">Test</div>');
    });

    it('should return index.html for hash routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/#/eq',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should return index.html for nested routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/settings/audio',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
    });
  });

  describe('API Routes Still Work', () => {
    it('should return JSON for /health', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({ status: 'ok' });
    });

    it('should return JSON for /api/* routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({ data: 'api response' });
    });

    it('should return JSON 404 for unknown API routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/does-not-exist',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('ERR_NOT_FOUND');
    });

    it('should return JSON 404 for POST to unknown UI route', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/some-page',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });
  });
});
