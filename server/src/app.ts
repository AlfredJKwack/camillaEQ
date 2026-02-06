import Fastify, { FastifyInstance } from 'fastify';
import { AppError, ErrorCode } from './types/errors.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

export function buildApp(): FastifyInstance {
  const app = Fastify({
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
    bodyLimit: 1 * 1024 * 1024, // 1MB payload limit
  });

  // Request logging hook
  app.addHook('onRequest', async (request, reply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      requestId: request.id,
    }, 'Incoming request');
  });

  // Read-only mode enforcement hook
  const isReadOnly = process.env.SERVER_READ_ONLY === 'true';
  if (isReadOnly) {
    app.addHook('onRequest', async (request, reply) => {
      // Only check API routes
      if (request.url.startsWith('/api/')) {
        // Block any non-safe HTTP methods
        const unsafeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
        if (unsafeMethods.includes(request.method)) {
          reply.status(403).send({
            error: {
              code: 'ERR_READ_ONLY',
              message: 'Server is in read-only mode. Write operations are not permitted.',
              statusCode: 403,
            },
          });
        }
      }
    });
    
    app.log.warn('SERVER_READ_ONLY mode enabled: all write operations to /api/* are blocked');
  }

  // Response logging hook
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime,
      requestId: request.id,
    }, 'Request completed');
  });

  // Error handler for structured error responses
  app.setErrorHandler((error, request, reply) => {
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

  return app;
}
