import 'dotenv/config';
import Fastify from 'fastify';
import { AppError, ErrorCode } from './types/errors.js';
import { ConfigStore } from './services/configStore.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    base: {
      service: 'camillaeq-server',
    },
  },
  disableRequestLogging: true,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId',
  genReqId: () => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
});

// Request logging hook
server.addHook('onRequest', async (request, reply) => {
  request.log.info({
    method: request.method,
    url: request.url,
    requestId: request.id,
  }, 'Incoming request');
});

// Response logging hook
server.addHook('onResponse', async (request, reply) => {
  request.log.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    durationMs: reply.elapsedTime,
    requestId: request.id,
  }, 'Request completed');
});

// 404 handler for unmatched routes
server.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    error: {
      code: ErrorCode.ERR_NOT_FOUND,
      message: 'Resource not found',
      statusCode: 404,
    },
  });
});

// Error handler for structured error responses
server.setErrorHandler((error, request, reply) => {
  // Log the error
  request.log.error({
    err: error,
    requestId: request.id,
  }, 'Request error');

  // Handle AppError instances
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(error.toJSON());
  }

  // Handle 404 errors
  if (error.statusCode === 404) {
    return reply.status(404).send({
      error: {
        code: ErrorCode.ERR_NOT_FOUND,
        message: 'Resource not found',
        statusCode: 404,
      },
    });
  }

  // Handle validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: {
        code: ErrorCode.ERR_BAD_REQUEST,
        message: 'Validation error',
        statusCode: 400,
        details: error.validation,
      },
    });
  }

  // Generic error handler
  const statusCode = error.statusCode || 500;
  return reply.status(statusCode).send({
    error: {
      code: ErrorCode.ERR_INTERNAL_SERVER,
      message: isDevelopment ? error.message : 'Internal server error',
      statusCode,
    },
  });
});

// Health check endpoint
server.get('/health', async () => {
  return { status: 'ok' };
});

// Version endpoint
server.get('/api/version', async () => {
  return {
    version: '0.1.0',
    buildHash: process.env.BUILD_HASH || 'dev',
    buildTime: process.env.BUILD_TIME || new Date().toISOString(),
  };
});

// Initialize config store
const configStore = new ConfigStore();

// Get config endpoint
server.get('/api/config', async (request, reply) => {
  const config = await configStore.readConfig();
  return config;
});

// Put config endpoint
server.put('/api/config', async (request, reply) => {
  await configStore.writeConfig(request.body);
  return { success: true };
});

const start = async () => {
  try {
    const port = Number(process.env.SERVER_PORT) || 3000;
    const host = process.env.SERVER_HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    server.log.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
