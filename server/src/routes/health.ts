import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import { join } from 'path';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => {
    const checks: Record<string, boolean> = {};
    
    // Check if config directory is writable
    try {
      const configDir = process.env.CONFIG_DIR || join(process.cwd(), 'server', 'data');
      const testFile = join(configDir, `.health-check-${Date.now()}.tmp`);
      
      await fs.writeFile(testFile, 'test', 'utf8');
      await fs.unlink(testFile);
      
      checks.configDirWritable = true;
    } catch (error) {
      checks.configDirWritable = false;
      app.log.warn({ error }, 'Health check: config directory not writable');
    }
    
    return { 
      status: 'ok',
      checks
    };
  });
}
