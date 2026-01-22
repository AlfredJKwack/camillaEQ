import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { AppError, ErrorCode } from '../types/errors.js';

// Create a test server instance (similar to main server but without starting)
function createTestServer() {
  const server = Fastify({
    logger: false, // Disable logging in tests
  });

  // Add 404 handler first (before error handler)
  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: ErrorCode.ERR_NOT_FOUND,
        message: 'Resource not found',
        statusCode: 404,
      },
    });
  });

  // Add error handler
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    if (error.statusCode === 404) {
      return reply.status(404).send({
        error: {
          code: ErrorCode.ERR_NOT_FOUND,
          message: 'Resource not found',
          statusCode: 404,
        },
      });
    }

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: {
        code: ErrorCode.ERR_INTERNAL_SERVER,
        message: error.message,
        statusCode,
      },
    });
  });

  // Add routes
  server.get('/health', async () => {
    return { status: 'ok' };
  });

  server.get('/api/version', async () => {
    return {
      version: '0.1.0',
      buildHash: process.env.BUILD_HASH || 'dev',
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
    };
  });

  return server;
}

describe('API Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = createTestServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /api/version', () => {
    it('should return 200 with version info', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/version',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('buildHash');
      expect(body).toHaveProperty('buildTime');
      expect(typeof body.version).toBe('string');
      expect(typeof body.buildHash).toBe('string');
      expect(typeof body.buildTime).toBe('string');
    });
  });

  describe('GET /invalid-route', () => {
    it('should return 404 with error structure', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/invalid-route',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('statusCode');
      expect(body.error.code).toBe(ErrorCode.ERR_NOT_FOUND);
      expect(body.error.statusCode).toBe(404);
    });
  });
});
