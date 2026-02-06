import 'dotenv/config';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';
import { buildApp } from './app.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerVersionRoutes } from './routes/version.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerStateRoutes } from './routes/state.js';
import { registerConfigsRoutes } from './routes/configs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const start = async () => {
  try {
    const app = buildApp();
    
    // Register all API routes first
    registerHealthRoutes(app);
    registerVersionRoutes(app);
    registerConfigRoutes(app);
    registerStateRoutes(app);
    registerConfigsRoutes(app);
    
    // In production, serve the built client from server/dist
    // The client/dist is copied to server/dist/client during build
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      // Resolve client dist relative to compiled server/dist
      // Build process copies client/dist to server/dist/client
      const clientDistPath = join(__dirname, 'client');
      
      app.log.info({ clientDistPath }, 'Serving static client build');
      
      // Register static file serving
      await app.register(fastifyStatic, {
        root: clientDistPath,
        prefix: '/',
      });
      
      // SPA fallback: serve index.html for non-API GET requests that don't match a file
      app.setNotFoundHandler((request, reply) => {
        // Only serve index.html for GET requests to non-API routes
        if (request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/health')) {
          reply.sendFile('index.html');
        } else {
          // API routes get JSON 404
          reply.status(404).send({
            error: {
              code: 'ERR_NOT_FOUND',
              message: 'Resource not found',
              statusCode: 404,
            },
          });
        }
      });
    } else {
      app.log.info('Development mode: client served by Vite dev server');
    }
    
    const port = Number(process.env.SERVER_PORT) || 3000;
    const host = process.env.SERVER_HOST || '0.0.0.0';
    
    await app.listen({ port, host });
    app.log.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
