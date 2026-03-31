import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    return {
      ok: true,
      service: 'ai-novel-studio-server',
      timestamp: new Date().toISOString(),
    };
  });
}
