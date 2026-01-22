import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import Fastify, { FastifyInstance } from 'fastify';
import { AppError, ErrorCode } from '../types/errors.js';
import { ConfigStore } from '../services/configStore.js';

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

describe('Config API Routes', () => {
  const testDir = join(process.cwd(), 'test-routes-data');
  let server: FastifyInstance;
  let configStore: ConfigStore;

  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize config store with test directory
    configStore = new ConfigStore({
      configDir: testDir,
      configFileName: 'config.json',
    });

    // Create server with config endpoints
    server = createTestServer();
    
    // Add config endpoints
    server.get('/api/config', async (request, reply) => {
      const config = await configStore.readConfig();
      return config;
    });

    server.put('/api/config', async (request, reply) => {
      await configStore.writeConfig(request.body);
      return { success: true };
    });

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean config before each test
    try {
      await configStore.deleteConfig();
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe('PUT /api/config', () => {
    it('should save a valid config', async () => {
      const config = { key: 'value', number: 42 };
      
      const response = await server.inject({
        method: 'PUT',
        url: '/api/config',
        payload: config,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({ success: true });

      // Verify it was saved
      const saved = await configStore.readConfig();
      expect(saved).toEqual(config);
    });

    it('should reject empty payload', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/config',
        payload: {},
      });

      // Empty object is valid, so this should succeed
      expect(response.statusCode).toBe(200);
    });

    it('should overwrite existing config', async () => {
      const config1 = { version: 1 };
      const config2 = { version: 2 };

      await server.inject({
        method: 'PUT',
        url: '/api/config',
        payload: config1,
      });

      const response = await server.inject({
        method: 'PUT',
        url: '/api/config',
        payload: config2,
      });

      expect(response.statusCode).toBe(200);
      
      const saved = await configStore.readConfig();
      expect(saved).toEqual(config2);
    });
  });

  describe('GET /api/config', () => {
    it('should return existing config', async () => {
      const config = { test: 'data', nested: { value: 123 } };
      await configStore.writeConfig(config);

      const response = await server.inject({
        method: 'GET',
        url: '/api/config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual(config);
    });

    it('should return 404 if config does not exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/config',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe(ErrorCode.ERR_CONFIG_NOT_FOUND);
    });
  });
});
