import 'dotenv/config';
import { buildApp } from './app.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerVersionRoutes } from './routes/version.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerStateRoutes } from './routes/state.js';
import { registerConfigsRoutes } from './routes/configs.js';

const start = async () => {
  try {
    const app = buildApp();
    
    // Register all routes
    registerHealthRoutes(app);
    registerVersionRoutes(app);
    registerConfigRoutes(app);
    registerStateRoutes(app);
    registerConfigsRoutes(app);
    
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
